import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "chat-files";

const isDev = process.env.NODE_ENV === "development";
const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function buildDataUrl(buffer: ArrayBuffer, contentType: string): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
const ACCEPTED_PDF_TYPE = "application/pdf" as const;
const ACCEPTED_DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_EXTRACTED_TEXT_LENGTH = 300_000; // ~300k caracteres

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
        ) ||
        file.type === ACCEPTED_PDF_TYPE ||
        file.type === ACCEPTED_DOCX_TYPE,
      {
        message: "Tipos aceitos: JPEG, PNG, PDF ou DOCX",
      }
    ),
});

type UploadResult =
  | { ok: true; url: string; pathname: string }
  | { ok: false; reason: "no_client" | "storage_error"; message?: string };

async function uploadFile(
  userId: string,
  filename: string,
  fileBuffer: ArrayBuffer,
  contentType: string
): Promise<UploadResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, reason: "no_client" };
  }

  const safeName = filename.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(path, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    return {
      ok: false,
      reason: "storage_error",
      message: error.message,
    };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  return { ok: true, url: publicUrl, pathname: path };
}

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = typeof result?.text === "string" ? result.text : "";
    return text.length > MAX_EXTRACTED_TEXT_LENGTH
      ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
      : text;
  } finally {
    await parser.destroy();
  }
}

async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(buffer),
  });
  const text = typeof result?.value === "string" ? result.value : "";
  return text.length > MAX_EXTRACTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
    : text;
}

function storageErrorHint(message?: string): string {
  const isNotFound =
    message?.includes("Bucket not found") || message?.includes("not found");
  return isNotFound
    ? ` Crie o bucket "${SUPABASE_BUCKET}" em Supabase Dashboard → Storage, ou execute: pnpm run supabase:config-push`
    : ` Supabase: ${message ?? ""}`;
}

function respondUploadSuccess(
  uploadResult: { url: string; pathname: string },
  contentType: string,
  _filename: string,
  extractedText?: string
): NextResponse {
  const body = {
    url: uploadResult.url,
    pathname: uploadResult.pathname,
    contentType,
    ...(typeof extractedText === "string" ? { extractedText } : {}),
  };
  return NextResponse.json(body);
}

async function persistAndRespond(
  userId: string,
  filename: string,
  fileBuffer: ArrayBuffer,
  contentType: string,
  extractedText?: string
): Promise<NextResponse> {
  const uploadResult = await uploadFile(
    userId,
    filename,
    fileBuffer,
    contentType
  );
  if (uploadResult.ok) {
    return respondUploadSuccess(
      uploadResult,
      contentType,
      filename,
      extractedText
    );
  }
  if (uploadResult.reason === "storage_error") {
    return NextResponse.json(
      {
        error: `Falha ao enviar o ficheiro para o Storage.${storageErrorHint(uploadResult.message)}`,
      },
      { status: 500 }
    );
  }
  try {
    const data = await put(filename, fileBuffer, { access: "public" });
    return respondUploadSuccess(
      { url: data.url, pathname: data.pathname ?? filename },
      contentType,
      filename,
      extractedText
    );
  } catch {
    if (isDev && !hasBlobToken) {
      const dataUrl = buildDataUrl(fileBuffer, contentType);
      return respondUploadSuccess(
        { url: dataUrl, pathname: `dev/${filename}` },
        contentType,
        filename,
        extractedText
      );
    }
    return NextResponse.json(
      {
        error:
          "Falha ao enviar o ficheiro. Configure Supabase Storage (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) ou BLOB_READ_WRITE_TOKEN no .env.local.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
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
    const contentType = file.type;
    const isPdf = contentType === ACCEPTED_PDF_TYPE;
    const isDocx = contentType === ACCEPTED_DOCX_TYPE;

    let extractedText: string | undefined;
    if (isPdf || isDocx) {
      try {
        extractedText = isPdf
          ? await extractTextFromPdf(fileBuffer)
          : await extractTextFromDocx(fileBuffer);
      } catch {
        // Continua com texto vazio; o ficheiro é enviado e o chat pode usá-lo sem texto extraído
      }
    }

    return persistAndRespond(
      session.user.id,
      filename,
      fileBuffer,
      contentType,
      extractedText
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Erro ao processar o upload. Verifique o tamanho e o tipo do ficheiro (JPEG, PNG, PDF ou DOCX até 5MB).",
      },
      { status: 500 }
    );
  }
}
