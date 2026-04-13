import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import type { ChatMessage } from "@/lib/types";
import { createDocumentTool } from "./document-tool-base";

interface CreateAutuoriaDocumentsProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

const inputSchema = z.object({
  quadroData: z.object({
    cabecalho: z.object({
      processo: z.string(),
      reclamante: z.string(),
      reclamada: z.string(),
      cnpj: z.string().optional(),
      dtc: z.string(),
      daj: z.string(),
      posicaoProcessual: z.string().optional(),
      teseCentral: z.string(),
      teseCentralStatus: z
        .enum(["adequada", "parcial", "inadequada"])
        .describe("adequada=✅, parcial=⚠️, inadequada=❌"),
    }),
    prescricao: z.array(
      z.object({
        tipo: z.string(),
        calculo: z.string(),
        dataLimite: z.string(),
        status: z.string(),
      })
    ),
    correcoes: z.array(
      z.object({
        numero: z.number(),
        pedido: z.string(),
        secaoDefesa: z.string(),
        impugnado: z
          .enum(["S", "NÃO", "PARCIAL"])
          .describe("S=Sim, NÃO=Não, PARCIAL=Parcial"),
        status: z
          .enum(["ok", "falha", "atencao"])
          .describe("ok=✅, falha=❌, atencao=⚠️"),
        criticidade: z
          .enum(["critico", "medio", "baixo", "informativo"])
          .describe("critico=🔴, medio=🟡, baixo=🟢, informativo=⚪"),
        tipo: z.string(),
        acaoRecomendada: z.string(),
      })
    ),
    checklist: z.array(
      z.object({
        defesa: z.string(),
        status: z
          .enum(["ok", "falha", "desnecessaria"])
          .describe("ok=✅, falha=❌, desnecessaria=Desnecessária"),
        obs: z.string(),
      })
    ),
    correcoesEscrita: z
      .array(
        z.object({
          tipo: z.string(),
          localizacao: z.string(),
          original: z.string(),
          correcao: z.string(),
        })
      )
      .default([]),
    documentosDefesa: z
      .array(
        z.object({
          assunto: z.string(),
          documento: z.string(),
          presente: z
            .enum(["presente", "ausente", "parcial"])
            .describe("presente=✅, ausente=❌, parcial=⚠️"),
        })
      )
      .default([]),
    docsReclamanteImpugnados: z
      .array(
        z.object({
          documento: z.string(),
          impugnado: z.string(),
          observacao: z.string(),
        })
      )
      .default([]),
    resumoIntervencoes: z
      .array(
        z.object({
          tipo: z.string(),
          qtd: z.number(),
          obs: z.string(),
        })
      )
      .default([]),
    ajustesPeca: z
      .array(
        z.object({
          tipo: z.string(),
          localizacao: z.string(),
          descricao: z.string(),
        })
      )
      .default([]),
  }),
  revisadaContent: z
    .string()
    .describe(
      "Full contestation text with markers: [INS]...[/INS] for insertions (blue), [DEL]...[/DEL] for deletions (red strikethrough), [COMMENT id=N]...[/COMMENT] for Word comments."
    ),
  quadroTitle: z
    .string()
    .describe(
      "Filename for Quadro: QUADRO_CORRECOES_-_[RECLAMANTE]_x_[EMPRESA]_-_[Nº]"
    ),
  revisadaTitle: z
    .string()
    .describe(
      "Filename for Revisada: CONTESTACAO_REVISADA_-_[RECLAMANTE]_x_[EMPRESA]_-_[Nº]"
    ),
});

/**
 * Ferramenta AutuorIA: gera 2 DOCX (Quadro de Correções em paisagem + Contestação Revisada
 * com marcações coloridas e comentários Word) em paralelo.
 */
export const createAutuoriaDocuments = ({
  session,
  dataStream,
}: CreateAutuoriaDocumentsProps) =>
  createDocumentTool(
    {
      description:
        "Generate the 2 AutuorIA documents: Quadro de Correções (landscape DOCX with audit tables) and Contestação Revisada (DOCX with colored markings and Word comments). Call this after completing the audit analysis. Provide structured quadroData (JSON with 8 sections) and revisadaContent (full contestation text with [INS], [DEL], [COMMENT] markers).",
      inputSchema,
      prefix: "autuoria",
      progressEventType: "data-autuoriaProgress",
      generateDocuments(input, ctx) {
        return Promise.resolve([
          {
            id: ctx.generateId(),
            title: input.quadroTitle,
            content: JSON.stringify(input.quadroData),
          },
          {
            id: ctx.generateId(),
            title: input.revisadaTitle,
            content: input.revisadaContent,
          },
        ]);
      },
    },
    { session, dataStream }
  );
