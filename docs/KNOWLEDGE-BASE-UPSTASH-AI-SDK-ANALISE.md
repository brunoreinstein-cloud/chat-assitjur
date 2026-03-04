# Análise: Knowledge Base Agent, Upstash Search e template Vercel

Este documento resume o que os recursos externos oferecem, o que o projeto **já tem** e o que **podemos implementar**, com vantagens e trade-offs.

**Recursos analisados:**

- [AI SDK Cookbook – Knowledge Base Agent](https://ai-sdk.dev/cookbook/node/knowledge-base-agent) (Upstash Search + ferramentas)
- [Upstash Search – Getting Started](https://upstash.com/docs/search/overall/getstarted)
- [Vercel – ai-sdk-preview-internal-knowledge-base](https://github.com/vercel-labs/ai-sdk-preview-internal-knowledge-base)
- [Vercel Template – Internal Knowledge Base](https://vercel.com/templates/next.js/ai-sdk-internal-knowledge-base)

---

## 1. O que o projeto já tem

| Área | Implementação atual |
|------|---------------------|
| **Armazenamento** | PostgreSQL (Drizzle) – `KnowledgeDocument`, `KnowledgeChunk` (pgvector) |
| **RAG** | `retrieveKnowledgeContext()`: embedding da última mensagem → top-k chunks por similaridade (cosine) → injeção no system prompt |
| **Fallback** | Se não houver texto, embedding falhar ou não houver chunks indexados → injeção direta do conteúdo integral dos documentos |
| **Pipeline** | Ingestão → Vetorização (chunk + embed) → Indexação (pgvector / Qdrant opcional) → Recuperação → Geração (ver `docs/RAG-PIPELINE-SEPARATION.md`) |
| **UX** | Utilizador escolhe até 50 documentos por ID; o servidor decide automaticamente RAG vs injeção direta |

Ou seja: **RAG com pgvector já está implementado**; o contexto é obtido **uma vez** por turno (embed da última mensagem + busca top-k), sem ferramentas de “pesquisar base” expostas ao modelo.

---

## 2. O que os recursos externos propõem

### 2.1 AI SDK Cookbook – Knowledge Base Agent

- **Upstash Search** como índice: semantic search, full-text, **reranking** e **embedding integrado** (não é obrigatório usar API externa para embeddings).
- **Ferramentas (tools)** dadas ao modelo:
  - `searchKnowledge`: pesquisar na base com uma query e limite; resultados com reranking.
  - `addResource`: adicionar novo recurso à base.
  - `deleteResource`: remover recurso por ID.
- O **agente** (loop com `generateText` + `stopWhen: stepCountIs(5)`) decide **quando** chamar cada ferramenta (pesquisar várias vezes, adicionar, apagar).

### 2.2 Upstash Search

- Serviço serverless de busca: índices, upsert de documentos (content + metadata), pesquisa por query.
- Suporta: **input enrichment**, **reranking**, **semantic search**, **full-text search**.
- Embedding pode ser feito pelo próprio Upstash (evita chamadas a OpenAI/outros para indexação).

### 2.3 Template Vercel – Internal Knowledge Base

- Usa **Language Model Middleware** do AI SDK para fazer RAG e guardrails **à volta** da chamada ao modelo.
- Stack: Next.js, AI SDK, Vercel Blob, Postgres.
- O “middleware” encaixa a recuperação de contexto (e possivelmente validações) antes da geração.

No nosso projeto, o fluxo do chat já faz algo parecido: antes de `streamText`, chamamos `retrieveKnowledgeContext` e injetamos o resultado no system prompt. A ideia do template é formalizar isso com a API de middleware do AI SDK, se existir.

---

## 3. O que podemos implementar e vantagens

### 3.1 Upstash Search como backend de recuperação (opcional)

**O quê:** Um novo backend de recuperação (ex.: `lib/rag/upstash-retrieval.ts`) que use Upstash Search em vez de (ou além de) pgvector.

**Vantagens:**

- **Reranking** integrado → melhor relevância dos trechos.
- **Embedding integrado** → menos dependência de API de embeddings para indexação (e possivelmente custo menor).
- Serviço **serverless** → menos gestão de infraestrutura.
- **Semantic + full-text** na mesma API.

**Trade-offs:**

- Novo fornecedor e variáveis de ambiente (`UPSTASH_SEARCH_REST_URL`, `UPSTASH_SEARCH_REST_TOKEN`).
- Dados em dois sítios (Postgres para documentos/pastas; Upstash para índice de busca), ou migração parcial.
- Custo Upstash vs custo de embeddings + Postgres.

**Implementação sugerida:**  
Interface `VectorRetrievalBackend` já existe; adicionar `upstashRetrieval` e escolher via env (ex.: `RAG_RETRIEVAL_BACKEND=upstash`). Opcionalmente, pipeline de indexação que faça upsert dos chunks no Upstash ao criar/atualizar documentos.

---

### 3.2 Ferramentas “Knowledge Base” para o agente (estilo cookbook)

**O quê:** Expor ao modelo ferramentas como:

- `searchKnowledgeBase`: recebe `query` (e opcionalmente `limit`); chama `retrieveKnowledgeContext` (ou Upstash) e devolve os trechos formatados.
- Opcionalmente: `addResourceToKnowledgeBase` e `deleteResourceFromKnowledgeBase` (com regras de permissão por utilizador).

**Vantagens:**

- O modelo pode **fazer várias pesquisas** com queries diferentes no mesmo turno (ex.: uma para teses, outra para jurisprudência).
- Pode **refinar** a pergunta e pesquisar de novo.
- Se implementarmos add/delete: o agente pode propor adicionar/remover conteúdo à base durante a conversa (com confirmação do utilizador).

**Trade-offs:**

- Mais **chamadas de ferramentas** → mais latência e mais custo (tokens de tool call + respostas).
- É preciso **restringir** as ferramentas aos documentos do utilizador (e ao limite de 50 docs) para não fugir ao modelo atual de segurança.

**Implementação sugerida:**  
Criar tools em `lib/ai/tools/` (ex.: `search-knowledge-base.ts`) que recebam `userId`, `documentIds` (ou derivem do chat) e chamem `retrieveKnowledgeContext`; registrar essas tools no `route.ts` do chat junto das restantes. Manter o fluxo atual de “RAG automático” como **default** (uma pesquisa implícita por turno) e usar as tools quando quisermos um agente que “decide quando pesquisar”.

---

### 3.3 Reranking (sem mudar para Upstash)

**O quê:** Depois da busca por similaridade (pgvector), aplicar um passo de **reranking** (ex.: Cohere Rerank, ou modelo local) e devolver só os top-N reranked.

**Vantagens:**

- Melhora a **relevância** dos trechos injetados no prompt.
- Pode reduzir ruído e alucinação ao dar menos chunks mas mais precisos.

**Trade-offs:**

- Custo e latência adicionais (chamada a API de rerank ou inferência local).
- Integração e manutenção de mais um serviço.

**Implementação sugerida:**  
Em `lib/rag/retrieval.ts`, após `getRelevantChunks`, chamar um módulo `rerankChunks(query, chunks, topK)` e usar o resultado em `retrieveKnowledgeContext`. Opcional: flag ou env para ativar/desativar reranking.

---

### 3.4 Language Model Middleware (template Vercel)

**O quê:** Estruturar o fluxo do chat com a API de **Language Model Middleware** do AI SDK (se disponível na versão em uso), para que “RAG + guardrails” aconteçam num middleware à volta do modelo.

**Vantagens:**

- **Separação clara** entre “preparar contexto / validar” e “gerar resposta”.
- Alinhamento com padrões e exemplos Vercel; possível reutilização de código do template.

**Trade-offs:**

- Depende da API de middleware do AI SDK e da forma como o template está implementado (vale a pena inspecionar o repositório quando estável).
- Pode exigir refatoração do `route.ts` atual.

**Implementação sugerida:**  
Consultar a documentação do AI SDK sobre [Language Model Middleware](https://sdk.vercel.ai/docs/ai-sdk-core/middleware#language-model-middleware) e o código do [repositório do template](https://github.com/vercel-labs/ai-sdk-preview-internal-knowledge-base); depois extrair a lógica de “buscar contexto RAG + montar system prompt” para um middleware que envolva o modelo usado em `streamText`.

---

## 4. Resumo e priorização sugerida

| Ideia | Impacto | Esforço | Prioridade sugerida |
|-------|--------|--------|----------------------|
| **Reranking** (com pgvector atual) | Melhor relevância | Médio | Alta (melhora direta do RAG atual) |
| **Ferramentas searchKnowledgeBase** | Agente pode pesquisar várias vezes com queries distintas | Médio | Média (útil para fluxos avançados) |
| **Upstash Search como backend** | Reranking + embeddings integrados, menos gestão | Alto (novo backend + sync) | Média/Baixa (conforme necessidade de reduzir custo de embeddings ou adoptar Upstash) |
| **Middleware (template Vercel)** | Código mais limpo, alinhado com referências | Médio | Baixa (refatoração quando a API estiver estável) |

Recomendação prática: **começar por reranking** (com o backend atual) e, em seguida, **avaliar ferramentas de pesquisa** para o agente; Upstash e middleware podem ser passos posteriores conforme a evolução do produto e da stack.

---

## 5. Referências

- [AI SDK – Knowledge Base Agent (Upstash)](https://ai-sdk.dev/cookbook/node/knowledge-base-agent)
- [Upstash Search – Getting Started](https://upstash.com/docs/search/overall/getstarted)
- [Vercel – Internal Knowledge Base (GitHub)](https://github.com/vercel-labs/ai-sdk-preview-internal-knowledge-base)
- [Vercel – Template Internal Knowledge Base](https://vercel.com/templates/next.js/ai-sdk-internal-knowledge-base)
- Projeto: `lib/rag/retrieval.ts`, `lib/ai/knowledge-base.md`, `docs/RAG-PIPELINE-SEPARATION.md`
