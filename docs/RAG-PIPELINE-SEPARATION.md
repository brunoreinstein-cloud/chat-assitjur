# Separação do pipeline RAG

Este documento descreve a implantação de um pipeline RAG em **cinco etapas bem definidas**, permitindo escalar, trocar backends e executar partes em background (ex.: vetorização assíncrona).

---

## Visão geral

| Etapa | Nome | Responsabilidade | Entrada | Saída |
|-------|------|------------------|---------|--------|
| 1 | **Ingestão** | Upload + parse (extração de texto, OCR) | Ficheiros (PDF, DOCX, etc.) | Documento com `title`, `content`, metadados |
| 2 | **Vetorização** | Chunking + embeddings | Texto (ou `content` do documento) | Lista de `{ text, embedding }[]` |
| 3 | **Indexação** | Persistir vetores num store | `documentId` + chunks com embeddings | Chunks indexados (pgvector e/ou qdrant) |
| 4 | **Recuperação** | Busca por similaridade | Query do utilizador + ids de documentos | Chunks mais relevantes |
| 5 | **Geração** | Resposta do LLM | Contexto (chunks) + mensagens | Stream de resposta |

Fluxo atual (acoplado) vs desejado:

- **Antes:** Upload → parse → criar documento → chunk → embed → inserir no DB → (no chat) embed da pergunta → buscar chunks → gerar. Tudo em sequência no mesmo request onde aplicável.
- **Depois:** Cada etapa exposta como módulo/API; ingestão pode apenas guardar o documento e enfileirar vetorização; indexação pode escrever em pgvector e/ou qdrant; recuperação abstraída por backend; geração continua no chat.

---

## Implementação no projeto

### 1. Ingestão (upload + parse)

**Onde já existe:** `POST /api/knowledge/from-files`, `POST /api/files/upload` (extração em `runExtractionAndClassification`), `extractDocumentMetadata`.

**Separação:**

- **Módulo:** `lib/rag/ingestion.ts` (ou reutilizar apenas as funções existentes com um nome claro).
- **Função de ingestão “pura”:** recebe ficheiro (ou buffer + contentType) e devolve `{ title, content, metadata? }` sem criar documento na BD. A criação do `KnowledgeDocument` fica a cargo do caller (from-files, from-archivos, etc.).
- **Opção “só guardar”:** criar documento com `content` e **não** chamar vetorização no mesmo request; marcar documento como “pendente de vetorização” (ver fase 2) e deixar um job ou endpoint separado fazer a vetorização + indexação.

**Ficheiros a tocar:** `app/(chat)/api/knowledge/from-files/route.ts`, `app/(chat)/api/knowledge/from-archivos/route.ts`, `app/(chat)/api/knowledge/route.ts` (POST). Extrair a lógica de “parse + metadados” para uma função usada por todos.

---

### 2. Vetorização (embeddings)

**Onde já existe:** `lib/ai/rag.ts` — `chunkText`, `embedChunks` (AI SDK `embedMany`).

**Separação:**

- **Módulo:** `lib/rag/vectorization.ts`.
- **API:** `vectorizeContent(content: string) => Promise<ChunkWithEmbedding[]>`.
  - Internamente: `chunkText(content)` → `embedChunks(texts)` → retornar `{ text, embedding }[]`.
- Configuração (tamanho de chunk, overlap, modelo de embedding) concentrada neste módulo (ou em `lib/ai/rag.ts` e aqui re-exportada).

**Uso:** Chamado pela etapa de indexação ou por um job que processa documentos “pendentes de vetorização”.

---

### 3. Indexação (pgvector, qdrant)

**Onde já existe:** `insertKnowledgeChunks`, `deleteChunksByKnowledgeDocumentId` em `lib/db/queries.ts`; tabela `KnowledgeChunk` com pgvector.

**Separação:**

- **Interface:** `lib/rag/indexing.ts` — tipo `VectorIndexBackend` com:
  - `indexChunks(documentId: string, chunks: ChunkWithEmbedding[]): Promise<void>`
  - `deleteByDocumentId(documentId: string): Promise<void>`
- **Implementações:**
  - **PgVectorIndex:** usa as queries existentes (inserir em `KnowledgeChunk`, apagar por `knowledgeDocumentId`). Mantém `knowledgeDocumentId` e `chunkIndex` para compatibilidade com recuperação atual.
  - **QdrantIndex (futuro):** cliente Qdrant; collection por tenant ou global com filtro por `userId`/`documentId`; mesmo contrato `indexChunks` / `deleteByDocumentId`.

Configuração (qual backend usar) pode ser `RAG_INDEX_BACKEND=pgvector` ou `qdrant` (e depois híbrido se quiser).

---

### 4. Recuperação (RAG)

**Onde já existe:** `getRelevantChunks` em `lib/db/queries.ts`, `embedQuery` em `lib/ai/rag.ts`; no chat usa-se o embedding da última mensagem do utilizador e busca top-k por similaridade (cosine).

**Separação:**

- **Módulo:** `lib/rag/retrieval.ts`.
- **Interface:** `VectorRetrievalBackend` com:
  - `getRelevantChunks(params: { userId, documentIds, queryEmbedding, limit, allowedUserIds? }): Promise<RetrievalChunk[]>`
- **Implementações:**
  - **PgVectorRetrieval:** usa `getRelevantChunks` e schema atual (`id`, `text`, `knowledgeDocumentId`, `title`).
  - **QdrantRetrieval (futuro):** mesma assinatura; query ao Qdrant com filtros e top-k; formato de retorno igual (`text`, `title`, etc.) para o chat não precisar de mudar.

**Serviço de recuperação:** Uma função de alto nível `retrieveKnowledgeContext({ userId, documentIds, queryText, limit, allowedUserIds? })` que:
1. Gera o embedding da query (`embedQuery(queryText)`).
2. Chama o backend de recuperação configurado.
3. Devolve os chunks formatados para injetar no prompt (ou string já montada).

O chat passa a usar apenas esta função em vez de chamar `embedQuery` + `getRelevantChunks` diretamente.

---

### 5. Geração (LLM)

**Onde já existe:** `app/(chat)/api/chat/route.ts` — montagem do `knowledgeContext` (RAG ou fallback para conteúdo integral) e `streamText` com system prompt.

**Separação:**

- Nenhuma alteração estrutural forte: a geração continua no route do chat.
- A única mudança é que o **contexto** vem da etapa de recuperação (abstração acima), não de chamadas diretas a `getRelevantChunks` e `embedQuery`. Assim, trocar pgvector por qdrant (ou usar os dois) não exige alterar o route.

---

## Ordem de implementação sugerida

1. **Tipos e vetorização**  
   - Criar `lib/rag/types.ts` (ex.: `ChunkWithEmbedding`, `RetrievalChunk`).  
   - Criar `lib/rag/vectorization.ts` que usa `chunkText` e `embedChunks` de `lib/ai/rag.ts`.

2. **Indexação**  
   - Criar `lib/rag/indexing.ts` com interface `VectorIndexBackend` e implementação `PgVectorIndex` (usa `insertKnowledgeChunks`, `deleteChunksByKnowledgeDocumentId`).

3. **Recuperação**  
   - Criar `lib/rag/retrieval.ts` com interface `VectorRetrievalBackend` e implementação `PgVectorRetrieval` (usa `getRelevantChunks`), mais função `retrieveKnowledgeContext` que usa `embedQuery` e o backend.

4. **Pipeline unificado (opcional)**  
   - `lib/rag/pipeline.ts`: por exemplo `vectorizeAndIndex(documentId, content)` que chama vetorização + indexação. As rotas POST knowledge e from-files passam a usar esta função em vez de repetir chunk+embed+insert.

5. **Ingestão**  
   - Extrair “parse + metadados” para `lib/rag/ingestion.ts` (ou helpers) e usar em from-files, from-archivos e POST /api/knowledge.

6. **Chat**  
   - No `route.ts` do chat, substituir chamadas diretas a `embedQuery` e `getRelevantChunks` por `retrieveKnowledgeContext` (que internamente usa o backend de recuperação configurado).

7. **Fase 2 (opcional)**  
   - Estado “pendente de vetorização” no documento (migração + campo em `KnowledgeDocument`).  
   - Job (ex.: Trigger.dev) que lê documentos pendentes, chama `vectorizeAndIndex` e marca como indexado.  
   - Backend Qdrant: implementar `QdrantIndex` e `QdrantRetrieval` e escolher via `RAG_INDEX_BACKEND` / `RAG_RETRIEVAL_BACKEND`.

---

## Ficheiros novos / alterados (resumo)

| Ficheiro | Ação |
|----------|------|
| `docs/RAG-PIPELINE-SEPARATION.md` | Este documento. |
| `lib/rag/types.ts` | Tipos partilhados (chunks, retorno de recuperação). |
| `lib/rag/vectorization.ts` | `vectorizeContent(content)` usando rag.ts. |
| `lib/rag/indexing.ts` | Interface + `PgVectorIndex`. |
| `lib/rag/retrieval.ts` | Interface + `PgVectorRetrieval` + `retrieveKnowledgeContext`. |
| `lib/rag/pipeline.ts` | (Opcional) `vectorizeAndIndex(documentId, content)`. |
| `lib/rag/ingestion.ts` | (Opcional) helpers de parse/metadados para ficheiros. |
| `app/(chat)/api/knowledge/route.ts` | POST usa pipeline (vectorizeAndIndex). |
| `app/(chat)/api/knowledge/from-files/route.ts` | Usa ingestão + pipeline. |
| `app/(chat)/api/knowledge/from-archivos/route.ts` | Usa pipeline. |
| `app/(chat)/api/chat/route.ts` | Usa `retrieveKnowledgeContext` em vez de embed + getRelevantChunks. |
| `app/(chat)/api/knowledge/index-pending/route.ts` | **Novo.** POST: processa documentos com `indexingStatus = 'pending'` (vetoriza + indexa). Query: `?limit=N&onlyMine=false` (opcional). |
| `lib/rag/ingestion.ts` | **Novo.** `ingestFromBuffer`, `ingestFromContent` (parse + metadados). Usado por from-files e from-archivos. |
| `lib/rag/qdrant-indexing.ts` | **Novo.** `QdrantIndex` (indexação em Qdrant). |
| `lib/rag/qdrant-retrieval.ts` | **Novo.** `QdrantRetrieval` (recuperação em Qdrant). |
| `scripts/seed-redator-banco.ts` | Usar pipeline ou vectorization + indexing. |

---

## Variáveis de ambiente

- **Ingestão "só guardar":** não requer env; usar `skipVectorize: true` no body (POST /api/knowledge, from-archivos) ou campo form `skipVectorize` (from-files). Documentos ficam com `indexingStatus = 'pending'`; processar via `POST /api/knowledge/index-pending` ou job (ex.: Trigger.dev).
- **Indexação/Recuperação:**
  - `RAG_INDEX_BACKEND` — `pgvector` (default) | `qdrant`
  - `RAG_RETRIEVAL_BACKEND` — `pgvector` (default) | `qdrant`
  - `RAG_MIN_SIMILARITY` — opcional; valor 0–1 (ex.: 0.25). Só devolve chunks com similaridade >= este valor. Ver `docs/TEMPLATE-RAG-VERCEL-ANALISE.md`.
  - Para Qdrant: `QDRANT_URL` (obrigatório), `QDRANT_API_KEY` (opcional)

---

## Referências

- `lib/ai/knowledge-base.md` — base de conhecimento e RAG atuais.
- `lib/ai/rag.ts` — chunking e embeddings.
- `.agents/skills/rag-implementation` — padrões RAG (chunking, vectores, reranking).
