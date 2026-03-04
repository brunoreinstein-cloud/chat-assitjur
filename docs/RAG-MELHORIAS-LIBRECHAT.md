# Melhorias RAG inspiradas no LibreChat

Este documento lista melhorias aplicáveis ao pipeline RAG da base de conhecimento do projeto, com base na [documentação RAG do LibreChat](https://www.librechat.ai/docs/features/rag_api) e na [configuração RAG](https://www.librechat.ai/docs/configuration/rag_api), e no estado atual do nosso código.

---

## Estado atual do projeto

- **Pipeline RAG:** ingestão → vetorização → indexação → recuperação → geração (`lib/rag/`, `lib/ai/rag.ts`).
- **Backends:** pgvector (default), Qdrant opcional (`RAG_INDEX_BACKEND`, `RAG_RETRIEVAL_BACKEND`).
- **Chunking:** tamanho e overlap fixos em código (800 caracteres, 150 overlap).
- **Embeddings:** modelo fixo `openai/text-embedding-3-small` (1536 dimensões).
- **Recuperação:** top-k por similaridade cosseno; 12 chunks (24 para Redator); fallback para injeção direta quando não há texto ou chunks.
- **Transparência:** o prompt pede ao modelo para citar por id/título; a UI **não** exibe explicitamente “fontes utilizadas” por mensagem.

---

## Melhorias aplicáveis (inspiradas no LibreChat)

### 1. Configuração flexível (chunk size, overlap, modelo de embedding)

**LibreChat:** *"Flexible Configuration: It allows customization of various parameters such as chunk size, overlap, and embedding models."*

**No projeto:** Valores estão hardcoded em `lib/ai/rag.ts` (`CHUNK_SIZE`, `CHUNK_OVERLAP`, `EMBEDDING_MODEL_ID`).

**Melhoria:**

- Adicionar variáveis de ambiente (ou config) e usá-las no módulo de vetorização, por exemplo:
  - `RAG_CHUNK_SIZE` (default 800)
  - `RAG_CHUNK_OVERLAP` (default 150)
  - `RAG_EMBEDDING_MODEL` (default `openai/text-embedding-3-small`)
- Garantir que a dimensão do vetor (ex.: 1536) seja consistente com o modelo escolhido e com o schema pgvector/Qdrant.
- Documentar em `.env.example` e em `lib/ai/knowledge-base.md`.

**Impacto:** Permite ajustar custo/qualidade e trocar modelo de embedding sem alterar código.

---

### 2. Transparência e confiança — expor fontes ao utilizador

**LibreChat:** *"Transparency and trust: Users can access the model's sources, allowing them to verify the accuracy of the generated responses."*

**No projeto:** Os chunks usados são injetados no prompt e o modelo é instruído a citar por id/título; não há estrutura na resposta que indique “estas foram as fontes retornadas pelo RAG”.

**Melhoria:**

- Incluir no payload da resposta do chat (stream ou mensagem assistente) um campo opcional **`sources`** (ou `knowledgeSources`) com lista de `{ documentId, title }` (e opcionalmente `chunkId` ou trecho) dos documentos/chunks usados para essa resposta.
- Na UI do chat, mostrar uma secção “Fontes utilizadas” ou “Base de conhecimento usada” por mensagem do assistente quando `sources` existir.
- Manter o prompt a pedir citações explícitas; as “fontes” na UI complementam, não substituem.

**Impacto:** Aumenta confiança e permite verificação rápida da base usada em cada resposta.

---

### 3. Processamento assíncrono da indexação

**LibreChat:** *"Asynchronous Processing: The API supports asynchronous operations for improved performance and scalability."*

**No projeto:** Já existe `indexingStatus` (`pending` | `indexed` | `failed`), endpoint `POST /api/knowledge/index-pending` e opção “só guardar” (`skipVectorize`). A vetorização pode ser feita em background via esse endpoint ou job externo (ex.: Trigger.dev), mas não está obrigatoriamente desacoplada do request de upload.

**Melhoria:**

- Documentar claramente o fluxo “upload → guardar com `pending` → job/endpoint indexa depois” em `lib/ai/knowledge-base.md` e em docs de deploy.
- Opcional: em uploads com muitos ficheiros ou documentos grandes, **por defeito** criar documento como `pending` e responder imediatamente; um job (Trigger.dev ou cron) processa `index-pending` em lote. Isto reduz tempo de resposta do POST e evita timeouts.
- Manter fallback: quando não há chunks indexados, o chat continua a usar injeção direta (já implementado).

**Impacto:** Melhor escalabilidade e UX em uploads pesados.

---

### 4. Re-ranking opcional após recuperação

**LibreChat** foca em retrieval + geração; a nossa skill `rag-implementation` e a literatura RAG recomendam **reranking** para melhor precisão.

**No projeto:** Apenas top-k por similaridade cosseno; não há fase de rerank.

**Melhoria:**

- Introduzir uma etapa **opcional** de reranking após `getRelevantChunks` (ex.: manter top-24, rerank com cross-encoder ou modelo leve, devolver top-12).
- Configurável por env (ex.: `RAG_RERANK_ENABLED`, `RAG_RERANK_TOP_K`) para não alterar comportamento atual por defeito.
- Implementação pode ser: modelo local (sentence-transformers), API (ex.: Cohere Rerank) ou heurística (MMR para diversidade). Ver `.agents/skills/rag-implementation`.

**Impacto:** Melhor relevância dos trechos injetados no prompt, sobretudo com muitos documentos.

---

### 5. Reconhecimento de perguntas não respondíveis

**LibreChat:** *"Recognizing unanswerable questions: LLMs need to be explicitly trained to recognize questions they can't answer based on the available information."*

**No projeto:** O prompt em `lib/ai/prompts.ts` já instrui: *"Quando a informação for insuficiente para uma conclusão, diga explicitamente 'Não tenho informação suficiente para...'"* e regras anti-alucinação.

**Melhoria:**

- Reforçar no system prompt (ou nas instruções do agente) uma frase explícita: “Se a base de conhecimento anexada não contiver informação que responda à pergunta, diga que não tem informação suficiente e não invente.”
- Opcional: em cenários avançados, considerar um passo de “classificação” (a pergunta é respondível com o contexto?) antes da geração; por agora, a instrução explícita é o passo de menor esforço e alinhado ao LibreChat.

**Impacto:** Menos alucinações quando o utilizador pergunta fora do âmbito dos documentos.

---

### 6. Chunking semântico (melhoria futura)

**No projeto:** `knowledge-base.md` já menciona “chunking semântico” como melhoria futura. O LibreChat usa LangChain (Python), que oferece splitters por parágrafo/secção; no nosso stack (Node, AI SDK), o chunking é por tamanho + overlap.

**Melhoria:**

- Avaliar divisão por parágrafos ou por cabeçalhos (Markdown) antes de aplicar o split por tamanho, para evitar cortar frases ou teses no meio.
- Manter como melhoria de médio prazo; documentar em `docs/RAG-PIPELINE-SEPARATION.md` ou em `lib/ai/knowledge-base.md` como “Fase 2”.

**Impacto:** Chunks mais coerentes e potencialmente melhores embeddings/retrieval.

---

### 7. Resumo do que o LibreChat faz e nós já cobrimos

| Aspeto | LibreChat | Nosso projeto |
|--------|-----------|----------------|
| Indexação com embeddings | Sim (LangChain + PGVector) | Sim (`lib/rag/`, pgvector/Qdrant) |
| Busca semântica | Sim | Sim (cosine, top-k) |
| Respostas com contexto | Sim | Sim (RAG + fallback injeção direta) |
| Configuração (chunk, overlap, modelo) | Sim (env) | Parcial (valores em código) |
| Processamento assíncrono | Sim | Parcial (pending + index-pending; job opcional) |
| Transparência / fontes na UI | Sim | Não (apenas instrução de citar no prompt) |
| Múltiplos providers de embedding | Sim (OpenAI, HuggingFace, Ollama) | Não (apenas OpenAI via gateway) |

---

## Priorização sugerida

1. **Curto prazo:** (1) Configuração por env para chunk/overlap/modelo; (2) expor `sources` na resposta e mostrar “Fontes utilizadas” na UI.
2. **Médio prazo:** (3) Documentar e, se necessário, tornar mais padrão o fluxo assíncrono de indexação; (5) reforçar instrução “perguntas não respondíveis”.
3. **Quando houver tempo:** (4) Reranking opcional; (6) chunking semântico.

---

## Referências

- [LibreChat RAG API (features)](https://www.librechat.ai/docs/features/rag_api)
- [LibreChat RAG API (configuration)](https://www.librechat.ai/docs/configuration/rag_api)
- `lib/ai/knowledge-base.md` — base de conhecimento e RAG atuais
- `docs/RAG-PIPELINE-SEPARATION.md` — pipeline em etapas
- `.agents/skills/rag-implementation` — padrões RAG (rerank, chunking, vectores)
