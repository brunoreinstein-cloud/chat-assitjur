# Base de conhecimento

A **base de conhecimento** é comum a **todos os agentes** (Revisor de Defesas, Redator de Contestações, etc.). Os documentos que o utilizador selecionar são injetados no system prompt e usados como contexto em qualquer conversa, por exemplo:

- **@bancodetese** — teses e precedentes (Revisor de Defesas: quadro de teses na Avaliação da Defesa).
- **Templates AssistJur.IA Master** — estrutura de relatórios (Relatório Processual Master, Carta de Prognóstico, DPSP, etc.). Os ficheiros oficiais em texto ficam em `lib/ai/templates/assistjur/`; o utilizador pode importá-los para a Base de conhecimento e selecioná-los no chat. O agente usa o conteúdo como estrutura obrigatória ao preencher relatórios. Ver `lib/ai/templates/assistjur/README.md`.
- **Outros contextos** — cláusulas-modelo, jurisprudência, normas internas, etc., conforme o agente ativo.

O assistente usa por padrão as instruções do **Agente Revisor de Defesas Trabalhistas** (auditor jurídico sênior — contencioso trabalhista). As instruções completas estão em `lib/ai/agent-revisor-defesas.ts`. Se o utilizador não enviar "Instruções do agente" no chat, o backend aplica esse bloco automaticamente.

---

## Implementação atual (injeção direta)

- **Extração inteligente de metadados:** Ao criar documentos a partir de ficheiros (`POST /api/knowledge/from-files`) ou ao fazer upload para o chat (`POST /api/files/upload`), a IA extrai automaticamente título, autor, tipo de documento e informações-chave do texto (módulo `lib/ai/extract-metadata.ts`). O título sugerido pela IA é usado como título do documento na base de conhecimento; a resposta inclui opcionalmente `metadata` (author, documentType, keyInfo) e no upload `extractedMetadata`.
- **Tabelas:** `KnowledgeDocument` (id, userId, folderId, title, content, createdAt); `KnowledgeFolder` (id, userId, parentId, name, createdAt).
- **API:** `GET /api/knowledge` (listar; opcional `?folderId=uuid` ou `?folderId=root`; `?recent=N` para últimos N documentos), `GET /api/knowledge?ids=...` (buscar por ids), `POST /api/knowledge` (criar; body opcional `folderId`), `PATCH /api/knowledge/[id]` (atualizar doc, ex. folderId), `DELETE /api/knowledge?id=...` (remover). Pastas: `GET/POST /api/knowledge/folders`, `PATCH/DELETE /api/knowledge/folders/[id]`.
- **Chat:** O cliente pode enviar `knowledgeDocumentIds` no body do `POST /api/chat`. O servidor busca os documentos do usuário, concatena título e conteúdo e injeta **sempre no system prompt** (secção "Base de conhecimento"), nunca na mensagem do utilizador — assim o contexto RAG/docs não infla `message.parts` nem dispara validação Zod por tamanho.
- **UI:** Botão "Base de conhecimento" no header do chat permite selecionar quais documentos usar como contexto (máx. 50). É possível **importar múltiplos ficheiros** (até 50 por pedido, enviados em lotes se for mais) e **importar uma pasta** (botão «Importar pasta»: o browser devolve todos os ficheiros da pasta; só são aceites PDF, DOC, DOCX, JPEG, PNG até 100 MB).

**Comportamento no chat (RAG quando possível):**
- Se a última mensagem do utilizador tiver **texto** e os documentos selecionados tiverem **chunks indexados** (embeddings), o chat usa **RAG**: faz embedding do texto, busca os chunks mais relevantes por similaridade (cosine) e injeta só esses trechos no prompt. Isso reduz ruído, custo de tokens e risco de alucinação (o modelo vê apenas trechos relevantes).
- **Limite de chunks:** 12 por defeito; **24** quando o agente é o Redator de Contestações (mais cobertura de teses para pedidos genéricos).
- **Threshold de similaridade (opcional):** Se a variável de ambiente `RAG_MIN_SIMILARITY` estiver definida (valor entre 0 e 1, ex.: `0.25` ou `0.3`), só são devolvidos chunks cuja similaridade com a pergunta seja >= esse valor. Reduz ruído quando há muitos chunks pouco relevantes. Ver `docs/TEMPLATE-RAG-VERCEL-ANALISE.md`.
- **Fallback:** Se não houver texto na mensagem, ou o embedding falhar, ou não existirem chunks para os documentos, usa **injeção direta** (conteúdo integral dos documentos selecionados, até o limite `MAX_KNOWLEDGE_CONTEXT_CHARS`).
- As instruções do agente (ex.: Redator) incluem regras de **anti-alucinação** (usar apenas o que consta na base de conhecimento; não inventar teses nem jurisprudência).

**Banco de Teses Padrão do Redator (RAG):** O agente Redator de Contestações dispõe de um documento "sistema" (Banco de Teses Padrão) guardado na base de conhecimento. Quando o utilizador **não** seleciona documentos na sidebar, o backend injeta automaticamente esse documento e usa RAG (chunks relevantes) para preencher a secção "Base de conhecimento". Assim o Redator pode operar em Modo 2 sem o utilizador anexar nada. O conteúdo do banco está em `lib/ai/banco-teses-redator.md`. Após migrações, executar **`pnpm run db:seed-redator-banco`** para criar o documento e indexar os chunks (requer POSTGRES_URL e API de embeddings).

---

## RAG com embeddings (implementado)

**Implementação:** Tabela `KnowledgeChunk` (id, knowledgeDocumentId, chunkIndex, text, embedding vector(1536)); extensão pgvector; chunking e embeddings no POST /api/knowledge; no chat, embedding da última mensagem do utilizador e busca top-k por similaridade (cosine); fallback para injeção direta. O pipeline está separado em etapas (ingestão, vetorização, indexação, recuperação, geração): ver **`docs/RAG-PIPELINE-SEPARATION.md`** e módulos em `lib/rag/` (vectorization, indexing, retrieval, pipeline). APIs e chat usam `vectorizeAndIndex` e `retrieveKnowledgeContext`.

**Melhorias a partir do template Internal Knowledge Base (Vercel):** O template [ai-sdk-preview-internal-knowledge-base](https://github.com/vercel-labs/ai-sdk-preview-internal-knowledge-base) usa Language Model Middleware, classificação da mensagem (só RAG para "question") e **HyDE** (embedding de uma resposta hipotética em vez da pergunta). Análise completa e recomendações em **`docs/TEMPLATE-INTERNAL-KNOWLEDGE-BASE-ANALISE.md`**. Resumo: (1) **HyDE opcional** (`RAG_USE_HYDE`) para melhor recall; (2) **classificação "só RAG para perguntas"** opcional para reduzir custo em afirmações/comandos; (3) manter injeção no system prompt (não na mensagem do user).

Para **melhorias futuras** (reranking, chunking semântico):

1. **Chunking:** Dividir cada `KnowledgeDocument` em pedaços (ex.: 500–1000 tokens com overlap). Guardar no DB ou em tabela `knowledge_chunk` (documentId, chunkIndex, text, embedding?).

2. **Embeddings:** Ao criar/atualizar documento, gerar embeddings por chunk com o AI SDK:
   - `import { embedMany } from 'ai';`
   - Modelo de embedding via gateway (ex.: `openai/text-embedding-3-small`) ou provider compatível.
   - Guardar vetor em coluna `embedding vector(1536)` (pgvector) ou usar serviço externo (Pinecone, Upstash, etc.).

3. **Vercel Postgres + pgvector:** Se usar Vercel Postgres, habilitar extensão `vector` e criar índice HNSW/IVFFlat na coluna de embedding. Migration exemplo:
   - `CREATE EXTENSION IF NOT EXISTS vector;`
   - `ALTER TABLE knowledge_chunk ADD COLUMN embedding vector(1536);`
   - Índice para `ORDER BY embedding <-> $query_embedding LIMIT k`.

4. **No chat:** Antes de chamar `streamText`:
   - Gerar embedding da última mensagem do usuário (ou da pergunta).
   - Buscar top-k chunks por similaridade (cosine ou distância no pgvector).
   - Montar `knowledgeContext` só com o texto desses chunks e passar para `systemPrompt({ ..., knowledgeContext })`.

5. **Referências:** [AI SDK – embedMany](https://sdk.vercel.ai/docs/reference/ai-sdk-core/embed-many), [pgvector](https://github.com/pgvector/pgvector).

---

## Skills para implementação RAG

Ao implementar o RAG (chunking, embeddings, busca por similaridade), use as **Agent Skills** do projeto:

- **rag-implementation** (`.agents/skills/rag-implementation`) — padrões e passos para chunking, embeddings e busca por relevância.
- **ai-sdk** (`.agents/skills/ai-sdk`) — uso de `embedMany`, providers e integração com `streamText`.

Consultar também [docs/SKILLS_REPORT.md](../docs/SKILLS_REPORT.md) e [.agents/SKILLS_ARCHITECTURE.md](../.agents/SKILLS_ARCHITECTURE.md) para o mapa de skills e tarefas.

---

## Barra lateral e Document Organizer (proposta)

Migração da UI do modal para **barra lateral direita** ao chat, com **organização por pastas** e conceito **Document Organizer** (extrair, organizar, rastrear documentos). Especificação completa, checklist Web Interface Guidelines e fases de implementação em **[docs/KNOWLEDGE-BASE-SIDEBAR-DOCUMENT-ORGANIZER.md](../docs/KNOWLEDGE-BASE-SIDEBAR-DOCUMENT-ORGANIZER.md)**.
