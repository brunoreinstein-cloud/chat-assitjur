# Comparativo: Supabase Pro vs Neon Scale (BD para SaaS)

Comparativo focado em **usar PostgreSQL como BD do chat** (connection string em `POSTGRES_URL`), para ajudar a escolher entre **Supabase Pro** e **Neon Scale** quando quiseres eliminar cold start e suportar muitos chamados.

---

## Resumo rápido

| Critério | Supabase Pro | Neon Scale |
|----------|--------------|------------|
| **Preço base (ordem de grandeza)** | ~25–35 USD/mês (fixo + uso) | Pay-as-you-go (~0,22 USD/CU-hora + storage) |
| **Pausa / cold start** | Projetos **nunca pausam** | Podes **desativar** scale-to-zero (compute sempre ligado) |
| **Pooler** | Sim (porta 6543, Supavisor) | Sim (PgBouncer, endpoint pooled) |
| **Auth / Storage no mesmo produto** | Sim (Auth, Storage, Realtime incluídos) | Não (só Postgres) |
| **Branches (dev/staging)** | Não nativo | Sim (branching por projeto) |
| **Read replicas** | Sim (compute extra) | Incluído em planos superiores |
| **Boa escolha se…** | Já usas Supabase (Storage/Auth) ou queres tudo num sítio | Queres só BD, máximo controlo e branching, ou já usas Neon |

Para um **chat SaaS** em que o objetivo é **acabar com cold start e ter BD estável**, os dois servem: **Supabase Pro** não pausa por política; **Neon Scale** permite desativar o auto-suspend e deixar o compute sempre ligado.

---

## 1. Preço e modelo de faturação

### Supabase Pro

- **Base:** ~**25 USD/mês** (podendo subir com overages).
- Inclui: crédito de compute (ex.: Micro), storage (ex.: 8 GB), egress, etc. Uso além do incluído é cobrado à parte.
- **Compute:** Micro (2 vCPU partilhados, 1 GB RAM) costuma estar coberto pelo crédito; tiers superiores (dedicated) custam mais (ex.: +100 USD/mês para produção mais pesada).
- **Projetos em organizações Pro:** **nunca são pausados** por inatividade (ao contrário do Free).

### Neon Scale

- **Pay-as-you-go:** pagas por **CU-hora** (compute) e **GB-mês** (storage).
- **Scale:** ~**0,22 USD por CU-hora** (aprox.), storage ~0,35 USD/GB-mês. Autoscaling até 56 CU (muito RAM).
- Não há “plano fixo mensal” mínimo no mesmo sentido do Supabase; o custo varia com uso. Tráfego baixo/médio pode ficar na ordem de dezenas de USD/mês; carga alta sobe.
- Em **Scale** (e Launch) podes **desativar o scale-to-zero**: o compute fica sempre ligado e deixas de ter cold start (em troca, pagas compute 24/7).

**Para custo previsível:** Supabase Pro tende a ser mais previsível (valor fixo base). **Para custo muito variável ou picos de tráfego:** Neon escala e cobra por uso.

---

## 2. Pausa da BD e cold start

### Supabase Pro

- **Projetos em plano Pro (ou superior) não pausam.** A BD fica sempre disponível; não há “acordar” após inatividade.
- Ideal se quiseres **zero** preocupação com cold start por pausa.

### Neon Scale

- Por defeito o Neon usa **scale-to-zero**: após X minutos sem atividade, o compute suspende (cold start na próxima ligação).
- Em planos **Launch** e **Scale** podes **desativar** o scale-to-zero no dashboard (Branches → Computes → Edit) ou via API (`suspend_timeout_seconds`).
- Com scale-to-zero **desativado**, o compute fica sempre ligado (comportamento análogo ao “nunca pausa” do Supabase Pro), mas pagas o compute 24/7.
- Nota: computes sempre ligados no Neon podem precisar de reinício manual periódico para receber atualizações de imagem (consultar documentação atual).

**Para “BD sempre ligada”:** os dois conseguem: Supabase Pro por política; Neon Scale ao desativar auto-suspend.

---

## 3. Connection pooling (relevante para serverless/Vercel)

### Supabase Pro

- **Pooler:** Supavisor (porta **6543**, modo Transaction). Recomendado para serverless.
- A app já está preparada: `POSTGRES_URL` com **:6543** (ver `docs/DB-TIMEOUT-TROUBLESHOOTING.md`).
- Documentação: Dashboard → Settings → Database → Connection string → “Transaction”.

### Neon Scale

- **Pooler:** PgBouncer, endpoint **pooled** (host com `-pooler` ou indicado no dashboard).
- Suporta muitos milhares de conexões; adequado a muitas invocações serverless em paralelo.
- Basta usar a connection string “pooled” do Neon em `POSTGRES_URL`.

**Conclusão:** os dois oferecem pooler adequado ao chat em Vercel; a app já usa o padrão “pooler” (6543 no Supabase, pooled no Neon).

---

## 4. Integração com este projeto (Auth, Storage, Vercel)

### Supabase Pro

- **Auth:** O projeto usa **Auth.js (NextAuth)** com adaptador à BD (Drizzle). O utilizador pode estar na BD Supabase; Supabase também tem Auth próprio, mas não é obrigatório para este repo.
- **Storage:** O projeto suporta **Supabase Storage** (opcional) para ficheiros do chat. Se usares Supabase para a BD, podes usar o mesmo projeto para Storage (mesma conta, mesmo dashboard).
- **Vercel:** Integração comum; connection string com pooler (6543) funciona sem alterações.

### Neon Scale

- **Só Postgres:** Neon não fornece Auth nem Storage. Continuas a usar Auth.js com a BD Neon; para ficheiros, usas **Vercel Blob** e/ou **Supabase Storage** noutro projeto (só Storage).
- **Vercel:** Integração nativa (Neon + Vercel); connection string pooled funciona como hoje.

**Se já tens (ou queres) Supabase para Storage/Auth:** Supabase Pro junta BD + Storage (e opcionalmente Auth) no mesmo sítio. **Se queres apenas a melhor BD para o chat e o resto é Blob/outros:** Neon Scale é uma escolha forte.

---

## 5. Funcionalidades extras

### Supabase Pro

- Backups e point-in-time recovery (conforme plano).
- Read replicas (compute extra).
- Realtime, Edge Functions, etc., no mesmo ecossistema.

### Neon Scale

- **Branches:** clones da BD por branch (ex.: dev, staging, preview). Útil para CI/CD e ambientes isolados.
- **Scale plan:** SLA 99,95%, SOC 2, HIPAA (conforme documentação atual).
- Restore window 30 dias (Scale).

---

## 6. Quando escolher cada um

### Escolher **Supabase Pro** se:

- Queres **tudo no mesmo lugar**: BD + Storage (e eventualmente Auth) no mesmo projeto Supabase.
- Preferes **preço mais previsível** (base mensal fixa) e não queres gerir scale-to-zero.
- Queres a garantia simples de que **a BD nunca pausa** (sem configurar nada).
- Já usas Supabase noutras partes do produto.

### Escolher **Neon Scale** se:

- Queres **só a BD** e usas (ou vais usar) Vercel Blob / outro Storage.
- Queres **branching** (dev/staging/production) com clones da BD.
- Preferes **modelo pay-as-you-go** e autoscaling de compute (até 56 CU no Scale).
- Queres **desativar cold start** mantendo controlo fino sobre compute (sempre ligado quando desativas scale-to-zero).

---

## 7. Recomendação para este chat SaaS

- **Objetivo:** eliminar cold start e aguentar muitos chamados.
- **Supabase Pro:** boa escolha se quiseres simplicidade (BD + Storage no mesmo sítio) e custo fixo previsível; os projetos Pro não pausam.
- **Neon Scale:** boa escolha se quiseres só Postgres, branching e modelo de custo por uso; desativando scale-to-zero tens BD sempre ligada, análoga ao Pro.

Em ambos os casos:

1. Usar **sempre** a connection string com **pooler** (Supabase 6543, Neon pooled).
2. Manter o **cron** e o **DbWarmup** como rede de segurança (úteis mesmo com BD sempre ligada).
3. Para escala maior, seguir `docs/ESCALA-SAAS-BD.md` (cache Redis, etc.).

---

## Referências

- [Supabase Pricing](https://supabase.com/docs/pricing)  
- [Supabase – Pausing Pro Projects](https://supabase.com/docs/guides/troubleshooting/pausing-pro-projects-vNL-2a) (Pro não pausa)  
- [Neon Pricing](https://neon.com/pricing)  
- [Neon – Scale to Zero / Auto-suspend](https://neon.tech/docs/guides/scale-to-zero-guide) (desativar em Launch/Scale)  
- [Neon – Connection pooling](https://neon.tech/docs/connect/connection-pooling)  
- Neste repo: `docs/DB-TIMEOUT-TROUBLESHOOTING.md`, `docs/ESCALA-SAAS-BD.md`, `docs/vercel-setup.md`
