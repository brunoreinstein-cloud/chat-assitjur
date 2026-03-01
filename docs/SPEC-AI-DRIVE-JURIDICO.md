# Spec: AI Drive Jurídico

Especificação completa de produto e sistema para uma plataforma de **inteligência de documentos com IA** voltada a advogados e equipas jurídicas — inspirada em conceitos de document intelligence (ex.: [AI Drive](https://myaidrive.com/pt-BR)), adaptada ao contexto legal brasileiro e à stack do projeto (Revisor de Defesas).

**Versão:** 1.0  
**Data:** 2025-02  
**Estado:** Especificação de referência (não contrato de implementação).

---

## 1. Visão e posicionamento

### 1.1 Visão

> **AI Drive Jurídico** é uma plataforma que transforma documentos jurídicos (petições, contratos, peças processuais, anexos) em **conversas inteligentes** e **entregas estruturadas**, com agentes de IA especializados por domínio (contencioso trabalhista, análise de contratos, due diligence, pesquisa jurisprudencial), segurança adequada ao sigilo profissional e integração natural ao fluxo de trabalho do advogado.

### 1.2 Proposta de valor

| Para quem | Valor |
|-----------|--------|
| **Advogados** | Menos tempo a reler peças; auditoria consistente da defesa; roteiros de audiência e pareceres executivos gerados com critério; acesso a bases de teses e precedentes sem sair do fluxo. |
| **Equipes jurídicas** | Padronização de qualidade, checklist antes de audiência, reutilização de conhecimento (@bancodetese, modelos de peças). |
| **Escritórios** | Escalabilidade da revisão, menos risco de lapsos (prescrição, pedidos não impugnados), conformidade e rastreabilidade. |

### 1.3 Princípios de produto

- **Não substitui o advogado** — audita, sugere, estrutura; a decisão final é sempre humana.
- **Linguagem consultiva** — recomendações, não ordens; o profissional decide.
- **Anti-alucinação** — não inventar fatos, valores (R$/%), jurisprudência ou datas; criticar a peça, não a pessoa.
- **Revisão humana obrigatória** — todas as saídas (pareceres, roteiros) devem ser explicitamente marcadas como “geradas por IA – revisão humana necessária” onde aplicável.
- **Sigilo e conformidade** — dados não usados para treino de modelos; criptografia e políticas alinhadas à LGPD e ao Código de Ética da OAB.

### 1.4 Diferenciação

- **Especialização jurídica** — não é um chat genérico com prompt jurídico; são **workflows e agentes** desenhados para tarefas concretas (revisão de contestação, análise de contratos, extração de cláusulas).
- **Integração com o processo** — entradas e saídas alinhadas às peças reais (PI, Contestação, DOCX operacionais).
- **Extensível** — base de conhecimento, múltiplos agentes e (futuro) RAG permitem evoluir para mais domínios sem reescrever o núcleo.

---

## 2. Escopo e limites

### 2.1 Dentro do escopo (v1)

- Upload e processamento de documentos jurídicos (PDF, DOC, DOCX, imagens).
- Extração de texto (e, quando aplicável, OCR para escaneados).
- Identificação/tipagem de peças (Petição Inicial, Contestação, outros).
- Agente Revisor de Defesas Trabalhistas (fluxo GATE-1 → FASE A → GATE 0.5 → FASE B → ENTREGA).
- Base de conhecimento (injeção no prompt; evolução para RAG).
- Geração de artefactos estruturados (3 DOCX: Avaliação, Roteiro Advogado, Roteiro Preposto).
- Chat em streaming com histórico, seleção de modelo e (opcional) instruções do agente.
- Autenticação e isolamento de dados por utilizador.
- Validação pré-envio (PI + Contestação) para reduzir idas e voltas.

### 2.2 Fora do escopo (v1)

- Redação automática de peças processuais (contestação, réplica, etc.).
- Juízo de procedência ou valor económico (R$/%) dos pedidos.
- Instrução de testemunha ou perguntas capciosas (art. 342 CP).
- Integração com sistemas processuais (PJe, e-SAJ) além de upload manual.
- Multi-inquilino empresarial (RBAC, quotas por escritório) — pode ser v2.
- Agentes adicionais (contratos, due diligence) — especificados mas implementação em fases.

---

## 3. Personas e jobs-to-be-done

### 3.1 Personas

| Persona | Descrição | Necessidades principais |
|---------|-----------|--------------------------|
| **Advogado contencioso** | Atua em contencioso trabalhista; prepara audiências e revisa contestações. | Auditar contestação rapidamente; ter roteiro de audiência e roteiro para preposto; não esquecer prescrição nem pedidos não impugnados. |
| **Sócio / coordenador** | Revisa trabalho da equipe; padroniza qualidade. | Parecer executivo consistente; checklist; reutilizar teses e precedentes (@bancodetese). |
| **Estagiário / associado** | Primeira linha de revisão; anexa peças. | Saber o que anexar (PI + Contestação); entender o fluxo; não enviar sem os documentos obrigatórios. |
| **Jurista (futuro)** | Análise de contratos, due diligence, pesquisa. | Upload de múltiplos documentos; respostas baseadas só nos docs; extração de cláusulas e resumos. |

### 3.2 Jobs-to-be-done

1. **“Preparar audiência trabalhista”** — Entregar PI + Contestação (e opcionais) e obter avaliação da defesa + roteiro advogado + roteiro preposto, com confirmação explícita antes de gerar os DOCX.
2. **“Não perder prescrição nem pedidos”** — O sistema deve destacar prescrição (bienal/quinquenal) e pedidos não impugnados (🔴) de forma consistente.
3. **“Usar minhas teses e precedentes”** — Associar uma base de conhecimento (@bancodetese) à conversa e obter quadro de teses alinhado a ela, sem inventar jurisprudência.
4. **“Validar antes de enviar”** — Saber, antes de enviar a primeira mensagem, se PI e Contestação estão presentes e identificadas, para não perder tempo em trocas adicionais.

---

## 4. Domínios jurídicos

### 4.1 Contencioso trabalhista (atual)

- **Entradas:** Petição Inicial (obrigatória), Contestação (obrigatória), documentos do reclamante/reclamado (opcionais), @bancodetese (opcional).
- **Fluxo:** GATE-1 → FASE A (extração e mapeamento) → GATE 0.5 (resumo e confirmação) → FASE B (3 DOCX) → ENTREGA.
- **Saídas:** Doc 1 — Avaliação da defesa (parecer executivo); Doc 2 — Roteiro Advogado; Doc 3 — Roteiro Preposto.
- **Regras:** Prescrição (bienal/quinquenal), mapeamento de pedidos, anti-alucinação, sinalização (🔴🟡🟢, ✅❌⚠️), siglas só internas.

### 4.2 Análise de contratos (futuro)

- **Entradas:** Um ou mais contratos (PDF/DOCX); perguntas em linguagem natural.
- **Saídas:** Resumos, cláusulas relevantes, extração de termos (prazos, valores, rescisão), comparação entre contratos (quando múltiplos).
- **Agente:** Especializado em identificar tipo de contrato, partes, obrigações, riscos e prazos; sem juízo de valor económico.

### 4.3 Due diligence (futuro)

- **Entradas:** Conjunto de documentos (contratos, atos societários, laudos).
- **Saídas:** Lista de documentos analisados, pontos de atenção, resumos por documento, timeline de eventos.
- **Agente:** Focado em extração e estruturação; sem conclusões de mérito.

### 4.4 Pesquisa jurisprudencial (futuro)

- **Entradas:** Pergunta + base de conhecimento (jurisprudência selecionada) ou link para repositório interno.
- **Saídas:** Citações relevantes, súmulas e teses aplicáveis, sem inventar números de processo ou decisões.

---

## 5. Capacidades centrais (core capabilities)

### 5.1 Documentos e ingestão

| Capacidade | Descrição | Prioridade v1 |
|------------|-----------|----------------|
| **Upload multi-formato** | PDF, DOC, DOCX, JPEG, PNG; suporte a arrastar-e-largar e seletor de ficheiros. | ✅ Já existe |
| **Extração de texto** | Extrair texto de PDF/DOC/DOCX no backend (ou no cliente) e enviar como parte `document` no chat. | ✅ Já existe |
| **Tipagem de peça** | Utilizador pode marcar cada documento como "Petição Inicial" ou "Contestação"; backend normaliza para o agente. | ✅ Já existe |
| **OCR para escaneados** | Quando o PDF é imagem ou o texto extraído está vazio, acionar pipeline de OCR e usar o texto resultante. | 🔶 Desejável v1 |
| **Metadados automáticos** | IA ou heurísticas para sugerir tipo de peça, número de páginas, partes (reclamante/reclamado); exibir na UI. | 🔶 Desejável v1 |

### 5.2 Validação e fluxo

| Capacidade | Descrição | Prioridade v1 |
|------------|-----------|----------------|
| **GATE-1 no agente** | Instruções do Revisor exigem PI + Contestação; se faltar, o agente para e pede. | ✅ Já existe |
| **Validação pré-envio** | No frontend (e/ou em `/api/files/process`): verificar existência de pelo menos um doc tipado como PI e um como Contestação antes de permitir "Iniciar revisão" ou enviar. | 🔶 Especificado |
| **Checklist “Antes de executar”** | UI (wizard ou painel) com lista: PI anexada, Contestação anexada, opcionais, @bancodetese. | 🔶 Especificado |
| **GATE 0.5 e confirmação** | Agente exibe resumo delimitado (`--- GATE_0.5_RESUMO ---` … `--- /GATE_0.5_RESUMO ---`); cliente pode mostrar botões CONFIRMAR / CORRIGIR. | ✅ Já existe (lógica); UI de botões pode ser reforçada |

### 5.3 Chat e agentes

| Capacidade | Descrição | Prioridade v1 |
|------------|-----------|----------------|
| **Chat em streaming** | POST `/api/chat` com `message` ou `messages`, `selectedChatModel`, `knowledgeDocumentIds`, `agentInstructions` opcional. | ✅ Já existe |
| **Agente padrão** | Revisor de Defesas (instruções em `lib/ai/agent-revisor-defesas.ts`); aplicado quando `agentInstructions` não é enviado. | ✅ Já existe |
| **Instruções customizadas** | `agentInstructions` (até 4000 caracteres) para sobrescrever/complementar o agente (ex.: outro domínio). | ✅ Já existe |
| **Base de conhecimento** | `knowledgeDocumentIds` (até 20); servidor busca documentos e injeta no system prompt em "Base de conhecimento". | ✅ Já existe |
| **Multi-agente (escolha na UI)** | Selector "Revisor de Defesas" / "Análise de contratos" (futuro); mapeia para conjunto de instruções + tools. | 🔶 Desejável (após 2.º agente) |
| **Multi-modelo** | Utilizador escolhe modelo (ex.: melhor para análise vs. escrita); enviado em `selectedChatModel`. | ✅ Já existe (selector de modelo) |

### 5.4 RAG e base de conhecimento

| Capacidade | Descrição | Prioridade v1 |
|------------|-----------|----------------|
| **Injeção direta** | Conteúdo completo dos documentos selecionados concatenado no prompt. | ✅ Já existe |
| **RAG (embeddings)** | Chunking dos `KnowledgeDocument`; embeddings; busca por similaridade à pergunta; injetar só trechos relevantes no prompt. | 🔶 Especificado (ver `lib/ai/knowledge-base.md`) |
| **Limite de contexto** | Evitar estourar contexto/custo; RAG ou sumarização quando há muitos documentos longos. | 🔶 Com RAG |

### 5.5 Saídas e artefactos

| Capacidade | Descrição | Prioridade v1 |
|------------|-----------|----------------|
| **createDocument** | Ferramenta do agente que cria artefacto (text/code/sheet) com título e conteúdo; persistido em `Document`. | ✅ Já existe |
| **3 DOCX (conteúdo)** | Conteúdo gerado conforme modelos em `lib/ai/modelos/`; formato Arial 12pt, tabelas, sinalização. | ✅ Já existe |
| **Export DOCX** | Download em formato .docx (hoje o utilizador pode copiar; export nativo é melhoria). | 🟡 Futuro |
| **Links/refs na ENTREGA** | Agente entrega referências aos documentos gerados e reforça ressalvas (revisão humana). | ✅ Já existe |

### 5.6 Segurança e conformidade

| Capacidade | Descrição | Prioridade v1 |
|------------|-----------|----------------|
| **Isolamento por utilizador** | Chats, mensagens, documentos, base de conhecimento filtrados por `userId`. | ✅ Já existe |
| **Auth** | Auth.js (NextAuth) v5; sessão obrigatória para chat e conhecimento. | ✅ Já existe |
| **Dados não usados para treino** | Política explícita e, quando aplicável, uso de APIs com opt-out de treino (ex.: OpenAI, Anthropic). | 🔶 Documentar e declarar na UI |
| **Criptografia** | TLS em trânsito; dados em repouso conforme infra (Vercel, Supabase). | ✅ Infra |
| **LGPD** | Tratamento de dados pessoais e sigilo profissional; documentação e consentimento onde aplicável. | 🔶 Especificado |

---

## 6. Funcionalidades de produto (feature list)

### 6.1 Upload e documentos

- [ ] **Upload por arrastar-e-largar e seletor** — múltiplos ficheiros por mensagem.
- [x] **Formatos:** PDF, DOC, DOCX, JPEG, PNG.
- [x] **Extração de texto** no backend (ou cliente) e envio como parte `document` com `documentType` opcional (`pi` | `contestacao`).
- [ ] **OCR** quando texto extraído estiver vazio ou for PDF escaneado (pipeline opcional).
- [ ] **Sugestão automática de tipo** (PI/Contestação) com base em conteúdo ou metadados.
- [ ] **Validação pré-envio:** bloquear ou avisar se não houver pelo menos uma PI e uma Contestação quando o agente for Revisor de Defesas.

### 6.2 Chat e conversa

- [x] **Streaming** de respostas; histórico de mensagens; suporte a partes `text`, `file`, `document`.
- [x] **Selector de modelo** (`selectedChatModel`).
- [x] **Instruções do agente** opcionais (`agentInstructions`).
- [x] **Base de conhecimento** no header (seleção de até 20 documentos); envio em `knowledgeDocumentIds`.
- [x] **Seletor de prompts** no chat (menu "Sugestões" com prompts contextuais: explicar fluxo, auditar contestação, roteiros, @bancodetese).
- [ ] **Indicador de etapa** (FASE A / FASE B) e botões CONFIRMAR / CORRIGIR quando o cliente detectar GATE 0.5.

### 6.3 Revisor de Defesas (workflow)

- [x] **GATE-1:** Validação de PI + Contestação nas instruções do agente.
- [x] **FASE A:** Extração e mapeamento; sem geração dos 3 DOCX.
- [x] **GATE 0.5:** Resumo no chat; aguardar CONFIRMAR ou CORRIGIR.
- [x] **FASE B:** Geração dos 3 DOCX via `createDocument`.
- [x] **ENTREGA:** Referências aos documentos e ressalvas.
- [x] **Regras:** Prescrição, mapeamento de pedidos, sinalização, siglas, formatação conforme modelos.
- [ ] **Checklist “Antes de executar”** na UI.

### 6.4 Base de conhecimento e RAG

- [x] **CRUD** de `KnowledgeDocument` (listar, criar, apagar); GET por ids para o chat.
- [x] **Injeção no system prompt** como "Base de conhecimento".
- [ ] **RAG:** Chunking, embeddings, busca por similaridade; injetar só trechos relevantes (ver `lib/ai/knowledge-base.md`).

### 6.5 Segurança e política

- [x] **Autenticação** obrigatória para chat e conhecimento.
- [x] **Rate limit** por tipo de utilizador (guest, regular).
- [ ] **Política “dados não usados para treino”** publicada e referida na UI.
- [ ] **Aviso de revisão humana** em todas as entregas relevantes (Doc 1 já tem).

---

## 7. Arquitetura técnica

### 7.1 Stack (alineada ao projeto atual)

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | Next.js 16 (App Router), React 19 |
| **API** | Route Handlers (App Router); POST `/api/chat`, `/api/knowledge`, `/api/files/upload`, `/api/files/process`, etc. |
| **IA** | Vercel AI SDK (`streamText`), AI Gateway (xAI, OpenAI, Anthropic, Google, etc.) |
| **Base de dados** | PostgreSQL (Supabase/Neon), Drizzle ORM |
| **Auth** | Auth.js (NextAuth) v5 beta |
| **Storage** | Vercel Blob ou Supabase Storage (upload de ficheiros) |
| **Lint/Format** | Ultracite (Biome) |

### 7.2 Fluxo de dados (chat)

```
Cliente (useChat)
  → POST /api/chat { id, message, selectedChatModel, knowledgeDocumentIds?, agentInstructions? }
  → route.ts: auth, rate limit, getKnowledgeDocumentsByIds, systemPrompt(), streamText(model, system, messages, tools)
  → Resposta em streaming; tool calls (createDocument, updateDocument, etc.) conforme instruções do agente
```

### 7.3 Componentes críticos

| Componente | Ficheiro / local |
|------------|-------------------|
| Instruções do Revisor | `lib/ai/agent-revisor-defesas.ts` → `AGENTE_REVISOR_DEFESAS_INSTRUCTIONS` |
| System prompt | `lib/ai/prompts.ts` → `systemPrompt()` |
| Handler do chat | `app/(chat)/api/chat/route.ts` |
| Schema do body | `app/(chat)/api/chat/schema.ts` |
| Tools | `lib/ai/tools/` (createDocument, updateDocument, requestSuggestions, getWeather) |
| Base de conhecimento (doc) | `lib/ai/knowledge-base.md` |
| Modelos dos 3 DOCX | `lib/ai/modelos/` (MODELO_PARECER_EXECUTIVO, MODELO_ROTEIRO_*, etc.) |

### 7.4 Extensões para “AI Drive Jurídico”

- **Validação pré-envio:** Endpoint ou lógica em `/api/files/process` (ou no cliente) que, antes de enviar a primeira mensagem do Revisor, verifica se existe pelo menos um `document` com `documentType: "pi"` e um com `documentType: "contestacao"`.
- **OCR:** Serviço ou função (ex.: Tesseract, ou API de OCR em nuvem) chamado quando a extração de texto de um PDF/imagem retorna vazio ou muito curto; resultado armazenado ou devolvido como texto da parte `document`.
- **RAG:** Tabela (ex.: `knowledge_chunk`) com `documentId`, `chunkIndex`, `text`, `embedding`; no chat, embedding da pergunta → busca top-k → montar `knowledgeContext` com só esses trechos.
- **Multi-agente:** Registry de agentes (id → instruções + tools); selector na UI envia `agentId` ou `agentInstructions` correspondente.

---

## 8. Modelo de dados e APIs

### 8.1 Entidades principais (existentes)

- **User** — id, email, password (Auth).
- **Chat** — id, userId, title, visibility, createdAt.
- **Message_v2** — id, chatId, role, parts, attachments, createdAt.
- **Document** — id, createdAt, title, content, kind (text/code/image/sheet), userId (artefactos do agente).
- **KnowledgeDocument** — id, userId, title, content, createdAt.
- **Vote_v2** — feedback por mensagem (opcional).

### 8.2 Partes de mensagem (chat)

- **text** — texto livre (máx. 2000 caracteres no schema atual).
- **file** — imagem (JPEG/PNG) com url (ex.: Blob/Storage).
- **document** — texto extraído de PDF/DOC/DOCX; `name`, `text` (máx. 500k), `documentType` opcional (`pi` | `contestacao`).

### 8.3 APIs principais

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/chat` | Enviar mensagem ou histórico; receber stream. Body: id, message ou messages, selectedChatModel, selectedVisibilityType, agentInstructions?, knowledgeDocumentIds?. |
| GET/POST/DELETE | `/api/knowledge` | Listar, criar, apagar KnowledgeDocument. GET com `?ids=...` para buscar por ids. |
| POST | `/api/files/upload` | Obter URL ou token para upload (Blob/Storage). |
| POST | `/api/files/process` | Processar ficheiro (extração de texto, OCR); retornar texto para parte `document`. |
| GET | `/api/document` | Obter artefacto (Document) por id (conforme implementação atual). |

### 8.4 Evolução de dados (RAG)

- **knowledge_chunk** — id, knowledgeDocumentId, chunkIndex, text, embedding (vector), createdAt.
- Migração: criar tabela, extensão pgvector se necessário; no create/update de KnowledgeDocument, gerar chunks e embeddings.

---

## 9. Segurança e conformidade

### 9.1 Princípios

- **Minimização de dados** — só recolher o necessário para o serviço (peças, base de conhecimento, histórico de chat).
- **Isolamento** — todos os dados associados a `userId`; sem partilha entre utilizadores.
- **Não treino** — declarar que os dados do utilizador não são usados para treinar modelos; usar APIs com opt-out quando disponível.
- **Sigilo profissional** — tratamento compatível com o dever de sigilo do advogado (acesso restrito, criptografia, políticas de retenção).

### 9.2 Medidas técnicas

- HTTPS (TLS) em todo o tráfego.
- Autenticação obrigatória para rotas de chat, conhecimento e documentos.
- Variáveis de ambiente para segredos (AUTH_SECRET, POSTGRES_URL, chaves de API); nenhum segredo em código.
- Rate limiting por utilizador/tipo para evitar abuso.
- Logs sem conteúdo sensível das mensagens (ou logs desativados em produção para conteúdo).

### 9.3 Conformidade

- **LGPD** — base legal para processamento; direito de acesso, correção e eliminação; documentação de medidas de segurança.
- **Código de Ética (OAB)** — sigilo e uso de tecnologia de forma a não violar deveres profissionais.
- **Política de privacidade e termos** — publicadas e acessíveis; menção a IA e revisão humana.

---

## 10. UX/UI e fluxos

### 10.1 Princípios

- **Clareza do fluxo** — o advogado deve saber: 1) o que anexar (PI + Contestação); 2) quando confirmar (GATE 0.5); 3) onde encontrar os 3 DOCX.
- **Feedback imediato** — indicar etapa (FASE A / FASE B), botões CONFIRMAR/CORRIGIR quando aplicável, erros de validação antes de enviar.
- **Acessibilidade** — seguir regras do Ultracite (labels, roles, teclado, sem uso de accessKey, etc.).

### 10.2 Fluxo principal (Revisor de Defesas)

1. **Entrada** — Utilizador anexa ficheiros e marca PI e Contestação (ou sistema sugere).
2. **Validação** — UI ou API valida PI + Contestação; se faltar, bloquear envio ou avisar.
3. **Envio** — Primeira mensagem (ex.: "Auditar contestação") com anexos.
4. **GATE-1** — Agente confirma presença de A+B ou pede o que falta.
5. **FASE A** — Agente devolve extração e mapeamento; não gera DOCX.
6. **GATE 0.5** — Agente exibe resumo; cliente mostra CONFIRMAR / CORRIGIR.
7. **Confirmação** — Utilizador clica CONFIRMAR (ou envia CORRIGIR com texto).
8. **FASE B** — Agente gera os 3 DOCX via createDocument.
9. **ENTREGA** — Agente envia links/refs e ressalvas.

### 10.3 Elementos de interface

- **Greeting:** Título "Revisor de Defesas Trabalhistas" (ou "AI Drive Jurídico" quando multi-agente), descrição e instrução para começar (PI + Contestação).
- **Placeholder:** "Cole o texto da Petição Inicial e da Contestação, ou anexe documentos..."
- **Sidebar:** Nome do produto; lista de chats.
- **Header:** Base de conhecimento (seleção de documentos); Instruções do agente (opcional); selector de modelo.
- **Checklist:** Painel ou modal "Antes de executar" com itens: PI anexada, Contestação anexada, opcionais, @bancodetese.

---

## 11. Roadmap (sugestão)

### Fase 1 — Revisor sólido (v1)

- Validação pré-envio (PI + Contestação) no frontend ou em `/api/files/process`.
- Checklist "Antes de executar" na UI.
- Botões CONFIRMAR / CORRIGIR quando GATE 0.5 for detectado no stream.
- Documentação de política "dados não usados para treino" e aviso na UI.
- (Opcional) OCR para PDFs escaneados quando extração de texto falhar.

### Fase 2 — Base de conhecimento e escala

- RAG: chunking, embeddings, busca por similaridade; injetar só trechos relevantes no prompt.
- Melhorias de UX: indicador de etapa (FASE A/B), nomes de ficheiros dos DOCX na ENTREGA.

### Fase 3 — Multi-agente e novos domínios

- Segundo agente (ex.: Análise de contratos) com instruções e tools próprios.
- Selector de agente na UI ("Revisor de Defesas" | "Análise de contratos").
- (Opcional) Export dos artefactos para .docx nativo.

### Fase 4 — Produto e escala

- Multi-inquilino / equipas (escritórios) com quotas e RBAC.
- Integração opcional com sistemas processuais (upload a partir de link ou integração PJe/e-SAJ, se APIs disponíveis).
- Certificações e conformidade (ISO, SOC2, etc.) conforme mercado-alvo.

---

## 12. Métricas de sucesso

| Métrica | Descrição | Meta (exemplo) |
|---------|-----------|----------------|
| **Conclusão do fluxo** | % de conversas que chegam à ENTREGA (3 DOCX gerados) sem desistir no meio. | Aumentar após validação pré-envio e checklist. |
| **Tempo até primeira entrega** | Tempo desde a primeira mensagem até à exibição dos 3 DOCX. | Reduzir com menos idas e voltas (GATE-1 resolvido à primeira). |
| **Satisfação** | Feedback (votos, NPS ou inquérito) sobre utilidade dos DOCX. | Manter ou melhorar. |
| **Uso da base de conhecimento** | % de sessões que usam pelo menos um documento em `knowledgeDocumentIds`. | Aumentar com UX clara do @bancodetese. |
| **Erros de contexto** | Falhas por estouro de contexto ou timeout; reduzir com RAG. | Reduzir após RAG. |

---

## 13. Referências e glossário

### 13.1 Documentos do projeto

- **Agente e fluxo:** `lib/ai/agent-revisor-defesas.ts`, `docs/PROJETO-REVISOR-DEFESAS.md`
- **Upload e validação:** `docs/processo-revisor-upload-validacao.md`
- **Base de conhecimento e RAG:** `lib/ai/knowledge-base.md`
- **Guia para agentes:** `AGENTS.md`
- **Checklist revisor:** `.agents/skills/revisor-defesas-context/SKILL.md`

### 13.2 Referências externas

- [AI Drive](https://myaidrive.com/pt-BR) — referência de produto para document intelligence e agentes.
- [Vercel AI SDK](https://sdk.vercel.ai/docs/introduction)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)

### 13.3 Glossário

| Termo | Significado |
|-------|-------------|
| **PI** | Petição Inicial |
| **GATE-1** | Validação de entradas obrigatórias (PI + Contestação) |
| **GATE 0.5** | Confirmação do utilizador antes de gerar os 3 DOCX |
| **FASE A** | Extração e mapeamento; sem geração de documentos |
| **FASE B** | Geração dos 3 DOCX (Avaliação, Roteiro Advogado, Roteiro Preposto) |
| **@bancodetese** | Base de conhecimento com teses e precedentes para o Quadro de teses do Doc 1 |
| **RAG** | Retrieval-Augmented Generation — busca por relevância e injeção de trechos no prompt |
| **Artifact / artefacto** | Documento gerado pelo agente (Document em DB), ex.: os 3 DOCX |

---

*Fim da spec. Este documento serve como referência para decisões de produto e implementação do AI Drive Jurídico; alterações devem ser refletidas aqui e, quando aplicável, nos ficheiros de código e documentação referenciados.*
