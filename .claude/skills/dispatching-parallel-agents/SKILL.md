---
name: dispatching-parallel-agents
description: Dispara múltiplos agentes em paralelo para investigar domínios independentes simultaneamente. Use quando há 3+ testes falhando em áreas diferentes, múltiplos agentes quebrados, ou subsistemas independentes para corrigir no AssistJur.
disable-model-invocation: true
---

Decomponha o problema em domínios independentes e despache agentes em paralelo.

## Alvo
$ARGUMENTS (ex: `3 testes falhando: validate-agents, credits, db-queries`, ou descrição do problema)

---

## Quando usar (e quando NÃO usar)

### ✅ Usar quando:
- 3+ arquivos de teste falhando com causas **diferentes**
- Múltiplos agentes do AssistJur quebrados independentemente
- Subsistemas sem estado compartilhado (ex: cache + db + agentes)
- Investigação de gaps independentes da SPEC-V9

### ❌ NÃO usar quando:
- Falhas relacionadas (corrigir uma provavelmente corrige outras)
- Precisa entender o estado completo do sistema antes de agir
- Agentes que modificariam os mesmos arquivos (conflito)
- Menos de 3 problemas independentes (parallelismo não vale o overhead)

---

## Passo 1 — Identificar domínios independentes

Rodar diagnóstico:
```bash
pnpm run test:unit 2>&1 | grep -E "(FAIL|✗|×)" | head -20
pnpm run check 2>&1 | head -30
```

Agrupar falhas por área:
| Domínio | Arquivos afetados | Independente? |
|---------|-------------------|---------------|
| Validação de agentes | `tests/validate-agents.test.ts` | ✅/❌ |
| Créditos | `lib/db/queries/credits.ts` | ✅/❌ |
| Cache | `lib/cache/` | ✅/❌ |
| Processos | `lib/db/queries/processos.ts` | ✅/❌ |

---

## Passo 2 — Criar tarefas focadas para cada agente

Para cada domínio, definir um contexto completo e isolado:

```
Agente A — Domínio: Validação de agentes
Objetivo: [descrição precisa do problema]
Arquivos relevantes: tests/validate-agents.test.ts, lib/ai/validate-agents.ts
Restrições: NÃO modificar agents-registry.ts
Resultado esperado: testes passando, output de pnpm run test:unit -- tests/validate-agents.test.ts

Agente B — Domínio: Créditos
Objetivo: [descrição precisa]
Arquivos relevantes: lib/db/queries/credits.ts, lib/cache/credits-cache.ts
Restrições: NÃO alterar schema
Resultado esperado: [critério mensurável]
```

Regra: cada agente deve poder trabalhar **sem saber o que os outros estão fazendo**.

---

## Passo 3 — Disparar em paralelo

Usar o Agent tool com múltiplos subagentes simultâneos. Cada agente recebe:
- Objetivo claro e escopo delimitado
- Lista de arquivos que PODE modificar
- Lista de arquivos que NÃO pode tocar
- Comando de verificação do sucesso

**Modelos recomendados por complexidade:**
| Tipo de tarefa | Modelo |
|----------------|--------|
| Correção mecânica (lint, tipos) | `haiku` |
| Bug de lógica | `sonnet` |
| Arquitetura / novo agente | `sonnet` ou `opus` |

---

## Passo 4 — Revisar e integrar

Quando todos os agentes terminarem:

1. Revisar cada summary reportado
2. Verificar conflitos entre os outputs:
   ```bash
   git diff --stat
   ```
3. Rodar suite completa:
   ```bash
   pnpm run test:unit
   pnpm run check
   ```
4. Se testes passarem → usar `/finishing-a-development-branch`
5. Se houver conflitos → resolver manualmente antes de integrar

---

## Sinais de status dos agentes

| Sinal | Significado | Ação |
|-------|-------------|------|
| `DONE` | Concluído com sucesso | Integrar |
| `DONE_WITH_CONCERNS` | Concluído mas há ressalvas | Revisar antes de integrar |
| `NEEDS_CONTEXT` | Faltou informação | Fornecer contexto e re-despachar |
| `BLOCKED` | Bloqueador encontrado | Resolver bloqueador manualmente |
