---
name: webapp-testing
description: Testes E2E e de interface do AssistJur com Playwright. Use para rodar, debugar ou escrever testes end-to-end do chat, autenticação, processos e upload de documentos.
disable-model-invocation: true
allowed-tools: Bash(pnpm *), Read
---

Execute ou escreva testes E2E do AssistJur usando Playwright.

## Alvo
$ARGUMENTS (ex: `rodar todos`, `debugar auth`, `escrever teste para upload de PDF`, `reportar falhas`)

---

## Referências do projeto

| Item | Localização |
|------|-------------|
| Configuração Playwright | `playwright.config.ts` |
| Testes E2E | `tests/` (arquivos `.test.ts` de integração) |
| Resultados anteriores | `docs/TESTES-E2E-RESULTADOS.md` |
| Plano de correção | `docs/PLANO-CORRECAO-E2E-PLAYWRIGHT.md` |
| Dev server | `http://localhost:3300` |

---

## Fluxo 1 — Rodar testes existentes

### Pré-condição: servidor deve estar rodando
```bash
# Verificar se está rodando
curl -s http://localhost:3300 > /dev/null && echo "OK" || echo "Servidor offline"
```

Se offline, o Playwright sobe automaticamente via `PLAYWRIGHT_USE_WEB_SERVER=1`.

### Rodar suite completa
```bash
pnpm run test
```

### Rodar com warmup (banco frio)
```bash
pnpm run test:with-warmup
```

### Rodar arquivo específico
```bash
pnpm exec playwright test tests/<arquivo>.test.ts
```

### Rodar em modo debug (browser visível)
```bash
pnpm exec playwright test --headed --slowMo=500
```

---

## Fluxo 2 — Debugar testes falhando

1. Ler `docs/TESTES-E2E-RESULTADOS.md` para contexto histórico
2. Rodar com output verbose:
   ```bash
   pnpm exec playwright test --reporter=list 2>&1 | head -50
   ```
3. Capturar screenshot no ponto de falha:
   ```bash
   pnpm exec playwright test --headed --video=on
   ```
4. Verificar logs do servidor:
   ```bash
   pnpm run vercel:logs 2>/dev/null || echo "Verificar console do dev server"
   ```

### Causas comuns no AssistJur

| Sintoma | Causa provável | Solução |
|---------|---------------|---------|
| Auth falha | `AUTH_SECRET` ausente | Verificar `.env.local` |
| Chat não responde | `AI_GATEWAY_API_KEY` expirada | Renovar no Vercel Dashboard |
| Upload falha | `BLOB_READ_WRITE_TOKEN` ausente | Configurar Vercel Blob |
| DB timeout | `POSTGRES_URL` com pool incorreto | Usar porta 6543 (Supabase) |
| Selector não encontrado | HMR mudou o DOM | Atualizar seletores |

---

## Fluxo 3 — Escrever novo teste

### Estrutura padrão para AssistJur

```typescript
import { test, expect } from '@playwright/test'

test.describe('<funcionalidade>', () => {
  test.beforeEach(async ({ page }) => {
    // Login padrão se necessário
    await page.goto('http://localhost:3300')
  })

  test('<comportamento esperado>', async ({ page }) => {
    // 1. Arrange — navegar/configurar estado
    await page.goto('http://localhost:3300/chat')

    // 2. Aguardar estado estável (crítico para SPA)
    await page.waitForLoadState('networkidle')

    // 3. Act — interação
    await page.fill('[data-testid="message-input"]', 'teste de contestação')
    await page.keyboard.press('Enter')

    // 4. Assert — verificar resultado
    await expect(page.locator('[data-testid="message-response"]'))
      .toBeVisible({ timeout: 30000 })
  })
})
```

### Áreas de teste prioritárias (baseado em `PLANO-CORRECAO-E2E-PLAYWRIGHT.md`)

1. Autenticação (login/logout/sessão)
2. Chat com agente (envio de mensagem, resposta do agente)
3. Upload de PDF (fluxo completo do Revisor de Defesas)
4. Seleção de processo (ProcessoSelector)
5. Créditos (consumo e exibição)

---

## Relatório de testes

Ao finalizar, reportar:
- Testes passando / falhando (N/M)
- Screenshots de falhas (se `--video=on`)
- Próximos passos sugeridos
- Referência a `docs/TESTES-E2E-RESULTADOS.md` para atualização
