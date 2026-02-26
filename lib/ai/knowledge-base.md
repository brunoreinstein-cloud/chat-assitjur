# Base de conhecimento

## Implementação atual (injeção direta)

- **Tabela:** `KnowledgeDocument` (id, userId, title, content, createdAt).
- **API:** `GET /api/knowledge` (listar), `GET /api/knowledge?ids=...` (buscar por ids), `POST /api/knowledge` (criar), `DELETE /api/knowledge?id=...` (remover).
- **Chat:** O cliente pode enviar `knowledgeDocumentIds` no body do `POST /api/chat`. O servidor busca os documentos do usuário, concatena título e conteúdo e injeta no system prompt em "Base de conhecimento".
- **UI:** Botão "Base de conhecimento" no header do chat permite selecionar quais documentos usar como contexto (máx. 20).

Limitação: todo o conteúdo dos documentos selecionados vai no prompt. Para muitas ou longas páginas, pode estourar contexto ou custo. Para busca por relevância (só trechos relacionados à pergunta), use RAG abaixo.

---

## Evolução: RAG com embeddings

Para **busca semântica** (retornar só os trechos mais relevantes à pergunta):

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
