# Plano de ação: correção dos testes E2E Playwright

Com base no relatório de falhas (24 testes falhados), o plano abaixo organiza as causas e as correções.

---

## 1. Diagnóstico das falhas

### 1.1 Duas categorias de erro

| Tipo | Sintoma | Testes afetados |
|------|--------|------------------|
| **A) `net::ERR_CONNECTION_REFUSED`** | `page.waitForURL` ou navegação falha com conexão recusada | Maioria: `api.test.ts`, `chat.test.ts`, `model-selector.test.ts` (todos que usam `ensureChatPageWithGuest`) |
| **B) Elemento não encontrado / timeout** | `getByLabel('E-mail')` ou link "Cadastre-se"/"Entrar" não encontrado; timeout 240s | `auth.test.ts` (login, register, navegação) |

### 1.2 Causa raiz

- **A)** O browser está a usar `baseURL` (ex.: `http://localhost:3301` ou `http://localhost:3300`) mas **não há nenhum processo a escutar nessa porta** no momento do teste. Por isso:
  - `ensureChatPageWithGuest` faz `page.goto("/api/auth/guest?redirectUrl=%2Fchat")` e o pedido falha com `ERR_CONNECTION_REFUSED`.
  - O mesmo acontece em qualquer teste que navegue para a app.
- **B)** Ou o servidor não está no ar (mesma causa que A), ou a página de login/registo não chega a renderizar o formulário (ex.: `waitUntil: "commit"` usado noutra altura, ou servidor a devolver erro). O `auth.test.ts` já está corrigido para `waitUntil: "load"`; se ainda falhar, é porque o servidor não está acessível ou a resposta não é a página esperada.

Conclusão: **a causa principal é o servidor de desenvolvimento não estar acessível em `baseURL` quando os testes correm.**

---

## 2. Plano de ação

### 2.1 Garantir que o servidor está no ar (obrigatório)

- **Se usas `pnpm test` (Playwright arranca o servidor):**
  1. Não definas `PLAYWRIGHT_TEST_BASE_URL`.
  2. Garante que a porta **3301** está livre (nenhum outro `next dev` ou processo a usar 3301).
  3. Se o `webServer` falhar ao arrancar (timeout ou comando falha), os testes vão dar `ERR_CONNECTION_REFUSED`. Verifica os logs do Playwright no início da corrida para ver se há erro no `pnpm run dev:test`.
  4. Opcional: no primeiro teste que usa a app, fazer um `page.goto(baseURL)` ou um fetch a `/api/health/db` para falhar rápido com mensagem clara se o servidor não responder.

- **Se usas `pnpm run test:with-dev` (servidor já a correr):**
  1. Num terminal: `pnpm dev` (porta **3300**) ou `pnpm run dev:test` (porta **3301**).
  2. Espera até a app estar “Ready” / a responder.
  3. No outro terminal: `pnpm run test:with-dev` (usa 3300) ou `pnpm run test:with-dev-3301` (usa 3301), conforme a porta onde o servidor está.
  4. O `global-setup` já espera por `baseURL` quando `PLAYWRIGHT_TEST_BASE_URL` está definido; se o servidor não estiver no ar, os testes falham com mensagem de “Servidor em … não respondeu”.

**Checklist antes de correr os E2E:**

- [ ] Decidir modo: `pnpm test` (servidor automático) ou `test:with-dev` (servidor manual).
- [ ] Se automático: porta 3301 livre.
- [ ] Se manual: servidor a correr na porta correta e `PLAYWRIGHT_TEST_BASE_URL` igual a essa porta.

---

### 2.2 Melhorar o helper `ensureChatPageWithGuest` (opcional mas recomendado)

**Objetivo:** Falhar mais cedo e com mensagem clara quando o servidor não está acessível, em vez de `waitForURL` falhar com `ERR_CONNECTION_REFUSED`.

- **Ficheiro:** `tests/helpers.ts`.

- **Alterações sugeridas:**
  1. No `page.goto` de `/api/auth/guest?redirectUrl=%2Fchat`, usar `waitUntil: "load"` (em vez de `"commit"`) para que falhas de rede (ex.: conexão recusada) sejam detectadas no `goto` e não no `waitForURL`. Se preferires manter `"commit"` por performance, então:
  2. Imediatamente após o `goto`, ler `page.url()`. Se for `about:blank` ou `chrome-error://` / `edge-error://`, lançar um erro explícito: “Servidor inacessível (conexão recusada). …” e **não** chamar `waitForURL`.
  3. (Já existe) Tratar no `catch` o erro de conexão e relançar com a mensagem que aponta para `SERVER_DOWN_MSG`.

Assim, a falha aparece no `goto` ou na verificação da URL, e a mensagem indica que o servidor não está a correr.

---

### 2.3 Auth tests (`auth.test.ts`)

- **Estado atual:** Os `page.goto` em `auth.test.ts` já usam `waitUntil: "load"` (correção anterior).
- **Se os testes de auth continuarem a falhar:**
  - Confirmar que estás a correr contra o servidor certo (porta 3300 ou 3301 conforme o modo).
  - Confirmar que não há proxy ou redirecionamento que devolva outra página em `/login` ou `/register`.
  - Se o servidor estiver no ar e ainda assim “E-mail” / “Cadastre-se” / “Entrar” não aparecerem, verificar no trace do Playwright o HTML efetivamente devolvido (pode ser página de erro ou redirect).

Nenhuma alteração adicional de código é necessária no auth.test.ts para o problema de “servidor em baixo”; a correção é garantir servidor acessível e, se quiseres, o reforço no helper (2.2).

---

### 2.4 Documentação e scripts

- **README ou docs de testes:** Adicionar uma secção “Testes E2E” que explique:
  - `pnpm test`: arranca o servidor na porta 3301 e corre os testes; exigir porta 3301 livre.
  - `pnpm run test:with-dev`: exige servidor já a correr (ex.: `pnpm dev` em 3300); usar `test:with-dev-3301` se o servidor estiver em 3301.
- **Mensagem de erro no helper:** Manter (ou acrescentar) a referência a “Solução: num terminal corre …” em `SERVER_DOWN_MSG` para que quem vê `ERR_CONNECTION_REFUSED` ou “Servidor inacessível” saiba como resolver.

---

## 3. Ordem sugerida de execução

1. **Imediato:** Correr os testes com o servidor garantidamente no ar:
   - Opção A: `pnpm test` (sem `PLAYWRIGHT_TEST_BASE_URL`, porta 3301 livre).
   - Opção B: num terminal `pnpm dev` ou `pnpm run dev:test`, noutro `pnpm run test:with-dev` ou `test:with-dev-3301`.
2. **Curto prazo:** Implementar as melhorias em `ensureChatPageWithGuest` (2.2) para falhar cedo e com mensagem clara.
3. **Seguido:** Atualizar documentação (2.4) e, se necessário, ajustar scripts em `package.json` (ex.: comentário a indicar a porta para `test:with-dev`).

---

## 4. Resumo

| Problema | Causa | Ação |
|----------|--------|------|
| `ERR_CONNECTION_REFUSED` em vários testes | Servidor não acessível em `baseURL` | Garantir servidor na porta certa; usar `pnpm test` ou `test:with-dev` corretamente |
| Auth: “E-mail” / links não encontrados | Mesma causa ou `waitUntil` inadequado | Auth já com `waitUntil: "load"`; garantir servidor e URL correta |
| Mensagem de erro pouco clara | Falha no `waitForURL` ou no `goto` | Melhorar `ensureChatPageWithGuest`: falhar no `goto`/URL e mensagem “servidor em baixo” |

Depois de garantir que o servidor está acessível e, se aplicável, de aplicar as melhorias no helper e na documentação, os 24 testes devem passar desde que o ambiente (porta, `baseURL`, saúde da app) esteja correto.
