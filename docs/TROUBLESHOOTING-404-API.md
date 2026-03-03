# Resolução: 404 em /api/auth/session, /api/credits, /api/history, /api/agents/custom

## O que os erros significam

1. **404 (Not Found)** — O servidor responde que o recurso não existe.
2. **ClientFetchError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON** — O Auth.js espera JSON (ex.: `{}` ou `{ user, expires }`), mas recebe **HTML** (a página de 404 do Next.js começa com `<!DOCTYPE html>`). Ou seja: o pedido a `/api/auth/session` está a dar 404 e a resposta é a página HTML de 404, não JSON.

Se **todas** estas rotas devolvem 404:

- `/api/auth/session`
- `/api/credits`
- `/api/history`
- `/api/agents/custom`

então o problema é **global** (servidor, porta ou configuração), não de uma rota em concreto.

## Causas mais prováveis

### 1. AUTH_URL em desenvolvimento

O Auth.js usa `AUTH_URL` para construir URLs de callback e para o cliente saber onde pedir a sessão. Se estiver em branco ou com porta errada (ex.: 3000 em vez de 3300), o **cliente** pode estar a pedir sessão a outro host/porta que devolve 404 (e HTML).

**Solução:** Em `.env.local`:

```env
AUTH_URL=http://localhost:3300
```

Reiniciar o servidor (`pnpm dev`) após alterar.

### 2. Servidor ainda a compilar ou processo errado na porta 3300

Se abrires o browser antes do Next.js mostrar "Ready", ou se na porta 3300 estiver outro processo (outro `next dev`, outra app), as rotas da app atual não existem nesse servidor → 404.

**Solução:**

- Parar qualquer processo na porta 3300.
- Na raiz do projeto: `pnpm dev`.
- Esperar pela mensagem de "Ready" e só então abrir `http://localhost:3300`.

### 3. Pedidos a outra origem/porta

Se a página for servida por um proxy ou por outro porto (ex.: 3000), e os `fetch` forem relativos (`/api/...`), vão para a origem da página. Confirma na aba Network do DevTools:

- URL do documento (ex.: `http://localhost:3300/chat`).
- URL dos pedidos que falham (ex.: `http://localhost:3300/api/auth/session`).

Se as URLs dos pedidos forem para outro host/porta, corrige o proxy ou a configuração que define a origem (ex.: `AUTH_URL`, `NEXT_PUBLIC_APP_URL`).

## Checklist rápido

1. **.env.local**
   - `AUTH_URL=http://localhost:3300` (mesma porta do `pnpm dev`).

2. **Porta 3300**
   - Só um processo (este projeto) a usar 3300.
   - Reiniciar: parar o dev server e `pnpm dev` de novo.

3. **Ordem**
   - Iniciar o servidor → esperar "Ready" → abrir o browser em `http://localhost:3300`.

4. **Teste direto**
   - Abrir `http://localhost:3300/api/auth/session` no browser.
   - Deve devolver JSON (ex.: `{}` ou `{"user":...,"expires":"..."}`).
   - Se devolver página HTML (404), a rota não está a ser servida por este Next.js.

## Se continuar 404: testar sem Turbopack

Para descartar um problema específico do Turbopack com rotas em route groups:

```bash
npx next dev -p 3300
```

(equivale a `next dev` **sem** `--turbo`). Se com este comando as APIs passarem a responder, o problema pode estar no Turbopack; podes reportar ou usar `next dev` sem turbo em desenvolvimento até haver fix.

## Onde estão as rotas no projeto

- `/api/auth/*` (incl. session): `app/api/auth/[...nextauth]/route.ts`
- `/api/credits`: `app/(chat)/api/credits/route.ts`
- `/api/history`: `app/(chat)/api/history/route.ts`
- `/api/agents/custom`: `app/(chat)/api/agents/custom/route.ts`

Em App Router, a pasta `(chat)` é um **route group**: não altera o URL. Por isso estas rotas são mesmo `/api/credits`, `/api/history`, etc.
