# Human-in-the-Loop (HITL) — Aprovação Humana

O padrão **Human-in-the-Loop (HITL)** permite que o agente pause antes de executar ações importantes ou irreversíveis e aguarde aprovação explícita do utilizador.

---

## Agentes com HITL ativo

| Agente | `useApprovalTool` | Quando usa |
|--------|:-----------------:|-----------|
| Assistente Geral | — | N/A |
| Revisor de Defesas | — | Usa GATE 0.5 via prompt (ver abaixo) |
| Redator de Contestações | ✅ | Antes de gerar o DOCX final da minuta |
| Avaliador de Contestação | — | N/A |
| AssistJur.IA Master | ✅ | Antes de submeter peça, enviar comunicação, ações irreversíveis |

---

## Diferença entre HITL e GATE do Revisor

| Mecanismo | Como funciona | Onde está |
|-----------|--------------|-----------|
| **GATE 0.5** (Revisor/Avaliador) | Instrução textual no system prompt → LLM para e pede confirmação via texto no chat | `lib/ai/agent-revisor-defesas.ts`, `agent-avaliador-contestacao.ts` |
| **HITL** (`requestApproval`) | Tool sem `execute` → AI SDK pausa formalmente o stream → frontend mostra diálogo de aprovação | `lib/ai/tools/human-in-the-loop.ts` |

O GATE é uma convenção de prompt; o HITL é um mecanismo formal do AI SDK que pausa o loop de ferramentas e entrega o controlo ao frontend.

---

## Fluxo HITL

```
1. Agente decide que precisa de aprovação
         │
         ▼
2. Chama `requestApproval` com { action, title, description, items?, urgency }
         │
         ▼
3. AI SDK pausa o stream (tool sem `execute`)
         │
         ▼
4. Frontend (confirmation.tsx) deteta tool-call pendente → mostra diálogo
         │
         ├─ Utilizador aprova → frontend reenvia POST /api/chat com
         │                       messages: [..., { approved: true }]
         │                               ▼
         │                       Agente prossegue com a ação
         │
         └─ Utilizador rejeita → frontend reenvia com
                                  messages: [..., { approved: false, reason?: "..." }]
                                          ▼
                                  Agente informa o utilizador e cancela
```

---

## Parâmetros do `requestApproval`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `action` | enum | Categoria: `submit_document` \| `send_communication` \| `modify_data` \| `irreversible_action` |
| `title` | string (max 80) | Título curto do diálogo. Ex: "Submeter Contestação ao TRT-2" |
| `description` | string (max 1000) | Descrição detalhada — o que será feito, impactos, dados envolvidos |
| `items` | string[] (max 10×200) | Lista de pontos-chave para revisão (opcional) |
| `urgency` | enum | `low` (informativo) \| `medium` (normal) \| `high` (prazo próximo) |

---

## Exemplos de uso (Redator de Contestações)

O Redator usa HITL antes de gerar o DOCX final:

1. Agente redige a minuta no chat.
2. Chama `requestApproval` com `action: "submit_document"`, título "Gerar DOCX da Contestação" e resumo da minuta.
3. Diálogo aparece no frontend: advogado lê o resumo e clica **Aprovar** ou **Rejeitar**.
4. Se aprovado → agente chama `createRedatorContestacaoDocument` e gera o ficheiro.
5. Se rejeitado com `reason` → agente incorpora o feedback e revisa.

---

## Referência técnica

| Componente | Ficheiro |
|------------|---------|
| Tool implementation | `lib/ai/tools/human-in-the-loop.ts` |
| Frontend (diálogo) | `components/confirmation.tsx` (ou similar) |
| Deteção de fluxo HITL | `isToolApprovalFlow` em `route.ts` |
| Flag no registry | `useApprovalTool: true` em `lib/ai/agents-registry.ts` |
