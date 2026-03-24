# Agente Avaliador de Contestação

Documentação do agente especializado em **avaliação de qualidade de contestações trabalhistas**.

---

## 1. O que é

O **Avaliador de Contestação** é um agente de auditoria reversa: enquanto o Revisor de Defesas analisa PI + Contestação do ponto de vista da equipa jurídica para preparar audiência, o Avaliador foca exclusivamente na **qualidade da contestação já redigida** — identificando pontos fracos, lacunas argumentativas e impugnações genéricas que expõem o reclamado ao risco de confissão ficta.

**Não redige nem reescreve** a contestação — apenas avalia e recomenda.

### Entradas

| Documento | Obrigatoriedade |
|-----------|----------------|
| Contestação | **Obrigatória** |
| Petição Inicial | Opcional (recomendada — permite mapeamento pedido × impugnação) |
| Documentos do reclamado | Opcional |
| Base de teses (`@bancodetese`) | Opcional |

### Saída

Um DOCX com **Avaliação de Qualidade da Contestação**, incluindo:
- Score geral (A/B/C/D/E)
- Mapeamento pedido × impugnação (Específica ✅ / Genérica ⚠️ / Ausente 🔴 / Não visível ❓)
- Teses processuais (presentes/ausentes)
- Pontos fracos (com severidade 🔴/🟡)
- Pontos fortes
- Aviso obrigatório: _"Relatório gerado por IA. Revisão humana necessária e obrigatória."_

---

## 2. Fluxo de trabalho

| Etapa | Nome | Descrição |
|-------|------|-----------|
| **GATE-1** | Validação de entrada | Exige a Contestação. Se faltar, para e solicita. PI é recomendada mas opcional. |
| **FASE A** | Extração e avaliação | Analisa completude, qualidade das impugnações, teses processuais, estratégia documental e coerência interna. |
| **GATE 0.5** | Confirmação | Exibe resumo no chat (score, pedidos mapeados, pontos fracos/fortes). Aguarda **CONFIRMAR** ou **CORRIGIR**. |
| **FASE B** | Geração do DOCX | Após confirmação, gera o documento de avaliação via `createAvaliadorContestacaoDocument`. |

### Regra crítica: impugnação genérica

Impugnações do tipo _"ficam impugnados todos os demais pedidos"_ **não substituem** impugnação específica — o agente sinaliza estas como risco de confissão ficta (R6).

---

## 3. Score de qualidade

| Score | Critério |
|-------|---------|
| **A** | Defesa excelente — cobertura completa, impugnações específicas |
| **B** | Boa — pequenas lacunas |
| **C** | Regular — lacunas significativas |
| **D** | Fraca — múltiplos pedidos sem impugnação específica |
| **E** | Muito fraca — impugnação predominantemente genérica ou ausente |

---

## 4. Diferença face ao Revisor de Defesas

| Aspecto | Revisor de Defesas | Avaliador de Contestação |
|---------|-------------------|--------------------------|
| **Foco** | Auditoria PI + Contestação; orienta audiência | Avalia qualidade da contestação já redigida |
| **Entradas obrigatórias** | PI + Contestação | Só Contestação |
| **Outputs** | 3 DOCX (Avaliação, Roteiro Advogado, Roteiro Preposto) | 1 DOCX (Avaliação de Qualidade) |
| **Fluxo** | GATE-1 → FASE A → GATE 0.5 → FASE B (3 docs) | GATE-1 → FASE A → GATE 0.5 → FASE B (1 doc) |
| **Uso típico** | Preparar audiência com peça já contestada | Garantia de qualidade antes de protocolar ou após redigir |

---

## 5. Referência técnica

| Componente | Ficheiro |
|------------|---------|
| Instruções do agente | `lib/ai/agent-avaliador-contestacao.ts` |
| Registry + config | `lib/ai/agents-registry.ts` (`AGENT_ID_AVALIADOR_CONTESTACAO`) |
| Tool de geração | `lib/ai/tools/create-avaliador-contestacao-document.ts` |
| Flag activa | `useAvaliadorContestacaoTool: true` |
| Modelos permitidos | `nonReasoningChatModelIds` (reasoning desativa tools) |
| `agentId` na API | `avaliador-contestacao` |
