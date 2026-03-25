---
name: test-driven-development
description: Metodologia TDD (Red→Green→Refactor) para o AssistJur. Use ao corrigir gaps da SPEC-V9, adicionar validações em agentes ou implementar novas features. Nenhum código de produção sem teste falhando primeiro.
disable-model-invocation: true
allowed-tools: Bash(pnpm run test:unit *), Bash(pnpm run test:unit), Bash(pnpm run check)
---

Implemente usando Test-Driven Development: **escreva o teste antes do código**.

## Alvo
$ARGUMENTS (ex: `Gap 2 thinking mode`, `validateAgentInstructions revisor`, `credits deduction`)

## A regra de ouro

> **Se você não viu o teste falhar, você não sabe se ele testa a coisa certa.**

Nenhum código de produção sem um teste falhando antes. Se escreveu código antes do teste: delete e recomece.

---

## Ciclo Red → Green → Refactor

### 🔴 RED — Escrever o teste que falha

1. Identificar o comportamento esperado de forma precisa
2. Escrever o teste no arquivo correto:
   - Validação de agentes → `tests/validate-agents.test.ts`
   - Lógica de negócio → `tests/<módulo>.test.ts`
   - Modelos → `lib/ai/models.test.ts`
3. Rodar o teste e **confirmar que falha**:
   ```bash
   pnpm run test:unit -- tests/<arquivo>.test.ts
   ```
4. Verificar que a mensagem de erro é a esperada (não um erro de sintaxe ou import)

Se o teste passar sem código novo → o teste está errado. Reescrever.

### 🟢 GREEN — Implementar o mínimo para passar

1. Escrever **apenas o código suficiente** para o teste passar
2. Não antecipar outros casos, não generalizar ainda
3. Rodar o teste:
   ```bash
   pnpm run test:unit -- tests/<arquivo>.test.ts
   ```
4. Se passou → prosseguir. Se falhou → corrigir a implementação (não o teste)

### 🔵 REFACTOR — Melhorar sem quebrar

1. Melhorar legibilidade, remover duplicação, simplificar
2. Rodar **todos** os testes após cada mudança:
   ```bash
   pnpm run test:unit
   ```
3. Se algum teste quebrar → desfazer a última mudança e tentar de novo

---

## Checklist por ciclo

Antes de avançar para o próximo ciclo, confirmar:

- [ ] Teste foi escrito ANTES do código de produção
- [ ] Teste falhou por razão correta (não por erro de sintaxe)
- [ ] Implementação é mínima (não adiantou casos futuros)
- [ ] Todos os testes existentes continuam passando
- [ ] `pnpm run check` passa (lint + TypeScript)

---

## Aplicação no AssistJur — exemplos

### Corrigir Gap 2 (thinking mode)
```typescript
// RED — escrever primeiro em tests/validate-agents.test.ts
it('Revisor deve ter thinkingMode enabled', () => {
  const config = agentsRegistry.find(a => a.id === 'revisor-defesas')
  expect(config?.thinkingMode).toBe('enabled')
})
// Rodar → deve FALHAR (thinkingMode não existe ainda)
// GREEN → adicionar campo em agents-registry.ts
// REFACTOR → garantir consistência em todos os tipos B/C/D
```

### Adicionar validação de gate em agente
```typescript
// RED
it('Revisor deve conter os 6 gates no workflow', () => {
  const result = validateAgentInstructions('revisor-defesas', instructions)
  expect(result.gates).toHaveLength(6)
})
```

---

## Anti-padrões bloqueados

| Prática proibida | Alternativa correta |
|-----------------|---------------------|
| Escrever código, depois teste | Escrever teste, depois código |
| Testar depois de refatorar | Refatorar com testes já verdes |
| Pular RED porque "sei que vai falhar" | Sempre confirmar a falha |
| Escrever vários ciclos antes de rodar | Um ciclo por vez |
