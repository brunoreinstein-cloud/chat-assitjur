# Resultados dos testes E2E (Playwright)

## Onde ver os resultados

### 1. Terminal

Ao correr `pnpm test` (ou `test:with-dev` / `test:with-dev-3301`), o Playwright imprime no terminal:

- **Resumo:** quantos testes passaram/falharam e tempo total.
- **Cada falha:** nome do teste, ficheiro:linha, mensagem de erro e, em falhas de navegação, o comando para abrir o trace (ex.: `pnpm exec playwright show-trace test-results\...\trace.zip`).

Exemplo de falha típica (servidor em baixo):

```
Error: expect(page).toHaveURL(expected) failed
Expected pattern: /\/chat(\/|$)/
Received string: "chrome-error://chromewebdata/"
```

Ou:

```
Error: page.waitForURL: net::ERR_CONNECTION_REFUSED
```

### 2. Relatório HTML

O Playwright gera um relatório HTML com todos os testes, traces e screenshots (em falhas).

- **Abrir após correr os testes:**
  ```bash
  pnpm run test:report
  ```
  Isto abre no browser o último relatório (pasta `playwright-report/`).

- **Sem script:** `pnpm exec playwright show-report`

No relatório HTML podes:

- Ver lista de testes (passed / failed).
- Clicar num teste falhado e ver trace (passo a passo), screenshot e log.

### 3. Traces de um teste falhado

Quando um teste falha, o terminal indica um ficheiro `.zip` do trace. Para o abrir:

```bash
pnpm exec playwright show-trace test-results\<pasta-do-teste>\trace.zip
```

Substitui `<pasta-do-teste>` pelo caminho que aparece no output (ex.: `e2e-chat-Chat-Page-submit-button-is-visible-e2e`).

---

## Como corrigir as falhas comuns

A maioria das falhas que vês (URL `chrome-error://...`, `net::ERR_CONNECTION_REFUSED`) significa que **o servidor não estava acessível** quando o teste correu.

| Situação | Solução |
|----------|--------|
| Corriste `pnpm test` | O Playwright arranca o servidor. Garante que a porta **3301** está livre. Se outro processo a usar, mata-o ou usa `test:with-dev-3301` com servidor manual. |
| Corriste `pnpm run test:with-dev` | Antes de correr os testes, inicia o servidor noutro terminal: `pnpm dev` (porta 3300). |
| Corriste `pnpm run test:with-dev-3301` | Antes de correr os testes, inicia noutro terminal: `pnpm run dev:test` (porta 3301). Espera aparecer "Ready" antes de correr os testes. |

Depois de o servidor estar no ar, volta a correr os testes. O helper `ensureChatPageWithGuest` mostra a mensagem *"Servidor inacessível (conexão recusada). Solução: ..."* quando o servidor não está a responder, em vez de apenas timeout ou erro de rede.

---

## Resumo dos comandos

| Comando | Descrição |
|---------|-----------|
| `pnpm test` | Corre E2E; Playwright inicia o servidor na porta 3301. |
| `pnpm run test:report` | Abre o último relatório HTML no browser. |
| `pnpm exec playwright show-trace <caminho>.zip` | Abre o trace de um teste falhado. |
