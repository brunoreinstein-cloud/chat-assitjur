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

- [ ] Build local sem erros: `pnpm run build`
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

## 4. Integração com CI (opcional)

Para correr a revisão em cada push (sem expor segredos):

- **Lint:** já existe em `.github/workflows/lint.yml`.
- **Build:** pode adicionar um job que faz `pnpm run build` (com `POSTGRES_URL` e `AUTH_SECRET` em secrets se quiser validar também a DB no CI; caso contrário o build pode ser feito sem DB para validar código).
- **Pré-deploy completo:** num job que só corre com secrets (por exemplo antes de deploy para produção), chamar `pnpm run vercel:env:prod` (ou injetar env) e depois `pnpm run predeploy`.

Documentação de deploy: [vercel-setup.md](./vercel-setup.md).
