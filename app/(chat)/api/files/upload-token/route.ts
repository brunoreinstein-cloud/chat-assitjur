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
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".pdf")) return true;
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return true;
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png"))
    return true;
  return ACCEPTED_EXTENSIONS.test(pathname);
}

/**
 * Gera token para upload direto cliente → Vercel Blob (ficheiros > 4,5 MB).
 * O corpo do pedido é JSON (sem ficheiro), por isso não está sujeito ao limite de 4,5 MB.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Upload de ficheiros grandes não disponível. Use um ficheiro com menos de 4,5 MB.",
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

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
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
