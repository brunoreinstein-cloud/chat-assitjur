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

async function uploadFile(
  userId: string,
  filename: string,
  fileBuffer: ArrayBuffer,
  contentType: string
): Promise<{ url: string; pathname: string } | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return null;
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
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  return { url: publicUrl, pathname: path };
}

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
    const isPdf = file.type === ACCEPTED_PDF_TYPE;

    if (isPdf) {
      let extractedText = "";
      try {
        extractedText = await extractTextFromPdf(fileBuffer);
      } catch {
        // Continua com texto vazio: o ficheiro é enviado e o chat pode usá-lo sem texto extraído
      }

      const uploadResult = await uploadFile(
        session.user.id,
        filename,
        fileBuffer,
        file.type
      );
      if (uploadResult) {
        return NextResponse.json({
          url: uploadResult.url,
          pathname: uploadResult.pathname,
          contentType: file.type,
          extractedText,
        });
      }
      try {
        const data = await put(filename, fileBuffer, { access: "public" });
        return NextResponse.json({
          url: data.url,
          pathname: data.pathname ?? filename,
          contentType: file.type,
          extractedText,
        });
      } catch {
        if (isDev && !hasBlobToken) {
          const dataUrl = buildDataUrl(fileBuffer, file.type);
          return NextResponse.json({
            url: dataUrl,
            pathname: `dev/${filename}`,
            contentType: file.type,
            extractedText,
          });
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

    const uploadResult = await uploadFile(
      session.user.id,
      filename,
      fileBuffer,
      file.type
    );
    if (uploadResult) {
      return NextResponse.json({
        url: uploadResult.url,
        pathname: uploadResult.pathname,
        contentType: file.type,
      });
    }
    try {
      const data = await put(filename, fileBuffer, { access: "public" });
      return NextResponse.json({
        url: data.url,
        pathname: data.pathname ?? filename,
        contentType: file.type,
      });
    } catch {
      if (isDev && !hasBlobToken) {
        const dataUrl = buildDataUrl(fileBuffer, file.type);
        return NextResponse.json({
          url: dataUrl,
          pathname: `dev/${filename}`,
          contentType: file.type,
        });
      }
      return NextResponse.json(
        {
          error:
            "Falha ao enviar o ficheiro. Configure Supabase Storage ou BLOB_READ_WRITE_TOKEN no .env.local.",
        },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json(
      {
        error:
          "Erro ao processar o upload. Verifique o tamanho e o tipo do ficheiro (JPEG, PNG ou PDF até 5MB).",
      },
      { status: 500 }
    );
  }
}
