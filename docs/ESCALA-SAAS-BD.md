# Escala e performance da BD para SaaS

Quando o produto virar um SaaS com muitos utilizadores e chamadas concorrentes ao chat, a base de dados e as conexões passam a ser um gargalo. Este documento descreve soluções em camadas: o que já existe, o que configurar em seguida e o que planear para escala maior.

---

## Situação atual

Em **cada mensagem** do chat, o `POST /api/chat` executa um **batch de queries** em paralelo antes de começar o stream:

| Query | Uso |
|-------|-----|
| `getOrCreateCreditBalance` | Saldo para verificar/deduzir créditos |
| `getMessageCountByUserId` | Limite de mensagens (ex.: 24h) |
| `getChatById` | Dados do chat |
| `getMessagesByChatId` | Histórico para contexto do LLM |
| `getCachedBuiltInAgentOverrides` | Instruções/etiquetas dos agentes (admin) |
| `getKnowledgeDocumentsByIds` | Base de conhecimento (se houver) |
| `getCustomAgentById` | Agente personalizado (se não for built-in) |

O stream **só começa** quando **todas** terminam (ou dão timeout aos 12s com fallback). Por isso, se a BD estiver lenta ou em cold start, o utilizador espera.

**Já implementado:**

- Pooler (porta 6543) para menos conexões e reutilização.
- Índice `Message_v2_chatId_role_createdAt_idx` para `getMessageCountByUserId` (migração 0023); ver `docs/DB-TIMEOUT-TROUBLESHOOTING.md` (secção 11).
- Cron a cada 10 min (`GET /api/health/db`) para manter a BD ativa em produção.
- DbWarmup ao abrir `/chat` para aquecer ligação antes da primeira mensagem.
- Timeouts por query (12s) com fallback para o chat não bloquear indefinidamente.
- Cache **em memória** para `GET /api/credits` (30s) e para overrides de agentes (60s) — em serverless cada instância tem a sua memória, por isso o primeiro pedido a uma instância nova não beneficia do cache.

---

## Soluções por fase

### 1. Imediato (já em uso)

- **POSTGRES_URL com pooler** (Supabase 6543, Neon pooled) em dev e produção.
- **Cron** em `vercel.json` para aquecer a BD em produção.
- **DbWarmup** no layout do chat.
- Garantir que em **produção** as variáveis estão corretas (ver `docs/vercel-setup.md` e `docs/DB-TIMEOUT-TROUBLESHOOTING.md`).

Com isto, cold start e timeouts ocasionais reduzem; em SaaS com tráfego contínuo, a BD tende a ficar mais “quente”.

---

### 2. Curto prazo (recomendado para SaaS)

**A) BD sempre ligada (sem auto-pause)**

- **Supabase:** plano **Pro** (ou superior) — a base não entra em pausa automática.
- **Neon:** plano **Scale** (ou superior) — idem.
- Efeito: elimina cold start da BD; o primeiro pedido do dia ou após inatividade deixa de pagar 10–30s de “acordar”.

**B) Cache distribuído (Redis) para o batch do chat**

- O projeto já referencia `REDIS_URL` (opcional) para rate limiting e outros usos.
- **Ideia:** cache distribuído (ex.: Vercel KV, Upstash Redis) para dados que mudam pouco entre mensagens:
  - **Saldo de créditos** (por `userId`), TTL curto (ex.: 30–60s). No `POST /api/chat`, tentar ler o saldo do Redis primeiro; em cache hit, não chamar `getOrCreateCreditBalance` no batch (ou chamar em background para atualizar). Invalidar ao deduzir créditos ou ao adicionar via admin.
  - **Overrides dos agentes built-in** (globais), TTL 1–2 min. Todas as instâncias partilham o mesmo cache; menos uma query por pedido.
- Efeito: em muitos pedidos, o batch fica mais leve (menos queries) e a latência até ao primeiro token diminui. Em cache miss continua a ir à BD.

**C) Usar o cache de créditos já existente no batch do chat**

- Hoje o `GET /api/credits` usa `creditsCache` (em memória); o **chat** não usa e chama sempre `getOrCreateCreditBalance`.
- **Melhoria:** no `runChatDbBatch`, se existir um cache (em memória ou Redis) com saldo recente para aquele `userId`, usar esse valor e **não** incluir `getOrCreateCreditBalance` no batch (ou correr em background). Assim, na mesma instância (ou em qualquer instância, com Redis) evita-se uma ida à BD por mensagem quando o saldo está em cache.
- Requer: definir política de TTL e invalidação (dedução, admin); se só em memória, o ganho é por instância; com Redis o ganho é global.

---

### 3. Médio prazo (mais utilizadores e mensagens)

**A) Separar “crítico” de “pode esperar” no batch**

- **Crítico para começar o stream:** `getChatById`, `getMessagesByChatId` (contexto do LLM), e validação de créditos (pode ser via cache).
- **Menos crítico ou cacheável:** `getMessageCountByUserId` (limite), `getCachedBuiltInAgentOverrides`, `getKnowledgeDocumentsByIds`, `getCustomAgentById`.
- Possível evolução: começar o stream assim que chat + mensagens (+ créditos se já em cache) estiverem disponíveis; correr as outras queries em paralelo e injetar overrides/knowledge quando chegarem (ou usar só cache para overrides). Exige alterações no fluxo do `route.ts` e possivelmente no prompt/stream.

**B) Read replicas (leitura pesada)**

- Se a carga de **leitura** (histórico, mensagens, conhecimento) for muito maior que a de escrita, usar uma **réplica de leitura** para:
  - `getMessagesByChatId`
  - `getChatById`
  - `getKnowledgeDocumentsByIds`
- Escritas (criar chat, guardar mensagens, deduzir créditos) continuam na primary. Supabase e Neon oferecem réplicas em planos superiores.

**C) Limites de conexão e pool**

- Com muitas invocações serverless em paralelo, o número de conexões pode crescer. O **pooler** (6543) já limita e reutiliza conexões no lado do Supabase/Neon.
- Verificar no dashboard do fornecedor os limites do pool (conexões máximas) e, se necessário, subir de plano ou ajustar `max` no cliente (hoje o projeto usa uma conexão por processo, o que é adequado para serverless).

---

### 4. Longo prazo (arquitetura)

- **Stream-first:** começar a enviar o primeiro token assim que o mínimo estiver disponível (ex.: chat + últimas N mensagens); carregar conhecimento e overrides em paralelo e incorporar quando chegarem. Reduz a sensação de espera mesmo com BD lenta.
- **Filas para escrita:** guardar mensagens e atualizar chat/título em fila (ex.: Vercel Queue, Trigger.dev), para o handler do chat devolver mais rápido e a escrita acontecer em background. Requer consistência eventual e tratamento de falhas.
- **Bases dedicadas por tenant** (multi-tenant avançado): só se o produto evoluir para isolamento forte por organização; normalmente um único pool + cache e réplicas chega.

---

## Resumo prático para “virar SaaS”

| Objetivo | Ação |
|----------|------|
| Menos cold start | Pooler (6543) + cron + DbWarmup (já feito). Plano Supabase/Neon sem auto-pause. |
| Menos carga e latência por mensagem | Cache distribuído (Redis) para créditos e overrides; usar esse cache no batch do chat. |
| Escala de leitura | Read replica para queries de histórico/conhecimento. |
| Melhor perceção de velocidade | Cache +, no futuro, stream-first (começar stream com mínimo de dados). |

Recomendação imediata para muitos chamados: **configurar Redis (REDIS_URL)** e **implementar cache de créditos (e opcionalmente overrides) no batch do chat** com TTL curto e invalidação correta. Em paralelo, passar para um plano de BD **sem auto-pause** quando o tráfego justificar.

Ver também: `docs/DB-TIMEOUT-TROUBLESHOOTING.md` (secção 4.2 produção), `docs/vercel-setup.md`, `lib/cache/credits-cache.ts`, `lib/cache/agent-overrides-cache.ts`.
