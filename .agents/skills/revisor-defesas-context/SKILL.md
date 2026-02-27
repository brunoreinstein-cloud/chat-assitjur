---
name: revisor-defesas-context
description: Contexto e checklist do Agente Revisor de Defesas Trabalhistas. Usar ao alterar prompts, fluxo do chat, documentação ou funcionalidades do revisor neste projeto.
user-invocable: false
---

# Revisor de Defesas Trabalhistas — contexto para desenvolvimento

Esta skill dá contexto a quem altera código ou documentação do **Agente Revisor de Defesas Trabalhistas** neste repositório. As instruções completas do agente estão em `lib/ai/agent-revisor-defesas.ts` (export `AGENTE_REVISOR_DEFESAS_INSTRUCTIONS`). O backend injeta-as no system prompt em `app/(chat)/api/chat/route.ts`.

## Onde está o quê

| O quê | Onde |
|-------|------|
| Instruções completas do agente | `lib/ai/agent-revisor-defesas.ts` |
| System prompt e montagem do contexto | `lib/ai/prompts.ts` |
| Handler do chat (streaming, tools, knowledge) | `app/(chat)/api/chat/route.ts` |
| Base de conhecimento (incl. RAG) | `lib/ai/knowledge-base.md` |

## Checklist de validação (ao alterar o revisor)

1. **GATE-1:** Exigir (A) Petição Inicial e (B) Contestação antes de qualquer análise; se faltar, parar.
2. **Gate 0.5:** Após FASE A (extrair/mapear), exibir resumo no chat e aguardar CONFIRMAR/CORRIGIR antes de gerar os 3 DOCX.
3. **3 DOCX:** Avaliação da defesa (com aviso IA), Roteiro Advogado, Roteiro Preposto — nomes e estrutura conforme instruções em `agent-revisor-defesas.ts`.
4. **Siglas:** Uso interno apenas (RTE, RDO, DAJ, DTC); nos documentos, sempre por extenso.
5. **Sinalização:** 🔴🟡🟢 (criticidade) e ✅/❌/⚠️ (avaliação) em todos os docs quando um pedido/tema aparecer.
6. **Proibições:** Não redigir peças, não inventar fatos/jurisprudência, não dar valores em R$/%, não instruir testemunha (art. 342 CP), linguagem consultiva (não imperativa).

## Jurisprudência e súmulas (lembretes)

- **Prescrição:** Bienal = DTC + 2 anos; Quinquenal = DAJ − 5 anos. Incluir sempre ambos no quadro (mesmo N/A). Aviso-prévio indenizado → dois cenários.
- **Jornada / intervalo:** Súm. 437 TST — até 6h → 15 min; mais de 6h → 1h. Total de jornada já inclui intervalo.
- **@bancodetese:** Quadro de teses no Doc 1 (Avaliação) só com base no banco de teses; não inventar precedentes.

## Ao criar ou alterar prompts

- Manter hierarquia: Proibições > Regras > Estrutura > Advogado decide.
- Aviso "Relatório gerado por IA. Revisão humana necessária e obrigatória." apenas no Doc 1 (Avaliação).
- Formato dos 3 DOCX: Arial 12pt, títulos 14pt negrito; dados do processo em quadro/tabela (2 colunas), nunca texto corrido; OAB no bloco de assinaturas da inicial; audiência na Notificação Judicial PJe.
