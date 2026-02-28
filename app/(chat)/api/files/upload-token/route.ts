import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
const ACCEPTED_PDF_TYPE = "application/pdf" as const;
const ACCEPTED_DOC_TYPE = "application/msword" as const;
const ACCEPTED_DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
const ACCEPTED_EXTENSIONS = /\.(docx?|pdf|jpe?g|png)$/i;

function isAcceptedType(pathname: string): boolean {
  const base = pathname.split("?").at(0)?.split("#").at(0) ?? pathname;
  const lower = base.toLowerCase();
  if (lower.endsWith(".pdf")) return true;
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return true;
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png"))
    return true;
  return ACCEPTED_EXTENSIONS.test(base);
}

/**
 * GET: Verifica se o upload direto está disponível (auth + BLOB_READ_WRITE_TOKEN).
 * O cliente pode chamar antes de uploadToBlob para mostrar mensagem clara em caso de falha.
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Não autorizado. Inicie sessão para enviar ficheiros grandes." },
      { status: 401 }
    );
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const isDev = process.env.NODE_ENV === "development";
    const hint = isDev
      ? "Em desenvolvimento: adicione BLOB_READ_WRITE_TOKEN ao .env.local. Obtenha o token em Vercel → Storage → Blob (ou use um ficheiro com menos de 4,5 MB)."
      : "Defina BLOB_READ_WRITE_TOKEN no projeto (Vercel → Storage → Blob) ou use um ficheiro com menos de 4,5 MB.";
    return NextResponse.json(
      {
        error: `Upload de ficheiros grandes não está configurado. ${hint}`,
      },
      { status: 501 }
    );
  }
  return NextResponse.json({ ready: true });
}

/**
 * POST: Gera token para upload direto cliente → Vercel Blob (ficheiros > 4,5 MB).
 * O corpo do pedido é JSON (sem ficheiro), por isso não está sujeito ao limite de 4,5 MB.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const isDev = process.env.NODE_ENV === "development";
    const hint = isDev
      ? "Em desenvolvimento: adicione BLOB_READ_WRITE_TOKEN ao .env.local (Vercel → Storage → Blob)."
      : "Use um ficheiro com menos de 4,5 MB.";
    return NextResponse.json(
      {
        error: `Upload de ficheiros grandes não disponível. ${hint}`,
      },
      { status: 501 }
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido" },
      { status: 400 }
    );
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: blobToken,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAcceptedType(pathname)) {
          throw new Error("Tipos aceites: JPEG, PNG, PDF, DOC ou DOCX");
        }
        const baseName = pathname.includes("/") ? pathname.split("/").at(-1) ?? pathname : pathname;
        const safeName = baseName.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
        const userId = session.user.id;
        const serverPathname = `${userId}/${Date.now()}-${safeName}`;
        return {
          allowedContentTypes: [
            ...ACCEPTED_IMAGE_TYPES,
            ACCEPTED_PDF_TYPE,
            ACCEPTED_DOC_TYPE,
            ACCEPTED_DOCX_TYPE,
          ],
          addRandomSuffix: false,
          pathname: serverPathname,
          tokenPayload: JSON.stringify({ userId }),
        };
      },
      onUploadCompleted: async () => {
        // Opcional: notificação após upload. O processamento é feito em /api/files/process.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar token";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
