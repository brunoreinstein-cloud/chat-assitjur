# SPEC — Base Jurídica com RAG + Estilo do Escritório (v1)

Documento de referência para revisão futura: objetivos do produto, requisitos, arquitetura e **mapeamento para o projeto Chatbot atual**, com indicação de como aplicar e vantagens de adopção.

---

## Índice

1. [Objetivo e escopo](#0-objetivo-e-escopo)
2. [Personas e casos de uso](#1-personas-e-casos-de-uso)
3. [Requisitos funcionais](#2-requisitos-funcionais)
4. [Requisitos não-funcionais](#3-requisitos-não-funcionais)
5. [Arquitetura](#4-arquitetura)
6. [Modelo de dados](#5-modelo-de-dados)
7. [Pipeline de ingestão](#6-pipeline-de-ingestão)
8. [Retrieval híbrido](#7-retrieval-híbrido)
9. [Orquestração do chat e citações](#8-orquestração-do-chat-e-citações)
10. [API](#9-api)
11. [UI/UX](#10-uiux)
12. [Qualidade e testes](#11-qualidade-e-testes)
13. [Segurança e compliance](#12-segurança-e-compliance)
14. [Roadmap de fases](#13-roadmap-de-fases)
15. [Critérios de aceite (DoD)](#14-critérios-de-aceite-definition-of-done)
16. [Mapeamento para o projeto atual](#15-mapeamento-para-o-projeto-atual)
17. [Como aplicar no projeto](#16-como-aplicar-no-projeto)
18. [Vantagens de adoptar o SPEC](#17-vantagens-de-adoptar-o-spec)
19. [Prompts prontos (System + Retrieval + Answer Schema)](#18-prompts-prontos-system--retrieval--answer-schema)

---

## 0) Objetivo e escopo

### Objetivo

Permitir que o chat jurídico responda com fundamentação baseada em documentos, com **citações rastreáveis**, e gere saídas úteis (tese, argumentos, checklist, trechos copiáveis), mantendo **segurança (LGPD)**, **multi-tenant** e **auditabilidade**.

### Escopo v1 (obrigatório)

- Upload + ingestão de PDFs/DOCX/HTML/TXT
- Extração e chunking com metadata jurídica
- Embeddings + armazenamento vetorial (pgvector)
- Busca **híbrida** (lexical + vetorial) + rerank simples
- Resposta com **citações obrigatórias**
- UI mínima: gestão de documentos + chat com “fontes”
- Auditoria básica (logs de queries e docs usados)
- Políticas: “não inventar” + fallback “não encontrei base”

### Fora do escopo v1 (planejado)

- Fine-tuning/LoRA (fase 2)
- OCR avançado multi-língua / layout perfeito
- Conectores (SharePoint/Drive)
- Autopreenchimento de peças com dados do caso (integrar com CRM)

---

## 1) Personas e casos de uso

### Personas

- **Advogado sênior:** rapidez com qualidade, teses e jurisprudência com referência.
- **Advogado júnior/estagiário:** checklist, estrutura e trechos prontos, sem alucinar.
- **Coordenador:** consistência e controle (quais docs foram usados?).

### Casos de uso v1

1. Revisar contestação e sugerir teses + jurisprudência
2. Responder dúvida jurídica com base em acervo interno
3. Gerar minuta de cláusula (contrato) usando padrões do escritório
4. Extrair riscos / pontos fracos do texto com base em precedentes internos
5. Resumo + tópicos de diligência (due diligence) com fontes

---

## 2) Requisitos funcionais

| ID | Requisito | Resumo |
|----|-----------|--------|
| RF-01 | Upload e gestão de documentos | PDF, DOCX, TXT, HTML; tipo_doc, confidencialidade, tags, metadata jurídica; permissões por org/caso |
| RF-02 | Ingestão (extração + chunking) | Extrair texto + páginas; chunking por tipo (jurisprudência/peça/contrato); page_start/end, section_title |
| RF-03 | Embeddings + index vetorial | Embedding por chunk; pgvector; reprocessar quando doc/modelo/chunking mudar |
| RF-04 | Retrieval híbrido | Lexical (tsvector) + vetorial; merge + dedupe; rerank; top-k com fontes |
| RF-05 | Resposta com citações obrigatórias | Só com base nos trechos; formato [#doc_id p.X–Y] + quote; fallback “não encontrei base” |
| RF-06 | Auditoria e rastreabilidade | Query, filtros, chunks retornados, chunks citados, modelo, user/org, timestamps |
| RF-07 | Painel de documentos (UI) | Listar por tags/tipo/status; status ingestão; ver chunks; excluir/reprocessar |

---

## 3) Requisitos não-funcionais

| ID | Requisito |
|----|-----------|
| RNF-01 | Segurança e LGPD: multi-tenant (RLS), criptografia, permissões org/caso/grupo |
| RNF-02 | Confiabilidade: reprocessamento idempotente, retry, dead-letter |
| RNF-03 | Performance: p95 retrieval &lt; 800ms; streaming da resposta |
| RNF-04 | Observabilidade: métricas (tempo ingestão/retrieval, taxa de erro); trilha de auditoria |

---

## 4) Arquitetura (alto nível)

- **Frontend:** Next.js — Chat UI + painel de documentos
- **Backend:** Next.js API routes / server actions — upload, ingest, search, chat
- **Jobs:** Ingestão em fila (pg-boss, graphile-worker ou cron + tabela de jobs)
- **DB:** Supabase Postgres — documentos, chunks, embeddings, logs, permissões
- **LLM:** Chat (ex. GPT-4.1/4o) + embeddings (ex. text-embedding-3-large)

---

## 5) Modelo de dados (Postgres / Supabase)

### 5.1 Tabelas do SPEC

- **organizations** — id, name
- **users** — id, org_id, role (admin | lawyer | staff)
- **cases** (opcional v1) — id, org_id, name, metadata
- **documents** — id, org_id, case_id, title, type_doc, source_type, source_uri, confidentiality, status, checksum, metadata (jurídico: tribunal, classe, relator, data_julgamento, numero_processo, area, temas)
- **document_files** — id, document_id, mime_type, storage_path, pages, extracted_text_path
- **chunks** — id, document_id, org_id, case_id, chunk_index, content, page_start/end, section_title, metadata, content_hash
- **embeddings** — chunk_id, embedding vector(), embedding_model, created_at
- **chunk_lexical** — chunk_id, tsv tsvector (índice GIN)
- **chat_sessions** — id, org_id, case_id, user_id, created_at
- **chat_messages** — id, session_id, role, content, created_at
- **rag_queries** — id, org_id, user_id, session_id, query_text, filters, retrieval_topk, model_chat, model_embed, created_at, latency_ms
- **rag_query_results** — query_id, chunk_id, rank, score_vector, score_lexical, score_final
- **rag_citations** — message_id, chunk_id, quote, page_start/end, created_at

### 5.2 Índices

- documents(org_id, status, type_doc)
- chunks(document_id, chunk_index)
- embeddings: ivfflat/hnsw (pgvector)
- chunk_lexical.tsv: GIN
- rag_queries(org_id, created_at)

### 5.3 RLS

- documents.org_id = auth.org_id
- chunks.org_id = auth.org_id
- Se case_id existir: usuário só acessa cases permitidos

---

## 6) Pipeline de ingestão (detalhado)

### Estados

`queued` → `processing` → `ready` | `error`

### Passos

1. **Upload** — storage + documents + document_files (status queued)
2. **Extract** — PDF/DOCX/HTML/TXT; normalização (headers, espaços, numeração)
3. **Classify** — heurística + LLM opcional: type_doc, metadata jurídica (tribunal, data, relator)
4. **Chunk** — por tipo_doc: jurisprudência (EMENTA/ACÓRDÃO/DISPOSITIVO), contrato (cláusulas), peça (tópicos); min/max chars, overlap 10–15%
5. **Persist chunks** — chunks + chunk_lexical.tsv
6. **Embed** — lote → embeddings
7. **Ready** — status ready

### Reprocessamento

Endpoint “Reprocessar”: invalida chunks/embeddings por document_id; re-executa pipeline.

---

## 7) Retrieval híbrido (detalhado)

### Entrada

query_text, org_id, case_id (opcional), filtros (type_doc, tribunal, tema, data range).

### Lexical

ts_rank_cd(tsv, plainto_tsquery(...)); boost para “Súmula”, “OJ”, “art.”, “CLT”, “CPC”; topN_lex = 40.

### Vetorial

embedding(query); similarity search topN_vec = 40; filtros org/case + type_doc.

### Merge + score final

Normalizar; score_final = 0.55*vec + 0.45*lex; dedupe por document_id + section_title; topK_final = 12.

### Rerank (opcional v1)

LLM rerank dos top 20.

---

## 8) Orquestração do Chat (prompt + formato)

### System prompt (núcleo)

- Não inventar jurisprudência/artigos
- Responder somente com base nos trechos
- Citar fontes no final de cada parágrafo relevante
- Se insuficiente: dizer que não encontrou base e pedir documento

### Context injection

Resumo da pergunta, filtros, chunks recuperados (doc_id, título, páginas); limitar tokens; priorizar diversidade.

### Output schema (Markdown)

Resposta, Teses, Trechos copiáveis, Jurisprudência, Riscos/lacunas, Perguntas para completar, Fontes (lista de citações).

### Citações

Formato: `[#DOC123 "Título" p. 3–4]` + pelo menos 1 quote curto por fonte.

---

## 9) API (endpoints)

### Documentos

- `POST /api/docs/upload` — file + metadata → document_id
- `POST /api/docs/:id/ingest` — reprocessar
- `GET /api/docs?filters...` — lista + status + metadata
- `GET /api/docs/:id` — doc + chunks (paginado)
- `DELETE /api/docs/:id` — soft delete recomendado

### Retrieval

- `POST /api/rag/search` — query, filters, topK → chunks + scores

### Chat

- `POST /api/chat` — session_id, message, filters, mode → stream + citations

---

## 10) UI/UX (mínimo viável)

- **Base de Conhecimento:** upload; lista (título, tipo, tags, status, atualizado); ver, reprocessar, excluir
- **Documento:** preview; lista de chunks com páginas/secção; “testar busca” (query → chunks retornados)
- **Chat:** seletor de escopo (org / case / tipos); painel lateral “Fontes” clicáveis

---

## 11) Qualidade: avaliação e testes

- **Métricas:** Citation rate, Groundedness, Recall, Latency (p95)
- **Golden set:** 30 perguntas reais; resposta esperada + docs obrigatórios; regressão ao mudar chunking/embeddings
- **Testes:** unit (chunker por tipo_doc); integration (ingest → retrieval → chat); security (RLS cross-org)

---

## 12) Segurança e compliance

- Redaction opcional em logs (CPF, RG, endereço)
- “Não treinar” em dados do cliente por padrão
- Arquivos restritos só acessíveis no case_id
- Audit trail exportável para compliance interno

---

## 13) Roadmap de fases

- **Fase 1 (v1):** RAG confiável — ingest + hybrid retrieval + citations + UI docs + logs
- **Fase 2:** Estilo do escritório (sem fine-tune) — style guide, exemplos ouro, few-shot, templates por tipo de entrega
- **Fase 3:** Fine-tuning/LoRA (se necessário) — dataset com revisão humana; formatação/estilo; avaliação rigorosa

---

## 14) Critérios de aceite (Definition of Done)

1. Upload de PDF/DOCX cria documento e status “ready” após ingestão.
2. Busca retorna chunks relevantes com filtros (org/case/type).
3. Chat responde com citações obrigatórias; sem citações ⇒ falha.
4. Se a base não contém resposta, o bot diz claramente que não encontrou.
5. Logs registram query, chunks retornados, chunks citados, latência.
6. RLS impede acesso de outra organização (teste automatizado).
7. UI mostra status e permite reprocessar e inspecionar chunks.

---

## 15) Mapeamento para o projeto atual

Esta secção mapeia o estado actual do repositório **Chatbot** face ao SPEC, para revisão e planeamento.

### 15.1 O que já existe

| Área | Estado no projeto | Ficheiros / notas |
|------|-------------------|-------------------|
| **Upload + gestão de docs** | Parcial | `KnowledgeDocument`, `KnowledgeFolder`; `POST /api/knowledge`, `from-files`, pastas; sem `type_doc`/confidencialidade/case |
| **Extração de texto** | Sim | Extração em `from-files` e upload do chat; PDF/DOCX (e.g. pdf-parse, extração servidor); `extractDocumentMetadata` (título, autor, documentType, keyInfo) |
| **Chunking** | Genérico | `lib/ai/rag.ts` — `chunkText` (tamanho + overlap); não por tipo (jurisprudência/peça/contrato) |
| **Embeddings + pgvector** | Sim | `KnowledgeChunk` com `embedding vector(1536)`; HNSW; `lib/rag/vectorization.ts`, `indexing.ts`; pipeline `vectorizeAndIndex` |
| **Retrieval** | Só vetorial | `getRelevantChunks` (cosine); `retrieveKnowledgeContext` em `lib/rag/retrieval.ts`; sem lexical, sem rerank |
| **Chat com contexto** | Sim | RAG quando há texto + chunks indexados; fallback injeção direta; `buildKnowledgeContext` no route |
| **Políticas “não inventar”** | Sim | Instruções em `prompts.ts` e agentes (Revisor, Redator): usar só base, não inventar, citar; fallback “não tenho informação suficiente” |
| **Pipeline em etapas** | Sim | `lib/rag/` — vectorization, indexing, retrieval, pipeline; ver `docs/RAG-PIPELINE-SEPARATION.md` |
| **Multi-tenant** | Por userId | Sem `organizations`/`cases`; isolamento por `userId` (KnowledgeDocument.userId) |
| **Auditoria LLM** | Parcial | `LlmUsageRecord` (tokens, modelo, créditos); sem `rag_queries` / `rag_query_results` / `rag_citations` |
| **UI Base de Conhecimento** | Sim | Botão no header; seleção de docs (máx. 50); pastas; importar ficheiros/pasta; sem “status de ingestão” explícito na lista nem inspecção de chunks por doc |
| **Indexação assíncrona** | Parcial | `indexingStatus`: pending / indexed / failed; endpoint `index-pending`; job externo (ex. Trigger.dev) possível |

### 15.2 Lacunas face ao SPEC v1

| Lacuna | Descrição |
|--------|-----------|
| **Modelo de dados** | Não existe `organizations`, `cases`, `document_files`; `KnowledgeDocument` não tem type_doc, confidentiality, metadata jurídica (tribunal, relator, data_julgamento, etc.); chunks sem page_start/end, section_title, content_hash; não existe `chunk_lexical` (tsvector) |
| **Busca híbrida** | Apenas vetorial; falta tsvector + merge lexical + rerank |
| **Chunking jurídico** | Chunking genérico; falta estratégia por tipo (jurisprudência, peça, contrato) |
| **Citações estruturadas** | Prompt pede “referencie por id ou título”; não há formato obrigatório [#doc_id p.X–Y] nem tabela `rag_citations` |
| **Auditoria RAG** | Não há registo de query, filtros, chunks retornados, chunks citados, latência (tabelas rag_queries, rag_query_results, rag_citations) |
| **API de documentos** | API é `/api/knowledge` (CRUD docs/pastas); não existe `/api/docs` com upload separado, ingest por id, listagem com filtros type_doc/status |
| **UI documento** | Não há tela “Documento” com preview, lista de chunks e “testar busca”; painel “Fontes” no chat não está formalizado como no SPEC |
| **RLS / org** | Sem RLS por organização; modelo actual é por utilizador (Supabase Auth pode ser usado para org depois) |

### 15.3 Resumo visual

```
SPEC v1                    Projeto actual
────────────────────────────────────────────────────────────
organizations/cases        → Não (só userId)
documents + metadata       → KnowledgeDocument (sem type_doc, confid., metadata jurídica)
document_files             → Não (há UserFile para storage)
chunks + page/section      → KnowledgeChunk (sem page, section_title)
chunk_lexical (tsvector)    → Não
embeddings                 → Em KnowledgeChunk (pgvector) ✓
Retrieval híbrido          → Só vetorial ✓
Rerank                     → Não
Citações [#doc p.X–Y]      → Instrução genérica no prompt
rag_queries / results      → Não
rag_citations              → Não
Pipeline ingestão          → vectorizeAndIndex ✓ (sem estados queued/processing)
UI painel docs             → Base de conhecimento ✓ (sem status ingestão por doc, sem “ver chunks”)
```

---

## 16) Como aplicar no projeto

Sugestão de passos por bloco, para revisão futura.

### 16.1 Dados e modelo (RF-01, RF-02, secção 5)

1. **Opção A — Evoluir o actual:**  
   - Adicionar a `KnowledgeDocument`: `typeDoc` (enum), `confidentiality` (enum), `metadata` (jsonb) para tribunal, relator, data_julgamento, area, temas.  
   - Adicionar tabela `DocumentFile` (documentId, mimeType, storagePath, pages) se quiser separar ficheiro de “documento lógico”.  
   - Manter `userId`; introduzir `organizationId` e `caseId` (nullable) quando adoptar multi-tenant por organização.

2. **Opção B — Novo módulo “docs”:**  
   - Criar tabelas alinhadas ao SPEC (organizations, cases, documents, document_files, chunks com page/section); usar para “Base Jurídica” e manter `KnowledgeDocument` para o fluxo actual de “base de conhecimento” do chat até migração completa.

3. **Chunking jurídico (RF-02):**  
   - Em `lib/rag/` (ou `lib/ai/rag.ts`), implementar estrategias por `typeDoc`: jurisprudência (split EMENTA/ACÓRDÃO/DISPOSITIVO), contrato (regex cláusulas), peça (tópicos/títulos).  
   - Adicionar a cada chunk: `pageStart`, `pageEnd`, `sectionTitle` (e opcionalmente `contentHash`).

4. **Lexical (RF-04):**  
   - Criar tabela ou coluna `chunk_lexical` com `tsvector`; gerar na ingestão; índice GIN.  
   - Ver secção 7 para função de busca lexical (ts_rank_cd, plainto_tsquery).

### 16.2 Retrieval híbrido (RF-04)

1. Implementar busca lexical (Postgres full-text) sobre `chunk_lexical`.  
2. Manter busca vetorial actual (`getRelevantChunks`).  
3. Implementar merge: normalizar scores, combinar (ex. 0.55*vec + 0.45*lex), dedupe, topK.  
4. (Opcional v1) Rerank com LLM dos top 20.

### 16.3 Citações e auditoria (RF-05, RF-06)

1. **Citações:**  
   - No prompt, exigir formato `[#DOC123 "Título" p. X–Y]` e trecho curto; incluir no system prompt e nas instruções do agente.  
   - (Opcional) Pós-processar a resposta para extrair citações e gravar em `rag_citations`.

2. **Auditoria:**  
   - Criar tabelas `rag_queries`, `rag_query_results`, `rag_citations` conforme secção 5.  
   - No handler do chat (e se existir `/api/rag/search`): após retrieval, inserir em `rag_queries` (query_text, filtros, user_id, session_id, model, latency_ms) e em `rag_query_results` (query_id, chunk_id, rank, scores).  
   - Se houver extração de citações na resposta, inserir em `rag_citations` (message_id, chunk_id, quote, page_start/end).

### 16.4 API e UI (RF-07, secções 9 e 10)

1. **API:**  
   - Manter ou estender `POST /api/knowledge/from-files` como “upload”; ou criar `POST /api/docs/upload` que cria documento + file e enfileira ingestão.  
   - Endpoint `POST /api/docs/:id/ingest` (ou `POST /api/knowledge/:id/reindex`) para reprocessar.  
   - `GET /api/docs` (ou `GET /api/knowledge`) com query params para type_doc, status, tags.  
   - `GET /api/docs/:id` com chunks paginados (e, se existir, chunk_lexical para debug).  
   - `POST /api/rag/search` para testar retrieval (query + filtros → chunks + scores).

2. **UI:**  
   - Na lista da Base de Conhecimento: colunas status de ingestão (pendente/processando/ready/erro), tipo, tags.  
   - Tela “Documento”: preview do texto, lista de chunks com página/secção, botão “Testar busca” (query → chunks retornados).  
   - No chat: painel lateral “Fontes” com lista clicável das citações da última resposta.

### 16.5 Segurança e RLS (RNF-01)

1. Se adoptar `organizations`: criar políticas RLS em todas as tabelas sensíveis (documents, chunks, rag_queries) por `org_id`.  
2. Se adoptar `cases`: restringir acesso a documentos/chunks por `case_id` conforme permissões do utilizador.  
3. Redacção em logs: aplicar regex para CPF/RG/endereço em campos de texto antes de gravar em rag_queries ou logs gerais.

### 16.6 Qualidade (secção 11)

1. Definir golden set de ~30 perguntas; resposta esperada + docs que devem aparecer.  
2. Testes de regressão: ao alterar chunking ou modelo de embedding, re-executar golden set e verificar recall/citation rate.  
3. Teste de segurança: verificar que RLS impede acesso cross-org (e cross-case se aplicável).

---

## 17) Vantagens de adoptar o SPEC

- **Rastreabilidade:** Citações no formato [#doc p.X–Y] e tabelas rag_queries/rag_citations permitem auditoria e conformidade (“que documentos sustentam esta resposta?”).  
- **Confiabilidade:** Retrieval híbrido (lexical + vetorial) melhora recall em termos exactos (Súmula, art., números); chunking por tipo jurídico melhora precisão por domínio.  
- **Escalabilidade:** Separação documentos/chunks/embeddings/lexical e pipeline em etapas facilita jobs assíncronos e troca de backends (ex. rerank externo).  
- **Multi-tenant e compliance:** Modelo org/case + RLS prepara para escritórios e clientes; confidencialidade e audit trail ajudam LGPD e políticas internas.  
- **UX e aceitação:** Painel de documentos com status e “testar busca” aumenta confiança; fontes clicáveis no chat reforçam que a resposta está fundamentada.  
- **Alinhamento com produto:** Casos de uso (revisão de contestação, dúvidas jurídicas, minuta de cláusula, due diligence) estão alinhados aos agentes actuais (Revisor de Defesas, Redator de Contestações); o SPEC formaliza requisitos que já estão parcialmente no projeto e indica o que falta para “v1 completo”.

---

## 18) Prompts prontos (System + Retrieval + Answer Schema)

Prompts prontos para um agente jurídico com RAG + citações obrigatórias, em estilo "arquitetura útil" (fácil de plugar no Vercel AI SDK).

**Como usar no Vercel AI SDK:**
- **SYSTEM** → `system` do chat.
- **RETRIEVAL** → roda antes do chat (ou como tool-calling).
- **ANSWER SCHEMA** → instrução final do system (ou "response format").

---

### 18.1 SYSTEM PROMPT — "Agente Jurídico Grounded (RAG-first)"

Você é um advogado sênior e revisor técnico. Sua prioridade é produzir respostas jurídicas úteis, objetivas e rastreáveis, SEM inventar informações.

**REGRAS ABSOLUTAS (NÃO QUEBRE):**
1. **Base documental:** você só pode afirmar fatos, teses, precedentes, artigos, súmulas, OJs, cláusulas ou conclusões se houver suporte explícito nos trechos fornecidos em "FONTES RECUPERADAS".
2. **Citações obrigatórias:** toda afirmação jurídica relevante deve vir acompanhada de ao menos 1 citação no formato `[#DOC_ID p.X–Y]`.
3. **Sem alucinação:** se as fontes não sustentarem a resposta, diga explicitamente: "Não encontrei base suficiente nas fontes recuperadas para afirmar isso."
4. **Transparência:** nunca invente número de processo, tribunal, data, relator, súmula, artigo, ou cláusula. Se a fonte não contiver, não cite.
5. **Proteção:** não revele dados sensíveis além do que está nas fontes. Se houver CPF, endereço, RG etc., resuma sem reproduzir dados completos.

**OBJETIVO:**  
Entregar uma resposta que ajude o usuário a decidir e agir: tese, fundamento, evidências, riscos, próximos passos e trechos copiáveis.

**COMO USAR AS FONTES:**
- Você receberá uma seção "FONTES RECUPERADAS" com chunks. Trate isso como o universo de evidências disponíveis.
- Priorize fontes mais específicas e aplicáveis ao caso (jurisprudência do mesmo tribunal/tema; cláusulas exatas; trechos de peça/modelo do escritório).
- Se houver conflito entre fontes, apresente a divergência e cite ambos.

**ESTILO:**
- Tom profissional, direto, sem floreio.
- Use listas e subtítulos curtos.
- Se necessário, faça 3–7 perguntas objetivas para fechar lacunas (somente se as lacunas impedirem resposta segura).

---

### 18.2 RETRIEVAL PROMPTS

#### 18.2.1 Query Rewrite + filtros (gerar "plano de busca")

Use para transformar a pergunta do usuário em queries de busca + filtros.

> Você é um especialista em recuperação de informação jurídica (RAG). Converta a pergunta do usuário em um PLANO DE BUSCA.
>
> **ENTRADA:**
> - Pergunta do usuário: `{{user_question}}`
> - Contexto opcional do caso: `{{case_context}}` (pode estar vazio)
> - Metadados disponíveis para filtro: tribunal, área, tema, tipo_doc, data_range, case_id, tags.
>
> **SAÍDA** (em JSON válido, sem comentários):

```json
{
  "intent": "responder" | "revisar_peca" | "gerar_clausula" | "mapear_riscos" | "pesquisar_jurisprudencia",
  "queries": [
    { "q": "string", "boost": ["termos", "exatos"], "must_include": ["siglas","artigos","súmulas"], "notes": "quando usar" }
  ],
  "filters": {
    "area": "trabalhista|civel|societario|contratos|misto|desconhecido",
    "tribunal_preferido": ["TST","TRT4","STJ","TJSP"],
    "tipo_doc_preferido": ["jurisprudencia","modelo","peca","contrato","parecer"],
    "temas": ["lista","curta"],
    "case_id": "{{case_id_or_null}}",
    "confidencialidade_max": "restrito_caso|restrito_org|publico_interno"
  },
  "topk": { "lexical": 40, "vector": 40, "final": 12 },
  "answer_requirements": {
    "need_jurisprudence": true,
    "need_contract_clauses": true,
    "need_internal_models": true
  }
}
```

**REGRAS:**
- Gere 3 a 6 queries.
- Sempre inclua 1 query com termos EXATOS (ex.: "CLT art 818", "Súmula 338", "justa causa desídia").
- Se a pergunta mencionar tribunal/localidade, priorize em tribunal_preferido.
- Se for revisão de peça, inclua query para "modelos do escritório" + "teses" e "jurisprudência".

#### 18.2.2 Rerank (opcional, melhora MUITO)

Se rerank via LLM: enviar os top 20 chunks e pedir ordenação.

> Você é um re-rankeador jurídico. Sua tarefa é ordenar os TRECHOS pela utilidade para responder a pergunta.
>
> **Pergunta:** `{{user_question}}`
>
> **Critérios de ranking (nessa ordem):**
> 1. Relevância direta ao ponto jurídico/pergunta  
> 2. Especificidade (cláusula/artigo/ementa direta)  
> 3. Autoridade (tribunal/instância aplicável; documento interno "modelo ouro")  
> 4. Atualidade (quando data estiver presente)  
> 5. Clareza e citabilidade (trecho curto e copiável)
>
> **Saída (JSON):**

```json
{
  "ranked": [
    { "chunk_id": "...", "reason": "1 frase objetiva" }
  ],
  "discarded": [
    { "chunk_id": "...", "reason": "1 frase objetiva" }
  ]
}
```

**REGRAS:** Retorne no máximo 12 em "ranked". Descarte duplicados e trechos que não sustentam nada citável.

#### 18.2.3 Gate (checagem de suficiência)

Avaliar, antes de responder, se as fontes recuperadas são suficientes.

> Avalie se as FONTES RECUPERADAS são suficientes para responder com segurança.
>
> **Pergunta:** `{{user_question}}`
>
> **Responda em JSON:**

```json
{
  "sufficient": true,
  "missing": ["lista curta do que falta"],
  "suggested_user_questions": ["até 5 perguntas objetivas"],
  "recommended_filters": { "temas": [], "tribunal_preferido": [], "tipo_doc_preferido": [] }
}
```

**Regra:** Se não houver fontes que sustentem o núcleo da resposta, marque `sufficient: false`.

---

### 18.3 ANSWER SCHEMA — formato final (com citações)

#### 18.3.1 Instrução de saída (Markdown estruturado)

Produza a resposta em Markdown, obedecendo:

- Cada parágrafo com conteúdo jurídico relevante deve terminar com pelo menos 1 citação: `[#DOC_ID p.X–Y]`.
- Não use citações genéricas; cite exatamente o documento e páginas do chunk.
- Se uma afirmação depender de mais de uma fonte, cite as duas no final do parágrafo.

**FORMATO:**

```markdown
## Resposta
(2–6 parágrafos, direto ao ponto)

## Teses recomendadas
- Tese 1 — 1 linha + citação
- Tese 2 — 1 linha + citação

## Fundamentação e encaixe no caso
- Ponto A: explique como aplicar + citação
- Ponto B: explique + citação

## Trechos copiáveis
> "trecho exato (curto)" [#DOC_ID p.X–Y]
> "trecho exato (curto)" [#DOC_ID p.X–Y]

## Jurisprudência (se houver)
- Tribunal/órgão (se constar), ideia da decisão, por que ajuda [#DOC_ID p.X–Y]

## Riscos e lacunas
- Risco 1 (por que) [#DOC_ID p.X–Y] ou "sem base suficiente nas fontes"
- Lacuna: o que precisa confirmar

## Próximos passos (checklist)
1) ação
2) ação
3) ação

## Fontes usadas
- [#DOC_ID] Título — p.X–Y (até 1 linha por fonte)
```

#### 18.3.2 Política de "não encontrei"

Use como regra final.

- Se as fontes **não** sustentarem o essencial:
  - Diga: "Não encontrei base suficiente nas fontes recuperadas para afirmar X."
  - Em seguida, liste o que precisa para responder (até 5 itens).
  - Sugira quais documentos o usuário deve enviar ou quais filtros aplicar.
- **Nunca** "complete" com conhecimento geral não presente nas fontes.

---

## Referências no repositório

- `lib/ai/knowledge-base.md` — base de conhecimento e RAG actuais  
- `docs/RAG-PIPELINE-SEPARATION.md` — pipeline em etapas  
- `lib/rag/` — vectorization, indexing, retrieval, pipeline  
- `lib/ai/rag.ts` — chunking e embeddings  
- `lib/ai/prompts.ts` — system prompt e instruções anti-alucinação  
- `lib/ai/extract-metadata.ts` — metadados extraídos por IA (título, tipo, etc.)  
- `AGENTS.md` — stack, estrutura e convenções do projeto  

---

*Documento criado para revisão futura. Atualizar a secção 15 (Mapeamento) e 16 (Como aplicar) à medida que o projeto for implementando os itens do SPEC.*
