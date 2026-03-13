# Análise: Template Internal Knowledge Base (Vercel)

Comparação com o [template Internal Knowledge Base da Vercel](https://vercel.com/templates/next.js/ai-sdk-internal-knowledge-base) ([repositório vercel-labs/ai-sdk-preview-internal-knowledge-base](https://github.com/vercel-labs/ai-sdk-preview-internal-knowledge-base)) e recomendações para melhorar a nossa base de conhecimento.

Este template é **diferente** do [template RAG](https://github.com/vercel-labs/ai-sdk-preview-rag) já analisado em `TEMPLATE-RAG-VERCEL-ANALISE.md`: foca-se em **Language Model Middleware** para RAG e guardrails, e usa **HyDE** (Hypothetical Document Embeddings).

---

## 1. O que o template Internal Knowledge Base faz

### 1.1 Language Model Middleware

O template usa a API experimental do AI SDK:

- **`Experimental_LanguageModelV1Middleware`** com método **`transformParams`**.
- O modelo é envolvido com **`wrapLanguageModel({ model, middleware: ragMiddleware })`**.
- Em cada chamada ao modelo, o middleware recebe `params` (incluindo `prompt`/mensagens e `providerMetadata`), pode alterá-los e devolver os params modificados.

Assim, o RAG e os “guardrails” acontecem **antes** do modelo ser chamado, de forma transparente para a route.

### 1.2 Fluxo no middleware (`ai/rag-middleware.ts`)

1. **Autenticação:** Obtém sessão; sem utilizador, devolve params inalterados.
2. **Validação da seleção:** Valida `providerMetadata` com Zod (`selectionSchema`: `files.selection` = array de caminhos de ficheiros). Sem seleção válida, devolve params inalterados.
3. **Última mensagem:** Remove a última mensagem do array; se não for do utilizador, repõe e devolve.
4. **Classificação da mensagem:** Chama `generateObject` com um modelo rápido (ex.: gpt-4o-mini) para classificar o conteúdo como `"question"` | `"statement"` | `"other"`. **Só aplica RAG quando a classificação é `"question"`** — acto de guardrail (evitar injectar contexto em afirmações ou mensagens genéricas).
5. **HyDE (Hypothetical Document Embeddings):** Em vez de embutir a pergunta do utilizador, o template:
   - Gera uma **resposta hipotética** à pergunta com `generateText` (modelo rápido);
   - Embutir **essa resposta hipotética** com `embed()`;
   - Usa esse embedding para buscar chunks por similaridade (cosine). A ideia é que a resposta hipotética está mais próxima, no espaço vetorial, dos trechos que realmente respondem à pergunta.
6. **Recuperação:** Busca chunks por `filePath` (selection = `email/path`), calcula similaridade de cosseno entre o embedding da resposta hipotética e o embedding de cada chunk, ordena e fica com os **top 10**.
7. **Injeção no conteúdo do utilizador:** Os chunks são adicionados **à última mensagem do utilizador** como blocos de texto extra (não ao system prompt): primeiro a frase “Here is some relevant information…”, depois o texto de cada chunk. A mensagem é reposta no array e os params são devolvidos.

### 1.3 Schema e persistência (template)

- Tabela **Chunk**: `id`, `filePath`, `content`, `embedding` (array de reais).
- Chunks são indexados por `filePath` (ex.: `user@email.com/pasta/ficheiro.pdf`).
- A “seleção” vem do cliente via **providerMetadata** (ex.: lista de caminhos relativos); no servidor compõe-se `email + path`.

### 1.4 Resumo das ideias do template

| Aspecto | Template Internal KB |
|--------|------------------------|
| **Onde corre o RAG** | No middleware do modelo (`transformParams`) |
| **Quando corre** | Só quando a mensagem é classificada como `"question"` |
| **Embedding usado para busca** | Resposta hipotética (HyDE), não a pergunta |
| **Onde injeta contexto** | Na última mensagem do utilizador (conteúdo extra) |
| **Seleção de documentos** | Via `providerMetadata.files.selection` (caminhos) |
| **Guardrails** | Classificação question/statement/other; RAG só para questions |

---

## 2. Comparação com o nosso projeto

| Aspecto | Template Internal KB | Nosso projeto |
|--------|----------------------|----------------|
| **Onde corre o RAG** | Middleware do modelo | Route do chat, antes de `streamText` |
| **Quando corre** | Só para mensagens tipo “question” | Sempre que há texto na última mensagem + docs com chunks |
| **Embedding para busca** | HyDE (resposta hipotética) | Query directa (texto da última mensagem) |
| **Onde injeta contexto** | Conteúdo da última mensagem do user | System prompt (secção “Base de conhecimento”) |
| **Seleção de documentos** | providerMetadata (file paths) | `knowledgeDocumentIds` no body do POST /api/chat |
| **Pipeline** | Tudo no middleware | Ingestão → Vetorização → Indexação → Recuperação → Geração (`lib/rag/`) |
| **Chunking** | (implícito no template; chunks por ficheiro) | 800 chars, overlap 150, quebra por espaço/newline |
| **Threshold similaridade** | Não aplicado no código visto | `RAG_MIN_SIMILARITY` (opcional) |
| **Backends** | Postgres + pgvector | pgvector ou Qdrant (`RAG_INDEX_BACKEND`, `RAG_RETRIEVAL_BACKEND`) |
| **Classificação da mensagem** | Sim (question/statement/other) | Não |

Conclusão: o nosso pipeline (separação de etapas, chunking, backends plugáveis, threshold) está mais evoluído. O template traz sobretudo **padrões de uso**: (1) classificação para aplicar RAG só a perguntas, (2) HyDE para melhorar recall, (3) injeção no conteúdo do user em vez do system prompt, (4) uso do middleware do AI SDK.

---

## 3. Melhorias recomendadas para a nossa base de conhecimento

### 3.1 HyDE opcional (médio esforço, alto impacto potencial)

**O quê:** Em vez de embutir apenas o texto da última mensagem, gerar uma “resposta hipotética” curta com o modelo e usar o embedding **dessa** resposta para buscar chunks (como no template).

**Vantagem:** Em muitos benchmarks, HyDE melhora o recall da recuperação, sobretudo quando a pergunta é curta ou ambígua.

**Onde:** Em `retrieveKnowledgeContext` (ou num módulo chamado por ela): se uma flag (ex.: `useHyDE`) ou env (ex.: `RAG_USE_HYDE=true`) estiver activa, chamar `generateText` com modelo barato para gerar 1–2 frases de resposta hipotética, depois `embedQuery(hypotheticalAnswer)` e usar esse embedding na busca. Manter o fluxo actual (embed da query) como default.

**Trade-off:** +1 chamada ao LLM e +1 embedding por turno quando HyDE estiver activo; aumentar ligeiramente a latência. Recomendado como opção (env ou feature flag por agente).

---

### 3.2 Classificação “só RAG para perguntas” (médio esforço)

**O quê:** Antes de chamar `retrieveKnowledgeContext`, classificar a última mensagem (ex.: “question” | “statement” | “other”). Só executar RAG quando for “question”; nos outros casos usar fallback (injeção directa dos documentos seleccionados ou nenhum contexto extra).

**Vantagem:** Reduz custo e ruído quando o utilizador envia uma afirmação, um comando ou texto que não é uma pergunta — evita injectar chunks pouco relevantes.

**Onde:** Na route do chat, antes do `Promise.all` que inclui `retrieveKnowledgeContext`. Chamada a `generateObject` com modelo rápido (ex.: gemini-flash-lite) e schema enum; se resultado !== "question", não chamar retrieval (ou usar apenas injeção directa, conforme definição do produto).

**Trade-off:** +1 chamada ao LLM por turno. Pode ser opcional por env (ex.: `RAG_CLASSIFY_QUESTION_ENABLED=true`).

---

### 3.3 Manter injeção no system prompt (não adoptar injeção na mensagem do user)

**Template:** Injeta os chunks como conteúdo extra da **última mensagem do utilizador**.

**Nosso projeto:** Injeta no **system prompt** (secção “Base de conhecimento”).

Recomendação: **manter a injeção no system prompt**. No nosso caso, (1) as instruções do agente e o formato já estão no system prompt; (2) misturar chunks na mensagem do user pode confundir o modelo sobre o que é “pergunta” vs “contexto”; (3) o limite de documentos e o tamanho do contexto já são controlados na construção do system prompt. Se no futuro quisermos experimentar injeção na mensagem (ex.: para um agente específico), pode ser uma variante opcional.

---

### 3.4 Middleware opcional (baixa prioridade)

**O quê:** Mover a lógica de RAG (e eventualmente classificação + HyDE) para um `Experimental_LanguageModelV1Middleware` e usar `wrapLanguageModel` no `getLanguageModel` (ou num modelo “com RAG”) quando a feature estiver activa.

**Vantagem:** Separação clara: a route só chama o modelo; o middleware trata de enriquecer o contexto. Pode facilitar reutilização noutras rotas (ex.: outra API que use o mesmo modelo).

**Trade-off:** O nosso fluxo actual já está bem separado (recuperação em `lib/rag/`, route monta o system prompt). O middleware exige passar “seleção” via `providerMetadata` (no nosso caso seria `knowledgeDocumentIds` ou equivalente), o que implica alterar o cliente e o schema do request. Recomendado só se quisermos alinhar com a API do AI SDK a longo prazo; não é necessário para as melhorias 3.1 e 3.2.

---

### 3.5 Outras melhorias já referenciadas

As melhorias do template **RAG** (ver `TEMPLATE-RAG-VERCEL-ANALISE.md`) continuam válidas:

- **Threshold de similaridade** — já temos `RAG_MIN_SIMILARITY`.
- **Multi-query / query expansion** — gerar 2–3 variantes da pergunta e fundir resultados.
- **Tool “pesquisar na base”** — ferramenta que o modelo pode chamar para mais contexto.
- **Tool “adicionar à base”** — guardar conteúdo no chat como documento na base.
- **Reranking** — reordenar top-N com reranker antes de injectar no prompt.

---

## 4. Resumo de acções sugeridas (Internal KB + RAG)

| Ação | Prioridade | Esforço | Impacto |
|------|------------|--------|--------|
| HyDE opcional (`RAG_USE_HYDE`) | Média | Médio | Melhor recall em perguntas curtas/ambíguas |
| Classificação “só RAG para perguntas” (`RAG_CLASSIFY_QUESTION_ENABLED`) | Média | Médio | Menos custo e ruído em não-perguntas |
| Manter injeção no system prompt | — | — | Consistência com agentes e limites atuais |
| Adoptar middleware para RAG | Baixa | Alto | Alinhamento com AI SDK; não bloqueante |
| Multi-query, tools, reranking | Conforme TEMPLATE-RAG-VERCEL-ANALISE | — | — |

---

## 5. Referências

- Template: [Vercel – Internal Knowledge Base](https://vercel.com/templates/next.js/ai-sdk-internal-knowledge-base), [vercel-labs/ai-sdk-preview-internal-knowledge-base](https://github.com/vercel-labs/ai-sdk-preview-internal-knowledge-base)
- AI SDK: [Language Model Middleware](https://sdk.vercel.ai/docs/ai-sdk-core/middleware#language-model-middleware), [wrapLanguageModel](https://ai-sdk.dev/docs/reference/ai-sdk-core/wrap-language-model)
- Nosso pipeline: `lib/rag/`, `lib/ai/knowledge-base.md`, `docs/RAG-PIPELINE-SEPARATION.md`
- Análise template RAG: `docs/TEMPLATE-RAG-VERCEL-ANALISE.md`
