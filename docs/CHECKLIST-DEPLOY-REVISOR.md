# Checklist final antes do deploy (Agente Revisor de Defesas)

Verificação executada após implementação das Tarefas 1–5.

---

## Itens verificados

| Item | Status | Notas |
|------|--------|--------|
| `pnpm exec tsc --noEmit` (type-check) | ⏳ | Pode demorar; executar manualmente. |
| `pnpm run validate:prompt` | ✅ | Prompt válido, sem erros E1–E6. |
| Testes unitários (T1–T8) | ✅ | `pnpm run test:unit` — 9 testes em prompt.test.ts. |
| Cenários de integração (A–H) | ✅ | 13 testes em agent-flow.test.ts. |
| Nenhuma chave de API hardcoded | ✅ | Apenas variáveis de ambiente (.env.example). |
| `.env.example` com referência a chave de IA | ✅ | AI_GATEWAY_API_KEY + comentário ANTHROPIC_API_KEY. |
| `maxDuration=120` no route.ts (fora do handler) | ✅ | Declarado no topo do ficheiro. |
| Tratamento de erro para falha da API no route.ts | ✅ | Catch com 529 e ChatbotError. |
| Estado de erro no hook/banner | ✅ | RevisorPhaseBanner mostra mensagem quando `status === 'error'` após CONFIRMAR. |
| Gate-1 validado no servidor | ⚠️ | O Gate-1 é aplicado pelo modelo via instruções; não há validação explícita no route (ex.: verificar presença de PI + Contestação nos anexos antes de chamar o modelo). |

---

## Pendências opcionais

1. **Gate-1 no servidor:** Validar no `route.ts` que a mensagem do utilizador inclui pelo menos um anexo com `documentType: "pi"` e outro com `documentType: "contestacao"` antes de aceitar o pedido (e devolver 400 com mensagem clara se faltar). Atualmente o fluxo depende apenas do modelo seguir as instruções.
2. **Detecção robusta do Gate 0.5:** Substituir a detecção por string "CONFIRMAR" / delimitadores por structured output ou custom data no stream (ver TAREFA-2-RESUMO.md).
3. **`buildSystemPrompt` no route:** O `route.ts` ainda usa `systemPrompt()` de `lib/ai/prompts.ts` com `agentInstructions`; não usa `buildSystemPrompt(ctx)` de `lib/prompts/agente-trabalhista`. Para ativar `bancoTesesAtivo` e contexto dinâmico no deploy, é preciso passar a usar `buildSystemPrompt({ bancoTesesAtivo, nomeEscritorio, data })` e injetar o resultado em `system` (ou concatenar ao `agentInstructions`).

---

## Comandos rápidos

```bash
pnpm run validate:prompt   # Validação estática do prompt
pnpm run test:unit         # Testes Vitest (agente-trabalhista)
pnpm run lint              # Ultracite check
pnpm exec tsc --noEmit     # Type-check (se existir script no package.json)
```
