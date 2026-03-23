/**
 * POST /api/processos/intake
 *
 * Executa o "intake" de um processo: faz parse completo do PDF, extrai metadados
 * e salva tudo no banco para evitar re-upload/re-parse em tarefas futuras.
 *
 * Fluxo "document-first":
 *   1. Advogado faz upload do PDF → obtém blobUrl (via /api/files/upload)
 *   2. Chama este endpoint com { processoId, blobUrl, filename }
 *   3. O intake extrai texto completo, tipo, partes e salva em Processo.parsedText
 *   4. Tarefas futuras usam processoId → leem parsedText do banco (sem re-parse)
 *
 * Se o processo já tem parsedText (intake anterior), devolve 'ready' imediatamente.
 * Se o mesmo hash já existe em outro processo do utilizador, vincula e devolve.
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateText, Output } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getTitleModel } from "@/lib/ai/providers";
import {
  ensureStatementTimeout,
  getProcessoByFileHash,
  getProcessoById,
  updateProcessoIntake,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export const maxDuration = 120;

const PDFJS_OPTIONS = {
  standardFontDataUrl: pathToFileURL(
    `${join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts")}/`
  ).href,
};

/** Esquema de extração de metadados do intake */
const INTAKE_SCHEMA = z.object({
  titulo: z
    .string()
    .describe(
      "Título amigável do processo: 'Reclamante x Reclamada' (ex: 'Ygor Silva x CBD S.A.'). Máx. 100 chars."
    ),
  tipo: z
    .enum(["pi", "contestacao", "processo_completo", "outro"])
    .describe(
      "Tipo do documento: 'pi' = Petição Inicial, 'contestacao' = Contestação/Defesa, 'processo_completo' = autos completos, 'outro' = outros."
    ),
  numeroPedidos: z
    .number()
    .describe(
      "Número de pedidos identificados na peça. 0 se não identificado."
    ),
  reclamante: z
    .string()
    .describe("Nome do reclamante/trabalhador. Vazio se não identificado."),
  reclamada: z
    .string()
    .describe("Nome da empresa reclamada. Vazio se não identificado."),
});

const INTAKE_SYSTEM = `Você é um especialista em direito do trabalho brasileiro. Analise o texto do documento jurídico e extraia os metadados solicitados.
Para o campo 'tipo': use 'pi' para Petição Inicial (peça do reclamante), 'contestacao' para Contestação/Defesa (peça do reclamado), 'processo_completo' quando o arquivo contém autos completos (múltiplas peças), 'outro' para demais documentos.
Para 'titulo': combine reclamante x reclamada de forma breve. Se não identificar as partes, use o nome do arquivo.
Responda apenas com o JSON estruturado.`;

/** Extrai texto completo de um PDF (sem limite de páginas). */
async function extractFullPdfText(
  buffer: ArrayBuffer
): Promise<{ text: string; totalPages: number }> {
  const data = new Uint8Array(buffer);
  try {
    const unpdf = await import("unpdf");
    const pdf = await unpdf.getDocumentProxy(data, PDFJS_OPTIONS);
    const numPages = (pdf as { numPages: number }).numPages;

    // Tentativa 1: extractText (merge de páginas) — rápido
    try {
      const result = await unpdf.extractText(pdf, { mergePages: true });
      const text = typeof result.text === "string" ? result.text.trim() : "";
      if (text.length > 100) {
        return { text, totalPages: numPages };
      }
    } catch {
      // fallback
    }

    // Tentativa 2: página a página (máx. 500 páginas para performance)
    const parts: string[] = [];
    for (let i = 1; i <= Math.min(numPages, 500); i++) {
      try {
        const page = await (
          pdf as {
            getPage: (n: number) => Promise<{
              getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
            }>;
          }
        ).getPage(i);
        const content = await page.getTextContent();
        const pageText = (content.items as Array<{ str?: string }>)
          .map((item) => item.str ?? "")
          .join(" ");
        parts.push(`[Pag. ${i}]\n${pageText}`);
      } catch {
        // ignorar página com erro
      }
    }
    return { text: parts.join("\n\n").trim(), totalPages: numPages };
  } catch {
    return { text: "", totalPages: 0 };
  }
}

/** Extrai metadados do intake via IA */
async function extractIntakeMetadata(
  text: string,
  filename: string
): Promise<z.infer<typeof INTAKE_SCHEMA>> {
  const sample =
    text.length > 12_000
      ? `${text.slice(0, 10_000)}\n...\n${text.slice(-2000)}`
      : text;

  try {
    const { output } = await generateText({
      model: getTitleModel(),
      system: INTAKE_SYSTEM,
      prompt: `Arquivo: ${filename}\n\nTexto:\n---\n${sample}\n---\n\nExtraia os metadados do processo.`,
      output: Output.object({
        schema: INTAKE_SCHEMA,
        name: "IntakeMetadata",
        description: "Metadados extraídos do documento jurídico no intake",
      }),
    });
    const parsed = INTAKE_SCHEMA.safeParse(output);
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // fallback
  }

  return {
    titulo: filename.replace(/\.[^.]+$/, ""),
    tipo: "outro",
    numeroPedidos: 0,
    reclamante: "",
    reclamada: "",
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

const requestSchema = z.object({
  processoId: z.string().uuid(),
  blobUrl: z.string().url(),
  filename: z.string().min(1).max(256).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "processoId (UUID) e blobUrl (URL) são obrigatórios" },
        { status: 400 }
      );
    }

    const { processoId, blobUrl, filename = "documento.pdf" } = parsed.data;
    const userId = session.user.id;

    await ensureStatementTimeout();

    // Verifica que o processo pertence ao utilizador
    const proc = await getProcessoById({ id: processoId, userId });
    if (!proc) {
      return Response.json(
        { error: "Processo não encontrado" },
        { status: 404 }
      );
    }

    // Se já tem intake completo, devolve imediatamente (idempotente)
    if (proc.intakeStatus === "ready" && proc.parsedText) {
      return Response.json({
        processoId,
        titulo: proc.titulo,
        tipo: proc.tipo,
        totalPages: proc.totalPages,
        intakeStatus: "ready",
        cached: true,
      });
    }

    // Marca como em processamento
    await updateProcessoIntake({
      id: processoId,
      userId,
      data: { intakeStatus: "processing" },
    });

    // Busca o blob
    let pdfBuffer: ArrayBuffer;
    try {
      const resp = await fetch(blobUrl, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!resp.ok) {
        throw new Error(`Blob fetch failed: ${resp.status}`);
      }
      pdfBuffer = await resp.arrayBuffer();
    } catch (_err) {
      await updateProcessoIntake({
        id: processoId,
        userId,
        data: { intakeStatus: "error" },
      });
      return Response.json(
        { error: "Não foi possível buscar o arquivo. Verifique a URL." },
        { status: 422 }
      );
    }

    // Calcula hash para deduplicação
    const fileHash = createHash("sha256")
      .update(Buffer.from(pdfBuffer))
      .digest("hex");

    // Verifica se outro processo já tem esse hash (evita re-processamento)
    const existing = await getProcessoByFileHash({ userId, fileHash });
    if (
      existing &&
      existing.id !== processoId &&
      existing.intakeStatus === "ready" &&
      existing.parsedText
    ) {
      // Copia os dados do processo existente para o atual
      await updateProcessoIntake({
        id: processoId,
        userId,
        data: {
          titulo: existing.titulo ?? undefined,
          tipo: existing.tipo ?? undefined,
          blobUrl: existing.blobUrl ?? undefined,
          parsedText: existing.parsedText,
          totalPages: existing.totalPages ?? undefined,
          fileHash,
          intakeMetadata: existing.intakeMetadata ?? undefined,
          intakeStatus: "ready",
        },
      });
      return Response.json({
        processoId,
        titulo: existing.titulo,
        tipo: existing.tipo,
        totalPages: existing.totalPages,
        intakeStatus: "ready",
        cached: true,
        sourceProcessoId: existing.id,
      });
    }

    // Extrai texto completo do PDF
    const { text: parsedText, totalPages } =
      await extractFullPdfText(pdfBuffer);

    if (!parsedText.trim()) {
      await updateProcessoIntake({
        id: processoId,
        userId,
        data: { intakeStatus: "error" },
      });
      return Response.json(
        {
          error:
            "Não foi possível extrair texto do PDF. O arquivo pode ser digitalizado (imagem) ou estar corrompido.",
        },
        { status: 422 }
      );
    }

    // Extrai metadados via IA
    const meta = await extractIntakeMetadata(parsedText, filename);

    // Salva tudo no processo
    await updateProcessoIntake({
      id: processoId,
      userId,
      data: {
        titulo: meta.titulo || undefined,
        tipo: meta.tipo,
        blobUrl,
        parsedText,
        totalPages,
        fileHash,
        intakeMetadata: {
          numeroPedidos: meta.numeroPedidos,
          reclamante: meta.reclamante,
          reclamada: meta.reclamada,
        },
        intakeStatus: "ready",
      },
    });

    return Response.json({
      processoId,
      titulo: meta.titulo,
      tipo: meta.tipo,
      totalPages,
      intakeStatus: "ready",
      cached: false,
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return Response.json({ error: "Erro interno no intake" }, { status: 500 });
  }
}
