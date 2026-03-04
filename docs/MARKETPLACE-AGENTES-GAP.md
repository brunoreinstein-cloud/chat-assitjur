# O que falta para ser um "Marketplace de Agentes"

Documento de análise: estado atual dos agentes no projeto vs. requisitos de um marketplace.

**Última atualização:** 2026-03-04

---

## 1. Estado atual (o que já existe)

| Capacidade | Estado | Onde |
|------------|--------|------|
| **Agentes built-in** | ✅ | 4 agentes em código: Assistente, Revisor de Defesas, Redator de Contestações, AssistJur Master (`lib/ai/agents-registry.ts`, `agents-registry-metadata.ts`). |
| **Override por admin** | ✅ | Painel `/admin/agents`: editar instruções e label dos built-in; API `GET/PATCH /api/admin/agents`, tabela `BuiltInAgentOverride`. |
| **Agentes personalizados (por utilizador)** | ✅ | "Meus agentes": criar/editar/apagar; nome, instruções, `baseAgentId`, `knowledgeDocumentIds`; tabela `CustomAgent`; APIs `GET/POST /api/agents/custom`, `GET/PATCH/DELETE /api/agents/custom/[id]`. |
| **Seleção no chat** | ✅ | Dropdown no header: built-in + "Meus agentes"; `agentId` no body do `POST /api/chat`. |
| **Base de conhecimento por agente** | ✅ | CustomAgent tem `knowledgeDocumentIds`; ao escolher o agente, docs podem ser pré-carregados. |

Ou seja: já há **catálogo fixo (built-in)** e **agentes privados por utilizador**. Não há partilha, descoberta nem oferta centralizada de agentes de terceiros.

---

## 2. Conceito de "Marketplace de Agentes"

Um marketplace permite:

1. **Publicar** — Um utilizador (ou escritório) publica um agente para outros poderem usar.
2. **Descobrir** — Listar e pesquisar agentes por categoria, autor, popularidade, avaliações.
3. **Instalar / usar** — Adicionar o agente à minha lista ("Meus agentes") ou usar um agente partilhado com permissões.
4. **Opcional: monetização** — Agentes pagos, assinaturas, partilha de receita.

---

## 3. O que falta (gap)

### 3.1 Modelo de dados e publicação

| Item | Descrição |
|------|-----------|
| **Entidade "Agente do Marketplace"** | Nova tabela (ex.: `MarketplaceAgent` ou `PublishedAgent`) com: id, authorId (ou orgId), nome, descrição, instruções (ou referência a um CustomAgent aprovado para publicação), baseAgentId, categoria, ícone/avatar, versão, estado (rascunho / pendente moderação / publicado / rejeitado), createdAt, updatedAt. |
| **Política de publicação** | Quem pode publicar: todos os utilizadores autenticados, ou só certos roles (ex.: admin, "publicador"). |
| **Moderação** | Fluxo opcional: submissão → revisão (manual ou automática) → publicado. Campos: status, reviewedAt, reviewedBy. |
| **Versões** | Opcional: versionar agentes publicados (v1, v2) para não quebrar quem já "instalou". |

Hoje não existe nenhuma entidade que represente "agente disponível no marketplace"; só built-in (código) e CustomAgent (privado por userId).

### 3.2 Catálogo e descoberta

| Item | Descrição |
|------|-----------|
| **Página ou secção "Marketplace"** | UI para listar agentes publicados: filtros (categoria, autor, texto), ordenação (mais usados, mais recentes, melhor avaliados). |
| **Categorias** | Ex.: Contencioso trabalhista, Redação, Due diligence, Pesquisa jurisprudencial. Definir lista fixa ou tags livres; campo em `MarketplaceAgent`. |
| **Ficha do agente** | Página ou drawer com: nome, descrição, autor, instruções (resumo ou completas), baseAgentId (qual agente base usa), botão "Adicionar aos meus agentes" / "Usar". |
| **API de listagem** | Ex.: `GET /api/marketplace/agents?category=...&q=...&sort=...` (público ou autenticado). |

Hoje a única "lista" de agentes é: (1) built-in fixos no código, (2) custom do utilizador via `/api/agents/custom` (só os dele).

### 3.3 Instalação / uso de um agente do marketplace

| Item | Descrição |
|------|-----------|
| **"Adicionar aos meus agentes"** | Ao clicar, criar um `CustomAgent` no utilizador atual copiando nome, instruções, baseAgentId (e opcionalmente knowledgeDocumentIds) do agente publicado. Ou: criar uma ligação "installed from marketplace" (referência ao MarketplaceAgent) para atualizações futuras. |
| **Permissões** | Se for "cópia": o utilizador passa a ser dono do CustomAgent e pode editá-lo. Se for "referência": pode ser só leitura (uso do agente publicado) com possível atualização quando o autor publicar nova versão. |
| **API** | Ex.: `POST /api/marketplace/agents/[id]/install` → cria CustomAgent para o userId da sessão e devolve o id. |

Hoje não há nenhum fluxo "instalar agente de terceiros"; CustomAgent é sempre criado manualmente pelo dono.

### 3.4 Avaliações e reputação (opcional)

| Item | Descrição |
|------|-----------|
| **Avaliações** | Tabela `MarketplaceAgentReview`: agentId, userId, rating (1–5), comentário opcional, createdAt. |
| **Métricas de uso** | Contar quantas vezes um agente do marketplace foi "instalado" ou quantas conversas usaram esse agente (ex.: contador em `MarketplaceAgent` ou tabela de eventos). |
| **Ordenação** | Na listagem, ordenar por média de rating, por número de instalações, etc. |

Não existe hoje.

### 3.5 Segurança e conformidade

| Item | Descrição |
|------|-----------|
| **Conteúdo das instruções** | Evitar que instruções publicadas contenham dados sensíveis ou prompts maliciosos; política clara e, se necessário, moderação ou listas de bloqueio. |
| **Base de conhecimento** | Agentes publicados: decidir se podem incluir referência a documentos (ex.: só documentos do autor, ou "template" sem documentos reais). Hoje CustomAgent tem `knowledgeDocumentIds` por utilizador; no marketplace pode ser "template" vazio e o instalador associa os seus docs. |
| **Rate limiting** | Limitar publicações e instalações por utilizador/org para abuso. |

Parcialmente coberto por boas práticas gerais (LGPD, política de dados); falta política específica para conteúdo do marketplace.

### 3.6 Monetização (opcional, futuro)

| Item | Descrição |
|------|-----------|
| **Agentes pagos** | Preço único ou assinatura por agente; integração com gateway de pagamentos (ex.: Stripe). |
| **Receita para o autor** | Partilha de receita plataforma vs. autor; tabelas de licença, histórico de pagamentos. |
| **Créditos** | Se o projeto já tem sistema de créditos (ex.: SPEC-CREDITOS-LLM), agentes premium podem consumir créditos adicionais ou exigir plano pago. |

Fora do âmbito atual; seria uma extensão após o marketplace "free" estar estável.

---

## 4. Resumo: roadmap mínimo para "Marketplace"

1. **Modelo de dados** — Criar tabela(s) para agente publicado (e opcionalmente avaliações e contadores).
2. **Publicação** — UI e API para um utilizador publicar um dos seus CustomAgents (ou criar um novo) no marketplace; estados (rascunho/publicado) e, se desejado, moderação.
3. **Catálogo** — Página "Marketplace" ou "Explorar agentes" com listagem e filtros; API `GET /api/marketplace/agents`.
4. **Instalação** — Botão "Adicionar aos meus agentes" e API `POST /api/marketplace/agents/[id]/install` que cria um CustomAgent para o utilizador a partir do agente publicado.
5. **Integração no chat** — Após instalação, o agente aparece em "Meus agentes" no selector; nenhuma alteração obrigatória no fluxo do chat além do que já existe para CustomAgent.
6. **Categorias e metadados** — Categorias fixas ou tags para filtrar e descrever agentes.
7. **(Opcional)** Avaliações, contagem de instalações, moderação, e depois monetização.

---

## 5. Referências no projeto

| Tema | Ficheiro / doc |
|------|----------------|
| Registry e config de agentes | `lib/ai/agents-registry.ts`, `lib/ai/agents-registry-metadata.ts` |
| Agentes personalizados | `docs/AGENTES-IA-PERSONALIZADOS.md` |
| CustomAgent (schema e queries) | `lib/db/schema.ts` (customAgent), `lib/db/queries.ts` (getCustomAgentsByUserId, createCustomAgent, etc.) |
| APIs custom agents | `app/(chat)/api/agents/custom/route.ts`, `app/(chat)/api/agents/custom/[id]/route.ts` |
| Selector no chat | `components/chat-composer-header.tsx`, `components/multimodal-input.tsx` (Meus agentes) |
| Produto e roadmap | `docs/SPEC-AI-DRIVE-JURIDICO.md` § 11 |

---

*Este documento pode ser atualizado à medida que o produto avance para um marketplace (ex.: novas tabelas, novas rotas, política de moderação).*
