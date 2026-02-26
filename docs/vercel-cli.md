# Vercel CLI – AssitJur

Comandos para vincular o repositório ao projeto na Vercel e sincronizar variáveis de ambiente.

## Primeira vez: vincular ao projeto

1. **Login** (abre o navegador):
   ```bash
   pnpm exec vercel login
   ```

2. **Vincular** a este diretório ao projeto Vercel (chat-assitjur ou o que estiver no dashboard):
   ```bash
   pnpm run vercel:link
   ```
   Escolha o time (scope) e o projeto existente. Será criada a pasta `.vercel/` (já no `.gitignore`).

## Scripts disponíveis

| Comando | Descrição |
|--------|-----------|
| `pnpm run vercel:link` | Vincula o diretório ao projeto Vercel |
| `pnpm run vercel:pull` | Baixa env vars e configurações do projeto (para uso com `vercel build` / `vercel dev`) |
| `pnpm run vercel:env` | Exporta as variáveis de **development** para `.env.local` (sincroniza com o dashboard) |
| `pnpm run vercel:deploy` | Deploy de **preview** (branch atual) |
| `pnpm run vercel:deploy:prod` | Deploy em **production** |

## Sincronizar variáveis locais

Depois de alterar variáveis no [Vercel Dashboard](https://vercel.com) (Settings → Environment Variables), atualize o `.env.local`:

```bash
pnpm run vercel:env
```

Isso sobrescreve `.env.local` com as variáveis do ambiente **Development** do projeto. Para production/preview use no dashboard ou `vercel pull --environment=production`.

## Deploy

- **Preview:** `pnpm run vercel:deploy` (cria uma URL de preview).
- **Produção:** `pnpm run vercel:deploy:prod` (atualiza a URL de produção).

O deploy contínuo via **Git** (push na branch conectada) continua funcionando; o CLI é opcional para deploys manuais e para puxar env.
