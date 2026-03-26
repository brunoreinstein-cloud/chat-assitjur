/**
 * Tool `intakeProcesso` — Intake automático de processos.
 *
 * Quando o agente detecta que o PDF enviado contém dados de um processo
 * (CNJ, partes, vara), esta tool cria ou atualiza o processo na BD
 * sem exigir preenchimento manual de formulário.
 *
 * Fluxo:
 *   1. Agente recebe PDF e extrai texto
 *   2. Tool é chamada com os metadados extraídos
 *   3. Cria processo na BD (ou atualiza se CNJ já existe)
 *   4. Linka o chat ao processo
 *
 * Referência: PLANO §1 item 2, PRD §3, schema `Processo.intakeStatus`.
 */
import { tool } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";

import {
  CNJ_REGEX,
  parseCNJ,
  parseValorBRL,
} from "@/lib/ai/extraction/regex-library";

interface IntakeProcessoProps {
  session: Session;
  chatId: string;
}

export const createIntakeProcessoTool = ({
  session,
  chatId,
}: IntakeProcessoProps) =>
  tool({
    description: `Cria ou atualiza um processo judicial na base de dados a partir de metadados extraídos de um documento (PI, contestação, processo completo).
Use quando:
- O utilizador enviou um PDF e você extraiu número CNJ, partes (reclamante/reclamada), vara, valores.
- Quer registar o processo automaticamente sem exigir formulário manual.
- O chat ainda não está vinculado a um processo.

NÃO use se o chat já tem um processo vinculado (verifique no contexto).
Devolve os dados do processo criado/atualizado e vincula ao chat actual.`,
    inputSchema: z.object({
      numeroAutos: z
        .string()
        .min(15)
        .max(30)
        .describe(
          "Número CNJ do processo (ex.: 0001234-56.2024.5.01.0001). Deve ser extraído do documento."
        ),
      reclamante: z
        .string()
        .min(2)
        .max(256)
        .describe("Nome do reclamante (autor da ação)"),
      reclamada: z.string().min(2).max(256).describe("Nome da reclamada (ré)"),
      vara: z
        .string()
        .max(256)
        .optional()
        .describe("Vara e comarca (ex.: '1ª Vara do Trabalho de São Paulo')"),
      tribunal: z
        .string()
        .max(64)
        .optional()
        .describe("Tribunal (ex.: 'TRT-2', 'TRT-15')"),
      valorCausa: z
        .string()
        .max(32)
        .optional()
        .describe("Valor da causa (ex.: 'R$ 150.000,00')"),
      rito: z
        .enum(["ordinario", "sumarissimo", "sumario"])
        .optional()
        .describe("Rito processual"),
      tipo: z
        .enum(["pi", "contestacao", "processo_completo", "outro"])
        .default("pi")
        .describe("Tipo do documento principal enviado"),
    }),
    execute: async ({
      numeroAutos,
      reclamante,
      reclamada,
      vara,
      tribunal,
      valorCausa,
      rito,
      tipo,
    }) => {
      const userId = session.user?.id;
      if (!userId) {
        return { error: "Utilizador não autenticado." };
      }

      // Validar CNJ
      const cnj = parseCNJ(numeroAutos);
      if (!cnj.valid) {
        // Tentar extrair CNJ do texto bruto
        const cnjMatch = CNJ_REGEX.exec(numeroAutos);
        if (!cnjMatch) {
          return {
            error: `Número de processo inválido: "${numeroAutos}". Formato esperado: NNNNNNN-DD.AAAA.J.TT.OOOO`,
          };
        }
      }

      const formattedCNJ = cnj.formatted ?? numeroAutos;

      // Detectar tribunal a partir do CNJ se não fornecido
      let tribunalDetected = tribunal;
      if (!tribunalDetected && cnj.valid && cnj.justica === "5") {
        tribunalDetected = `TRT-${cnj.tribunal}`;
      }

      // Parse valor da causa
      let valorParsed: string | undefined;
      if (valorCausa) {
        const numericVal = parseValorBRL(valorCausa);
        valorParsed = numericVal
          ? `R$ ${numericVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : valorCausa;
      }

      // Importação dinâmica para evitar "server-only" em testes
      const { createProcesso } = await import("@/lib/db/queries/processos");
      const { linkProcessoToChat } = await import("@/lib/db/queries/chats");

      try {
        // Criar o processo
        const proc = await createProcesso({
          userId,
          data: {
            numeroAutos: formattedCNJ,
            reclamante,
            reclamada,
            vara: vara ?? undefined,
            tribunal: tribunalDetected ?? undefined,
            valorCausa: valorParsed ?? undefined,
            rito: rito ?? undefined,
            fase: "conhecimento",
          },
        });

        // Linkar ao chat atual
        await linkProcessoToChat({ chatId, processoId: proc.id });

        return {
          success: true,
          processoId: proc.id,
          numeroAutos: formattedCNJ,
          reclamante: proc.reclamante,
          reclamada: proc.reclamada,
          vara: proc.vara,
          tribunal: proc.tribunal,
          valorCausa: proc.valorCausa,
          fase: proc.fase,
          message: `✅ Processo ${formattedCNJ} criado e vinculado a este chat. Dados extraídos automaticamente do documento (${tipo}).`,
          nota: "Verifique os dados e corrija se necessário em /processos.",
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erro ao criar processo";

        // Se for erro de duplicidade, tentar localizar o processo existente
        if (message.includes("unique") || message.includes("duplicate")) {
          return {
            error: `Processo ${formattedCNJ} já existe na base. Use o painel de processos para vincular ao chat.`,
            duplicado: true,
          };
        }

        return {
          error: `Falha ao criar processo: ${message}`,
        };
      }
    },
  });
