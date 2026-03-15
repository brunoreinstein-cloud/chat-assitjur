/**
 * POST /api/processos/extract
 * Recebe um ficheiro PDF e devolve os campos do processo extraídos por IA.
 */

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateText, Output } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getTitleModel } from "@/lib/ai/providers";

export const maxDuration = 60;

/** Opções padrão para getDocumentProxy — resolve warning de standardFontDataUrl. */
const PDFJS_OPTIONS = {
  standardFontDataUrl: pathToFileURL(
    join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") + "/"
  ).href,
};

// ── Schema de extração ────────────────────────────────────────────────────────

const PROCESSO_SCHEMA = z.object({
  numeroAutos: z
    .string()
    .describe(
      "Número CNJ do processo (formato NNNNNNN-DD.AAAA.J.TT.OOOO). String vazia se não encontrado."
    ),
  reclamante: z
    .string()
    .describe(
      "Nome completo do reclamante (trabalhador que move a ação). String vazia se não encontrado."
    ),
  reclamada: z
    .string()
    .describe(
      "Razão social da empresa reclamada/empregadora. String vazia se não encontrado."
    ),
  vara: z
    .string()
    .describe(
      "Vara do Trabalho onde corre o processo (ex: '2ª Vara do Trabalho de São Paulo'). String vazia se não encontrado."
    ),
  comarca: z
    .string()
    .describe(
      "Comarca ou município (ex: 'São Paulo', 'Campinas'). String vazia se não encontrado."
    ),
  tribunal: z
    .string()
    .describe(
      "Sigla do Tribunal (ex: 'TRT 2ª', 'TRT 15ª', 'TST'). String vazia se não encontrado."
    ),
  rito: z
    .enum(["ordinario", "sumarissimo", ""])
    .describe(
      "Rito processual: 'sumarissimo' quando valor da causa ≤ 40 salários mínimos, 'ordinario' caso contrário. String vazia se não identificado."
    ),
});

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é um assistente especialista em direito do trabalho que extrai dados estruturados de petições iniciais trabalhistas brasileiras.

Analise o texto do documento e extraia exatamente os campos solicitados:
- numeroAutos: número CNJ do processo (formato NNNNNNN-DD.AAAA.J.TT.OOOO — 7 dígitos, hífen, 2 dígitos, ponto, 4 dígitos, ponto, 1 dígito, ponto, 2 dígitos, ponto, 4 dígitos)
- reclamante: nome do trabalhador que move a reclamação trabalhista
- reclamada: nome da empresa/empregador
- vara: vara do trabalho competente para o processo
- comarca: cidade ou município onde tramita o processo
- tribunal: sigla do TRT competente (ex: TRT 2ª, TRT 15ª) ou TST
- rito: 'sumarissimo' se o valor da causa for até 40 salários mínimos, 'ordinario' caso contrário

Se um campo não for identificado no texto, use string vazia "".
Responda apenas com o JSON estruturado, sem explicações.`;

const MAX_TEXT = 15_000;

// ── Extração de texto do PDF ──────────────────────────────────────────────────

type PdfProxy = Awaited<
  ReturnType<Awaited<typeof import("unpdf")>["getDocumentProxy"]>
>;

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  // Importar e criar o proxy uma única vez — partilhado pelas duas tentativas.
  const data = new Uint8Array(buffer);
  let unpdf: Awaited<typeof import("unpdf")>;
  let pdf: PdfProxy;
  try {
    unpdf = await import("unpdf");
    pdf = await unpdf.getDocumentProxy(data, PDFJS_OPTIONS);
  } catch {
    return "";
  }

  // Tentativa 1: extractText (mergePages) — mais rápido e completo.
  try {
    const result = await unpdf.extractText(pdf, { mergePages: true });
    const text = typeof result.text === "string" ? result.text.trim() : "";
    if (text.length > 0) {
      return text;
    }
  } catch {
    // cai para o fallback
  }

  // Tentativa 2: extração página a página (primeiras 15 páginas).
  try {
    const numPages = (pdf as { numPages: number }).numPages;
    const parts: string[] = [];
    for (let i = 1; i <= Math.min(numPages, 15); i++) {
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
      parts.push(pageText);
    }
    return parts.join("\n\n").trim();
  } catch {
    return "";
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Parse multipart
  let file: File | null = null;
  try {
    const formData = await request.formData();
    file = formData.get("file") as File | null;
  } catch {
    return Response.json(
      { error: "Erro ao processar o formulário" },
      { status: 400 }
    );
  }

  if (!file) {
    return Response.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const filename = file.name || "documento";
  const contentType =
    file.type ||
    (filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  const isPdf =
    contentType === "application/pdf" ||
    filename.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return Response.json(
      { error: "Apenas PDF é suportado para extração automática" },
      { status: 400 }
    );
  }

  if (file.size > 50 * 1024 * 1024) {
    return Response.json(
      { error: "Arquivo muito grande. Máximo: 50 MB" },
      { status: 400 }
    );
  }

  // Extrair texto
  const buffer = await file.arrayBuffer();
  const rawText = await extractPdfText(buffer);

  if (!rawText.trim()) {
    return Response.json(
      {
        error:
          "Não foi possível extrair texto do PDF. Certifique-se de que o PDF tem camada de texto (não é digitalizado).",
      },
      { status: 422 }
    );
  }

  const textSample =
    rawText.length > MAX_TEXT
      ? `${rawText.slice(0, MAX_TEXT)}\n[... texto truncado ...]`
      : rawText;

  // Extração por IA
  try {
    const { output } = await generateText({
      model: getTitleModel(),
      system: SYSTEM_PROMPT,
      prompt: `Nome do arquivo: ${filename}\n\nTexto do documento:\n---\n${textSample}\n---\n\nExtraia os dados do processo trabalhista.`,
      output: Output.object({
        schema: PROCESSO_SCHEMA,
        name: "ProcessoTrabalhista",
        description:
          "Dados estruturados extraídos da petição inicial trabalhista",
      }),
    });

    const parsed = PROCESSO_SCHEMA.safeParse(output);
    if (!parsed.success) {
      return Response.json(
        { error: "Falha ao estruturar os dados extraídos" },
        { status: 422 }
      );
    }

    const d = parsed.data;
    return Response.json({
      numeroAutos: d.numeroAutos,
      reclamante: d.reclamante,
      reclamada: d.reclamada,
      vara: d.vara,
      comarca: d.comarca,
      tribunal: d.tribunal,
      rito: d.rito || "ordinario",
    });
  } catch {
    return Response.json(
      { error: "Falha na extração de dados pela IA. Preencha manualmente." },
      { status: 500 }
    );
  }
}
