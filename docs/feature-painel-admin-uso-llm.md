# Feature futura: Painel administrativo para controle de uso de LLM

Documento de especificação para uma **feature futura**: painel administrativo que permita visualizar e controlar o consumo de modelos de linguagem (tokens, custos estimados, limites por utilizador).

---

## 1. Objetivos

| Objetivo | Descrição |
|----------|-----------|
| **Visibilidade** | Dar à equipa/admin visibilidade sobre quanto está a ser consumido de LLM (tokens por modelo, por utilizador, por período). |
| **Controlo** | Permitir definir ou ajustar limites de uso (por utilizador, por tipo de conta) além do atual limite de mensagens/dia. |
| **Custo** | Opcionalmente exibir estimativa de custo (€/$) com base em preços por modelo, para planeamento e faturação. |

---

## 2. Estado atual (contexto)

### O que já existe

- **Limite por mensagens:** Em `lib/ai/entitlements.ts` existe um limite diário por tipo de utilizador (guest: 20, regular: 50 mensagens/dia). A contagem é feita com `getMessageCountByUserId` em `app/(chat)/api/chat/route.ts` (últimas 24h).
- **Chat e stream:** O chat usa `streamText()` do Vercel AI SDK. O resultado do `streamText` inclui **uso de tokens** (`usage.promptTokens`, `usage.completionTokens`), mas **não é persistido** em base de dados.
- **Telemetria:** Em produção está ativo `experimental_telemetry` no `streamText`, que envia dados para a Vercel (dashboard deles), não para um painel próprio.

### O que não existe

- Tabela ou entidade para registar uso de tokens por request.
- Área ou rotas administrativas (`/admin`, layout protegido por role).
- Dashboard com gráficos ou listagens de consumo LLM.
- Limites baseados em tokens (apenas em número de mensagens).

---

## 3. Âmbito da feature

### Dentro do âmbito (v1)

- Persistir **uso de tokens** por cada resposta do LLM (promptTokens, completionTokens, modelo, utilizador, chat, data).
- Criar **área administrativa** protegida (só utilizadores com role admin).
- **Dashboard** com:
  - Totais de tokens por período (dia, semana, mês).
  - Uso por utilizador (opcional: por chat).
  - Uso por modelo (id do modelo usado no chat).
- Opcional: **estimativa de custo** por período/modelo (tabela de preços por 1k tokens).

### Fora do âmbito (v1)

- Faturação automática ou integração com gateway de pagamentos.
- Limites dinâmicos por token em tempo real (bloquear request se exceder); pode ser fase posterior.
- Gestão de utilizadores (CRUD) dentro do painel; apenas visualização de uso.

---

## 4. Visão do utilizador: meu consumo por dia

Cada utilizador autenticado (e, se desejável, guest com sessão identificada) deve poder **ver o próprio consumo** de LLM, por dia e por período, sem aceder ao painel admin.

### Onde o utilizador vê

- **Página “Meu uso” ou “Consumo”** acessível a partir da conta (menu do utilizador na sidebar, ex.: “Meu uso” ou dentro de “Definições”).
- Rotas sugeridas: `app/(chat)/uso/page.tsx` ou `app/(chat)/conta/uso/page.tsx` (ou dentro de um grupo `(conta)` com layout comum).

### O que mostrar

| Dado | Descrição |
|------|-----------|
| **Por dia** | Total de tokens (ou “unidades de uso”) no dia; opcionalmente por modelo. Período configurável: últimos 7, 14 ou 30 dias. |
| **Resumo do período** | Total de tokens no intervalo; número de conversas/pedidos; opcionalmente custo estimado se o plano exibir (ex.: plano pago). |
| **Limite do plano** | Se o modelo de negócio tiver limites por plano: “Usou X de Y tokens este mês” ou “X mensagens de Y hoje”, com barra de progresso. |

### API para o utilizador

- **GET** `/api/usage` (ou `/api/me/usage`):
  - Sem query params obrigatórios; o `userId` vem da sessão.
  - Query params opcionais: `from`, `to` (datas), `groupBy` (day | model).
  - Retorno: agregados **apenas do utilizador da sessão** (tokens por dia, por modelo, totais). Não expor outros utilizadores.
  - Protegido: requer sessão; guest pode ter endpoint restrito ou só contagem de mensagens se ainda não houver tabela de tokens.

### UI sugerida (utilizador)

- Cards: “Hoje”, “Esta semana”, “Este mês” (tokens ou “unidades”).
- Gráfico de barras ou linhas: consumo por dia nos últimos N dias.
- Opcional: tabela resumo por modelo (ex.: “Grok 3 Mini: 12k tokens; Claude Sonnet: 5k tokens”).
- Se houver limite do plano: barra “X / Y tokens” e aviso quando se aproximar do limite.

### Dados necessários

- Depende da tabela `LlmUsage` (secção 6): ao persistir uso por `userId`, a API de “meu uso” faz `WHERE userId = session.user.id` e agrega por dia/modelo. Para guests, definir se se persiste `userId` (guest id) ou se “meu uso” fica só para contas registadas.

---

## 5. Modelo de negócio

Sugestão de opções alinhadas com limites, visibilidade de uso e possível monetização. O projeto já tem **entitlements por tipo** (guest / regular) com `maxMessagesPerDay`; o modelo de negócio pode estender-se por **mensagens**, **tokens** ou **planos**.

### Opção A: Freemium por mensagens (atual + evolução)

| Plano | Limite | Visibilidade |
|-------|--------|--------------|
| **Guest** | 20 mensagens/dia | Sem página “Meu uso” ou só “mensagens usadas hoje”. |
| **Registado (grátis)** | 50 mensagens/dia | “Meu uso”: mensagens e, quando existir, tokens por dia. |
| **Pro / Pago** | Mensagens/dia mais altas ou ilimitado (com fair use) | “Meu uso” completo; opcional custo estimado. |

- **Vantagem:** Simples; já parcialmente implementado.  
- **Monetização:** Assinatura mensal/anual para Pro; limite de tokens opcional para evitar abuso.

### Opção B: Créditos em tokens (tokens como moeda)

- Cada plano tem um **saldo de tokens por mês** (ou “créditos” = múltiplo de tokens). Ex.: Plano Free = 100k tokens/mês; Pro = 1M tokens/mês.
- Cada resposta do LLM desconta do saldo do utilizador (persistir uso em `LlmUsage` e somar no período).
- **Visibilidade:** “Meu uso” mostra “Usou X tokens este mês (limite Y)” e consumo por dia.
- **Monetização:** Planos com mais tokens; pacotes avulso de tokens; ou upgrade quando acabar.

Requer: tabela de saldo ou cálculo “soma(LlmUsage) no mês” vs. limite por plano; bloqueio ou aviso quando exceder.

### Opção C: Tiers (Free / Pro / Equipa)

| Tier | Mensagens/dia | Tokens/mês (opcional) | Preço |
|------|----------------|-----------------------|-------|
| **Free** | 50 | 50k (ex.) | 0 € |
| **Pro** | 200 ou ilimitado* | 500k ou 1M | 9,99 €/mês |
| **Equipa** | Por utilizador | Por utilizador | Por lugar |

\* “Ilimitado” com fair use (ex.: alerta acima de 10k tokens/dia).

- **Visibilidade:** “Meu uso” e, no admin, uso por equipa/utilizador.
- **Monetização:** Assinatura por tier; equipa paga por número de lugares.

### Recomendações para implementação

1. **Fase 1:** Manter limites por **mensagens/dia** (já existe); adicionar **persistência de tokens** e **“Meu uso”** (consumo por dia). Sem alterar preços ainda.
2. **Fase 2:** Definir um único modelo (A, B ou C); estender `lib/ai/entitlements.ts` com limites por plano (ex.: `maxTokensPerMonth`, `maxMessagesPerDay` por tier).
3. **Fase 3:** Se monetizar: integração com Stripe (ou similar) para planos Pro/Equipa; mostrar no “Meu uso” o limite do plano e opção de upgrade.

A tabela `LlmUsage` e a API de “meu uso” servem qualquer uma das opções; a diferença está nos limites que se verificam no backend e no que se exibe na UI (mensagens vs. tokens vs. “créditos”).

---

## 6. Modelo de dados proposto

### Nova tabela: `LlmUsage` (ou `llm_usage`)

Registo por cada resposta do modelo (uma linha por “turno” do assistente).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK, default random. |
| `chatId` | uuid | FK para Chat. |
| `userId` | uuid | FK para User (quem fez o pedido). |
| `modelId` | varchar | Identificador do modelo (ex.: `grok-3-mini`, `claude-sonnet-4`). |
| `promptTokens` | integer | Tokens de entrada. |
| `completionTokens` | integer | Tokens de saída. |
| `totalTokens` | integer (opcional) | promptTokens + completionTokens (redundante mas útil para agregações). |
| `createdAt` | timestamp | Momento do uso. |

Índices sugeridos: `(userId, createdAt)`, `(createdAt)`, `(modelId, createdAt)` para consultas do dashboard.

### Tabela opcional: preços por modelo

Para estimativa de custo no dashboard.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `modelId` | varchar | PK, id do modelo. |
| `inputPricePer1k` | decimal | Custo por 1k tokens de input (ex.: 0.001). |
| `outputPricePer1k` | decimal | Custo por 1k tokens de output. |
| `currency` | varchar | ex.: EUR, USD. |
| `updatedAt` | timestamp | Última atualização. |

---

## 7. Captura do uso no chat

- **Onde:** Em `app/(chat)/api/chat/route.ts`, no fluxo do `createUIMessageStream`, após cada conclusão de resposta do modelo.
- **Como:** O `streamText` devolve um objeto com `usage`. É necessário obter esse valor quando o stream termina. No AI SDK, o resultado de `streamText` é uma Promise que resolve com `usage` (e em multi-step, `totalUsage`). Opções:
  - **A)** Dentro do `execute`, fazer `await result` após `dataStream.merge(result.toUIMessageStream(...))` e, quando disponível, ler `result.usage` e gravar na nova tabela (assincronamente, sem bloquear a resposta).
  - **B)** Usar um callback ou evento “onStreamEnd” se o SDK expuser, e gravar aí.
- **Dados a guardar:** `chatId`, `userId` (da sessão), `modelId` = `selectedChatModel`, `promptTokens`, `completionTokens`, `createdAt`. Inserção via Drizzle na nova tabela.

---

## 8. Área administrativa

### Rotas

- `app/(admin)/layout.tsx` — Layout que verifica sessão e role; se não for admin, redirecionar (ex.: para `/`) ou 403.
- `app/(admin)/dashboard/page.tsx` — Página principal do painel (overview de uso).
- Opcional: `app/(admin)/usage/page.tsx` — Página dedicada a “Uso LLM” (gráficos por período, por utilizador, por modelo).

### Autenticação e autorização

- Usar a sessão existente (Auth.js). Garantir que o utilizador tem um **role** (ex.: `user.role === 'admin'`). Se o schema de User não tiver `role`, será necessário adicionar (migration) ou usar outra condição (ex.: lista de emails admin em env).
- Middleware ou check no layout: `if (!session || session.user.role !== 'admin') redirect('/')`.

### Navegação

- Link “Administração” ou “Dashboard” na sidebar ou no menu do utilizador, **visível apenas para admins**, apontando para `/admin` ou `/admin/dashboard`.

---

## 9. API para o dashboard (admin)

- **GET** `/api/admin/usage` (ou `/api/admin/llm-usage`):
  - Query params opcionais: `from`, `to` (datas), `userId`, `modelId`, `groupBy` (day | user | model).
  - Retorno: agregados (soma de tokens, contagem de requests) conforme `groupBy` e filtros.
  - Protegido: apenas chamadas com sessão admin.

Dados típicos para gráficos:

- Por dia: `{ date, promptTokens, completionTokens, totalTokens, requestCount }`.
- Por utilizador: `{ userId, email?, promptTokens, completionTokens, totalTokens, requestCount }`.
- Por modelo: `{ modelId, promptTokens, completionTokens, totalTokens, requestCount }`.

Se existir tabela de preços, o backend pode calcular custo estimado por linha e devolver também `estimatedCost` por período/modelo.

---

## 10. UI do dashboard admin (sugestão)

- **Cards de totais:** Total de tokens (ou custo estimado) no período selecionado; total de requests.
- **Filtros:** Intervalo de datas; opcionalmente utilizador, modelo.
- **Gráficos:** Barras ou linhas por dia; opcionalmente por utilizador ou por modelo (tabela ou gráfico de barras).
- **Tabela:** Listagem de utilizadores com totais de uso no período; ou listagem de últimos N registos de uso (para auditoria).
- Stack de UI: manter a mesma do projeto (ex.: componentes em `components/ui`); para gráficos, considerar Recharts ou similar, já alinhado com React.

---

## 11. Segurança e boas práticas

- Não expor dados sensíveis de conteúdo de mensagens no dashboard; apenas metadados de uso (tokens, ids, datas).
- Rate limiting nas rotas `/api/admin/*` para evitar abuso.
- Logs de acesso ao painel (quem acedeu e quando) são opcionais mas recomendáveis para auditoria.
- Variáveis de ambiente: não guardar preços por modelo em código; preferir tabela na BD ou config (env) lida apenas no backend.

---

## 12. Fases de implementação sugeridas

| Fase | Descrição |
|------|-----------|
| **1. Dados** | Migration para tabela `LlmUsage`; na route do chat, capturar `usage` do `streamText` e inserir registos. |
| **2. Meu uso (utilizador)** | Endpoint `GET /api/usage` (sessão = userId); página “Meu uso” / “Consumo” com consumo por dia e totais. |
| **3. Admin base** | Layout `(admin)` com check de role; rota `/admin/dashboard` com página estática ou placeholder. |
| **4. API admin** | Endpoint `GET /api/admin/usage` com filtros e agregações; proteção por role. |
| **5. Dashboard admin** | Gráficos e tabelas na página do painel consumindo a API; filtros por datas. |
| **6. Opcional** | Tabela de preços por modelo; campo “custo estimado” nas respostas da API e no UI. |
| **7. Opcional** | Limites por tokens e/ou planos (entitlements); “Meu uso” mostra limite do plano e opção de upgrade. |

---

## 13. Referências no projeto

| Ficheiro / Área | Relevância |
|-----------------|------------|
| `app/(chat)/api/chat/route.ts` | Onde injetar a leitura de `usage` e a gravação em `LlmUsage`. |
| `lib/db/schema.ts` | Onde definir a nova tabela; depois `drizzle-kit generate` e migrate. |
| `lib/ai/entitlements.ts` | Limites atuais por mensagens; eventual extensão para limites por tokens. |
| `lib/db/queries.ts` | Novas funções: `insertLlmUsage`, `getLlmUsageAggregates`, etc. |
| Auth / `session.user` | Onde definir ou ler `role` para proteção do admin. |
| `components/app-sidebar.tsx` | Onde adicionar link “Administração” (admin) e “Meu uso” (todos os autenticados). |
| `AGENTS.md` | Atualizar com a nova área (admin), rotas de uso e variáveis de ambiente se necessário. |

---

## 14. Documentos relacionados

- [PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md) — Arquitetura do agente e stack.
- [vercel-setup.md](vercel-setup.md) — Variáveis de ambiente e deploy (AI Gateway, custos na Vercel).
- [AGENTS.md](../AGENTS.md) — Regras e estrutura do projeto para agentes de IA.
