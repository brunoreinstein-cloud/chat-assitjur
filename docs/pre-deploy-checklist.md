# Checklist pré-deploy (evitar erro 500 na Vercel)

Revisão geral antes de fazer deploy para produção. Segue estes passos para reduzir o risco de HTTP 500 e CredentialsSignin.

---

## 1. Verificação automática (recomendado)

Com as variáveis de ambiente já configuradas (por exemplo em `.env.local` ou após `pnpm run vercel:env:prod`):

```bash
pnpm run predeploy
```

O script valida variáveis obrigatórias, a porta da `POSTGRES_URL` (Supabase = 6543), a ligação à base de dados e o lint. Se algo falhar, corrige antes do deploy.

---

## 2. Checklist manual

### Variáveis de ambiente (Vercel)

- [ ] **AUTH_SECRET** definida em Vercel → Settings → Environment Variables (Production e Preview).
- [ ] **POSTGRES_URL** definida com o pooler:
  - Supabase: usar porta **6543** (Connection string "Transaction"), nunca 5432.
  - Formato: `postgresql://user:password@host:6543/postgres`
- [ ] Sem espaços ou caracteres extra ao copiar/colar; valores não vazios.

### Base de dados

- [ ] Migrações aplicadas à base de **produção** (pelo menos uma vez):
  ```bash
  pnpm run vercel:env:prod
  pnpm run db:migrate
  ```
- [ ] Ligação à DB a funcionar: `pnpm run db:ping` (com `POSTGRES_URL` em `.env.local`).

### Build e qualidade

- [ ] **Build local sem erros antes de fazer push:** `pnpm run build` (ou `pnpm run prepush`). Isto replica o que a Vercel executa (lint + test:unit + next build) e evita falhas no deploy.
- [ ] Lint sem erros: `pnpm run lint`
- [ ] (Opcional) Testes E2E: `pnpm test`

### Auth e chat (após deploy)

- [ ] Página inicial não redireciona para `/config-required`.
- [ ] Login / Registo: testar com um utilizador existente e credenciais corretas (evita confundir CredentialsSignin com falha de DB).
- [ ] Acesso como guest ou criar novo utilizador; abrir um chat e enviar uma mensagem (confirma que `/api/chat` e DB estão OK).

---

## 3. Se algo falhar

| Falha | Onde ver | Próximo passo |
|-------|----------|----------------|
| `predeploy` falha em POSTGRES_URL | Script indica variável em falta ou porta errada | Definir/corrigir em Vercel e em `.env.local`; usar porta 6543 no Supabase. |
| `db:ping` falha | Output do script ou `pnpm run db:ping` | Verificar `POSTGRES_URL`, rede, e se a base existe; migrações aplicadas. |
| Build falha na Vercel | Deployments → Build logs | Corrigir erros de TypeScript/imports; ver dependências. |
| 500 ou CredentialsSignin em produção | Deployments → Logs (Runtime) | Ver [vercel-setup.md – Troubleshooting](./vercel-setup.md#4-troubleshooting): POSTGRES_URL, migrações, credenciais. |

---

## 4. Integração com CI

Em cada push para `main` (e em pull requests para `main`):

- **Lint:** `.github/workflows/lint.yml` — executa `pnpm run lint`.
- **Build:** `.github/workflows/build.yml` — executa o mesmo que a Vercel: `pnpm run prebuild` (lint + test:unit) e `next build` (migrações são saltadas com `VERCEL=1`, como na Vercel). Se este job falhar, o deploy na Vercel falharia também; corrige antes de fazer merge.
- **Pré-deploy completo (opcional):** com secrets configurados, pode adicionar um job que chama `pnpm run predeploy` antes de deploy para produção.

Recomendação: correr `pnpm run build` ou `pnpm run prepush` localmente antes de cada push, para não depender só do CI.

Documentação de deploy: [vercel-setup.md](./vercel-setup.md).
