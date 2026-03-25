---
name: verification-before-completion
description: Exige verificação com evidência concreta antes de declarar qualquer tarefa concluída. Aplica automaticamente quando Claude estiver prestes a dizer "pronto", "funciona", "corrigido" ou similar. Alinha com o princípio Zero Alucinação do AssistJur.
user-invocable: false
allowed-tools: Bash(pnpm *), Bash(git *)
---

**NUNCA declare que algo está funcionando sem verificação com evidência fresca.**

Esta regra é inviolável — viola a letra desta regra = viola o espírito.

## Os 5 Gates de Verificação

Antes de qualquer afirmação de sucesso ("pronto", "corrigido", "funciona", "implementado"), execute em sequência:

**Gate 1 — IDENTIFICAR**
Qual comando prova a afirmação? Ser específico:
- Build passou → `pnpm run build`
- Testes passam → `pnpm run test:unit` ou `pnpm run test:unit -- <arquivo>`
- Lint limpo → `pnpm run check`
- Migração aplicada → `pnpm run db:ping`
- Agente válido → `pnpm run test:unit -- tests/validate-agents.test.ts`

**Gate 2 — EXECUTAR**
Rodar o comando completo. **Nunca usar cache**. Nunca assumir que o resultado anterior ainda vale.

**Gate 3 — LER**
Analisar o output completo e o código de saída. Não escanear — ler. Erros em meio ao output contam como falha.

**Gate 4 — VERIFICAR**
O output confirma a afirmação? Se houver qualquer dúvida, a resposta é NÃO.

**Gate 5 — ENTÃO DECLARAR**
Somente agora fazer a afirmação, **com a evidência anexada**:
> "✅ Testes passando — `pnpm run test:unit` retornou 0 erros (ver output acima)"

---

## Racionalizações bloqueadas

Estas frases **NÃO são evidência** e não devem ser usadas como prova:

| Frase inválida | Motivo |
|----------------|--------|
| "Deveria funcionar agora" | Sem verificação = sem evidência |
| "O linter passou, então o build também passa" | São comandos diferentes |
| "Não vejo nenhum erro" | Ausência de erro visível ≠ ausência de erro |
| "Funcionou antes da minha última mudança" | Estado atual pode ser diferente |
| "A lógica está correta" | Correção lógica ≠ código funcional |

---

## Aplicação no AssistJur

| Cenário | Comando de verificação |
|---------|----------------------|
| Correção de agente | `pnpm run test:unit -- tests/validate-agents.test.ts` |
| Mudança de schema | `pnpm run db:migrate && pnpm run db:ping` |
| Qualquer PR/commit | `pnpm run check && pnpm run test:unit` |
| Deploy pronto | `pnpm run prepush` (lint + testes + build) |
| Migração aplicada | `pnpm run db:ping && pnpm run db:tables` |

---

## Princípio central

> **Melhor "não sei se funciona" do que "funciona" sem prova.**

Isso espelha o Princípio Inviolável #1 do AssistJur: *"Melhor vazio que inventado."*
Confiança não é evidência. Execute o comando.
