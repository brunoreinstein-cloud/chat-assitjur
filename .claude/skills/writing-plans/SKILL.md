---
name: writing-plans
description: Cria planos de implementação granulares com TDD para novos módulos, correção de gaps da SPEC-V9 ou novas features do AssistJur. Use quando precisar estruturar uma implementação não trivial antes de codar.
disable-model-invocation: true
allowed-tools: Read, Bash(git log *), Bash(pnpm run check)
---

Produza um plano de implementação granular e orientado a testes para o AssistJur.

## Alvo
$ARGUMENTS (ex: `Gap 2 thinking mode`, `Template Lock M02`, `agente tipo E estratégico`, `feature X`)

---

## Fase 1 — Diagnóstico (leitura obrigatória)

1. Ler `docs/SPEC-ASSISTJUR-V9.md` — identificar onde o alvo se encaixa nos gaps (Gap 1-4) ou nos módulos M01-M14
2. Ler `docs/ESTRUTURA-INSTRUCOES-AGENTES.md` — padrão de agentes
3. Ler arquivos de código relevantes (agente, schema, tools)
4. Ler commits recentes relacionados:
   ```bash
   git log --oneline -20
   ```
5. Rodar check atual para estabelecer baseline:
   ```bash
   pnpm run check
   ```

**Output desta fase:** 1 parágrafo descrevendo o estado atual e o problema a resolver.

---

## Fase 2 — Definição de escopo

### 2.1 Classificar o trabalho

| Tipo | Exemplos |
|------|---------|
| **Gap de qualidade** | temperatura por tipo, thinking mode, Template Lock |
| **Novo módulo** | agente Tipo E estratégico, agente Tipo H |
| **Feature técnica** | cache, pipeline, RBAC, multi-tenant |
| **Correção de bug** | timeout, alucinação, gate falhando |

### 2.2 Definir critérios de aceitação (DoD — Definition of Done)

Para cada critério, formular como asserção testável:
- `validateAgentInstructions('revisor', instructions)` retorna `{ valid: true }`
- Temperature `0.1` para agentes Tipo A/F/G em `agents-registry.ts`
- Teste `tests/validate-agents.test.ts` passa sem erros

### 2.3 Identificar dependências e riscos

- Quais arquivos serão alterados? (`lib/ai/`, `lib/db/`, `components/`)
- Há risco de quebrar agentes existentes?
- Requer migração de banco?
- Requer mudança de prompt em produção?

---

## Fase 3 — Plano granular (TDD-first)

Decompor em tarefas de **máximo 30 min** cada, seguindo a ordem:

### Formato de cada tarefa

```
## T{N} — {título curto}

**Arquivo(s):** `lib/ai/...`
**Tipo:** test / impl / refactor / docs
**Dependências:** T{anterior} (se houver)

### O que fazer
[1-3 linhas descrevendo a ação concreta]

### Teste de aceitação
```typescript
// como verificar que está correto
expect(resultado).toBe(esperado)
```

### Risco
[Nenhum / Baixo / Médio — e por quê]
```

### Exemplo de plano para "Gap 2 — Thinking Mode"

```
T1 — Adicionar flag thinkingMode em AgentConfig
Arquivo: lib/ai/agents-registry.ts
Tipo: impl
Dependências: nenhuma
O que fazer: adicionar campo opcional `thinkingMode: 'auto' | 'enabled' | 'disabled'`
Teste: TypeScript compila sem erros (pnpm run check)
Risco: Baixo — campo opcional, não quebra nada

T2 — Escrever teste para validação de thinkingMode
Arquivo: tests/validate-agents.test.ts
Tipo: test (escrever ANTES da impl)
O que fazer: asserção que Revisor tem thinkingMode='enabled', Assistente tem 'auto'
Teste: pnpm run test:unit -- tests/validate-agents.test.ts (deve FALHAR inicialmente)
Risco: Nenhum

T3 — Mapear agentes para thinkingMode correto
Arquivo: lib/ai/agents-registry.ts
Tipo: impl
Dependências: T1, T2
O que fazer: Tipo B/C/D → 'enabled'; Tipo A/F/G → 'auto'; Tipo E → 'enabled' + opus
Teste: T2 deve passar agora
Risco: Médio — afeta todos os agentes, testar em staging

T4 — Usar thinkingMode no chat-agent
Arquivo: lib/ai/chat-agent.ts
Tipo: impl
Dependências: T3
O que fazer: ler agentConfig.thinkingMode e passar para providerOptions.anthropic.thinking
Teste: chat com Revisor inclui thinking na resposta
Risco: Médio — testar custo/latência antes de deploy prod
```

---

## Fase 4 — Sequência de execução

Ordenar as tarefas respeitando:
1. **Testes antes da implementação** (TDD)
2. **Tipos antes de implementação** (TypeScript-first)
3. **Migrações antes de código** (se houver schema)
4. **Tarefas independentes podem ser paralelizadas**

Produzir um diagrama de dependências simples:

```
T1 (types) → T2 (test) → T3 (impl) → T4 (use)
                              ↑
                         T5 (docs) — independente
```

---

## Fase 5 — Estimativa e checkpoints

| Milestone | Tarefas | Verificação |
|-----------|---------|-------------|
| Estrutura ok | T1-T2 | `pnpm run check` passa |
| Lógica ok | T3-T4 | testes unitários passam |
| Integrado | T5+ | build completo (`pnpm run prepush`) |

---

## Entregável

O plano completo com:
- Diagnóstico do estado atual
- DoD com critérios testáveis
- Lista de tarefas T1-TN com formato padronizado
- Diagrama de dependências
- Riscos e pontos de atenção

**Não implementar nada** — apenas planejar. Aguardar confirmação do usuário antes de executar.
