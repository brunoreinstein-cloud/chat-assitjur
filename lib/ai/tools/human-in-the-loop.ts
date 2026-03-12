/**
 * Human-in-the-Loop (HITL) — padrão do Anthropic Cookbook.
 * Ferramentas SEM `execute`: o LLM chama a tool, a execução pausa,
 * o frontend mostra um diálogo de confirmação, o advogado aprova/rejeita,
 * e o frontend reenvia com o resultado (approved: true/false) nas mensagens.
 *
 * Diferença do GATE do Revisor (system prompt):
 *  - GATE: instrução textual no prompt → LLM para e pede confirmação via texto
 *  - HITL: tool sem execute → AI SDK pausa formalmente e entrega ao frontend
 *
 * Uso: incluir `requestApproval` nas tools do streamText para agentes
 * que precisam de aprovação humana antes de acções irreversíveis.
 */

import { tool } from "ai";
import { z } from "zod";

/**
 * `requestApproval` — ferramenta HITL genérica.
 *
 * O LLM chama esta ferramenta quando quer que o advogado aprove
 * uma acção antes de a executar (ex.: submeter peça, enviar e-mail, preencher formulário).
 *
 * SEM `execute`: o AI SDK pausa o stream e aguarda o resultado do utilizador.
 * O frontend (confirmation.tsx) detecta o tool-call pendente e apresenta o diálogo.
 *
 * Resultado esperado (via isToolApprovalFlow):
 *   { approved: true }  → continua (LLM prossegue com a acção)
 *   { approved: false, reason?: string } → cancela (LLM informa o utilizador)
 */
export const requestApproval = tool({
  description:
    "Solicita aprovação do advogado antes de executar uma acção importante ou irreversível. " +
    "Use quando for submeter uma peça processual, enviar comunicação a cliente, " +
    "ou realizar qualquer acção que requeira revisão humana prévia. " +
    "Apresenta o resumo da acção ao utilizador e aguarda aprovação explícita.",
  inputSchema: z.object({
    /** Tipo da acção que requer aprovação */
    action: z
      .enum([
        "submit_document",   // Submeter peça processual
        "send_communication",// Enviar comunicação a cliente/parte
        "modify_data",       // Alterar dados (processo, cliente, etc.)
        "irreversible_action",// Qualquer outra acção irreversível
      ])
      .describe("Categoria da acção que requer aprovação"),

    /** Título curto para o diálogo de aprovação (máx. 80 chars) */
    title: z
      .string()
      .max(80)
      .describe("Título curto do diálogo de aprovação (ex.: 'Submeter Contestação ao TRT-2')"),

    /** Descrição completa da acção, visível ao advogado */
    description: z
      .string()
      .max(1000)
      .describe(
        "Descrição detalhada da acção: o que será feito, impactos, dados envolvidos. " +
        "O advogado lê este texto antes de aprovar."
      ),

    /** Resumo em bullet points do que será submetido/enviado (opcional) */
    items: z
      .array(z.string().max(200))
      .max(10)
      .optional()
      .describe("Lista de itens ou pontos-chave que o advogado deve rever"),

    /** Nível de urgência (informativo para o UI) */
    urgency: z
      .enum(["low", "medium", "high"])
      .default("medium")
      .describe("Nível de urgência: low (informativo), medium (normal), high (prazo próximo)"),
  }),
  // SEM `execute` → AI SDK pausa e aguarda resultado humano
});

export type RequestApprovalTool = typeof requestApproval;
