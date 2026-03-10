# Análise: Template RAG Vercel vs nosso projeto

Comparação com o [template RAG da Vercel](https://vercel.com/templates/next.js/ai-sdk-rag) ([repositório vercel-labs/ai-sdk-preview-rag](https://github.com/vercel-labs/ai-sdk-preview-rag)) e recomendações de melhorias a implantar.

**Nota:** Existe também o template [Internal Knowledge Base](https://vercel.com/templates/next.js/ai-sdk-internal-knowledge-base) ([vercel-labs/ai-sdk-preview-internal-knowledge-base](https://github.com/vercel-labs/ai-sdk-preview-internal-knowledge-base)), que usa **Language Model Middleware**, **HyDE** (hypothetical document embeddings) e **classificação da mensagem** (só RAG para "question"). Análise em **`docs/TEMPLATE-INTERNAL-KNOWLEDGE-BASE-ANALISE.md`**.

---

## 1. O que o template oferece

- **RAG via tool calls**: O modelo usa ferramentas `getInformation` (busca por similaridade) e `addResource` (adicionar conteúdo à base). Instruções no system prompt obrigam a “getInformation before answering”.
- **Multi-query (query expansion)**: Ferramenta `understandQuery` chama `generateObject` para gerar 3 perguntas similares; `getInformation` é chamada para cada uma; resultados são fundidos e deduplicados.
- **Chunking**: Muito simples — split por `.` (pontos).
- **Embeddings**: `openai/text-embedding-ada-002`, dimensão 1536.
- **Recuperação**: `findRelevantContent` — embedding da query, cosine similarity, filtro `similarity > 0.3`, `limit 4`.
- **Schema**: Tabela `embeddings` (id, resourceId, content, embedding vector 1536) com índice HNSW; tabela `resources`.
- **UI**: useChat, streaming, Framer Motion.

---

## 2. O que o nosso projeto já tem (comparação)

| Aspecto | Template Vercel | Nosso projeto |
|--------|------------------|----------------|
| **Fluxo RAG** | Tool calls (modelo decide quando buscar) | Pré-injeção: 1x por turno, embed da última mensagem → top-k chunks → system prompt |
| **Chunking** | Split por "." | 800 caracteres, overlap 150, quebra por espaço/newline |
| **Embedding** | text-embedding-ada-002 | text-embedding-3-small |
| **Recuperação** | similarity > 0.3, limit 4 | Top-k por distância (sem threshold), limit 12 (24 para Redator) |
| **Pipeline** | Tudo na route + lib/ai/embedding | Ingestão → Vetorização → Indexação → Recuperação → Geração (`lib/rag/`) |
| **Backends** | Só Postgres + pgvector | pgvector + Qdrant opcional (`RAG_INDEX_BACKEND`, `RAG_RETRIEVAL_BACKEND`) |
| **Multi-query** | Sim (understandQuery → 3 perguntas) | Não |
| **Threshold similaridade** | Sim (0.3) | Não |
| **Tools “base de conhecimento”** | getInformation, addResource, understandQuery | Nenhuma (contexto já injetado) |

Conclusão: o nosso pipeline (chunking, embedding, separação de etapas, backends plugáveis) está mais evoluído. O template traz sobretudo **padrões de uso** (tools, multi-query, threshold).

---

## 3. Melhorias recomendadas (por prioridade)

### 3.1 Threshold de similaridade mínima (baixo esforço)

**O quê:** Só injetar chunks cuja similaridade com a query seja acima de um limite (ex.: 0.25 ou 0.3), para reduzir ruído e respostas baseadas em trechos pouco relevantes.

**Onde:** Parâmetro opcional em `getRelevantChunks` / `retrieveKnowledgeContext` (ex.: `minSimilarity?: number`). Em pgvector: cosine distance `<=>`; similaridade = `1 - distance`. Filtrar com `(embedding <=> query) <= (1 - minSimilarity)`.

**Config:** Variável de ambiente opcional `RAG_MIN_SIMILARITY` (ex.: `0.25`). Default: não aplicar (comportamento atual).

---

### 3.2 Multi-query / query expansion (médio esforço)

**O quê:** Gerar 2–3 variantes da pergunta do utilizador (com LLM ou heurísticas) e fazer retrieval para cada uma; fusionar resultados (ex.: Reciprocal Rank Fusion) e deduplicar antes de injetar no prompt.

**Vantagem:** Melhor recall em perguntas ambíguas ou quando uma única formulação não cobre bem o documento.

**Trade-off:** +1 chamada ao LLM por turno (ou uso de modelo barato só para expansion). Pode ser opcional por env (ex.: `RAG_QUERY_EXPANSION_ENABLED=true`).

**Referência:** Template usa `understandQuery` + `generateObject` com schema “3 similar questions”.

---

### 3.3 Tool “pesquisar na base” opcional (médio esforço)

**O quê:** Ferramenta `getInformation` ou `searchKnowledge` que o modelo pode chamar quando precisar de mais contexto (ex.: follow-up, ou quando o utilizador pergunta por algo que não estava nos chunks pré-injetados).

**Vantagem:** Flexibilidade para o modelo pedir mais trechos sem novo turno do utilizador.

**Trade-off:** Mais chamadas de embedding + retrieval; possível aumento de custo. Recomendado como opção (feature flag ou por agente).

**Nota:** O nosso fluxo já injeta contexto uma vez; a tool seria **complementar** para buscas adicionais no mesmo turno.

---

### 3.4 Tool “adicionar à base de conhecimento” (médio esforço)

**O quê:** Ferramenta `addResource` que, quando o utilizador “dá” uma informação ao assistente (ex.: cola texto), cria um `KnowledgeDocument` (e opcionalmente indexa chunks) na base do utilizador.

**Vantagem:** UX tipo “guarda isto na minha base” sem sair do chat.

**Implementação:** Tool que chama criação de documento (ex.: `POST /api/knowledge` ou função interna) com título sugerido pela IA ou fixo (“Adicionado pelo chat – [data]”).

---

### 3.5 Reranking (já planeado, não vem do template)

**O quê:** Após retrieval por similaridade, reordenar os top-N (ex.: 20) com um reranker (ex.: Cohere, cross-encoder) e manter só os top-K para o prompt.

**Referência:** `docs/KNOWLEDGE-BASE-UPSTASH-AI-SDK-ANALISE.md` e skill `rag-implementation`.

O template **não** faz reranking; esta melhoria é independente e já estava no nosso roadmap.

---

## 4. O que não convém replicar do template

- **Chunking por ".":** O nosso chunking (tamanho fixo + overlap + quebra por palavras) é mais adequado para RAG.
- **Trocar ada-002 por text-embedding-3-small:** Já usamos 3-small; não há ganho em voltar ao ada-002.
- **Obrigar “tools on every request”:** No nosso caso, o contexto é pré-injetado; não precisamos de obrigar o modelo a chamar getInformation em todo o turno (até reduziria previsibilidade e aumentaria latência).

---

## 5. Resumo de ações sugeridas

| Ação | Prioridade | Esforço | Impacto |
|------|------------|--------|--------|
| Threshold de similaridade (`RAG_MIN_SIMILARITY`) | Alta | Baixo | Menos ruído no contexto |
| Documentar opção no knowledge-base.md | Alta | Baixo | Consistência |
| Multi-query / query expansion | Média | Médio | Melhor recall |
| Tool “pesquisar na base” (opcional) | Média | Médio | Mais flexibilidade |
| Tool “adicionar à base” | Média | Médio | Melhor UX |
| Reranking (já planeado) | Média | Médio | Melhor precisão |

---

## 6. Referências

- Template: [Vercel – RAG with AI SDK](https://vercel.com/templates/next.js/ai-sdk-rag), [vercel-labs/ai-sdk-preview-rag](https://github.com/vercel-labs/ai-sdk-preview-rag)
- Nosso pipeline: `docs/RAG-PIPELINE-SEPARATION.md`, `lib/ai/knowledge-base.md`
- Análise Upstash e reranking: `docs/KNOWLEDGE-BASE-UPSTASH-AI-SDK-ANALISE.md`
- Skill RAG: `.agents/skills/rag-implementation/SKILL.md`
