import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
const ACCEPTED_PDF_TYPE = "application/pdf" as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PDF_TEXT_LENGTH = 300_000; // ~300k caracteres

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: "O arquivo deve ter no máximo 5MB",
    })
    .refine(
      (file) =>
        ACCEPTED_IMAGE_TYPES.includes(
          file.type as (typeof ACCEPTED_IMAGE_TYPES)[number]
        ) || file.type === ACCEPTED_PDF_TYPE,
      {
        message: "Tipos aceitos: JPEG, PNG ou PDF",
      }
    ),
});

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = typeof result?.text === "string" ? result.text : "";
    return text.length > MAX_PDF_TEXT_LENGTH
      ? `${text.slice(0, MAX_PDF_TEXT_LENGTH)}\n\n[... texto truncado ...]`
      : text;
  } finally {
    await parser.destroy();
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (request.body === null) {
    return NextResponse.json(
      { error: "Corpo da requisição vazio" },
      { status: 400 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob | null;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    const parsed = FileSchema.safeParse({ file });
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(". ");
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const filename = (formData.get("file") as File).name;
    const fileBuffer = await file.arrayBuffer();
    const isPdf = file.type === ACCEPTED_PDF_TYPE;

    if (isPdf) {
      let extractedText: string;
      try {
        extractedText = await extractTextFromPdf(fileBuffer);
      } catch (err) {
        console.error("PDF parse error:", err);
        return NextResponse.json(
          {
            error:
              "Não foi possível extrair o texto do PDF. Verifique se o arquivo não está corrompido ou protegido.",
          },
          { status: 422 }
        );
      }

      try {
        const data = await put(filename, fileBuffer, { access: "public" });
        return NextResponse.json({
          url: data.url,
          pathname: data.pathname ?? filename,
          contentType: file.type,
          extractedText,
        });
      } catch (_error) {
        return NextResponse.json(
          { error: "Falha ao enviar o arquivo" },
          { status: 500 }
        );
      }
    }

    try {
      const data = await put(filename, fileBuffer, { access: "public" });
      return NextResponse.json({
        url: data.url,
        pathname: data.pathname ?? filename,
        contentType: file.type,
      });
    } catch (_error) {
      return NextResponse.json(
        { error: "Falha ao enviar o arquivo" },
        { status: 500 }
      );
    }
  } catch (_error) {
    return NextResponse.json(
      { error: "Erro ao processar a requisição" },
      { status: 500 }
    );
  }
}
