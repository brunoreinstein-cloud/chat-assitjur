import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { extractLegalSummary } from "@/lib/ai/extract-legal-summary";
import {
  createUserFile,
  getUserFilesByUserId,
  updateUserFileStructuredSummary,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const createBodySchema = z.object({
  pathname: z.string().min(1).max(1024),
  url: z.string().url().max(2048),
  filename: z.string().min(1).max(512),
  contentType: z.string().min(1).max(128),
  extractedTextCache: z.string().max(600_000).nullable().optional(),
});

/** GET: listar arquivos do utilizador (biblioteca "Arquivos"). */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }
    const files = await getUserFilesByUserId({ userId: session.user.id });
    return Response.json(files);
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return Response.json(
      { code: "bad_request:api", message: "Erro ao listar arquivos." },
      { status: 500 }
    );
  }
}

/** POST: guardar referência de ficheiro em "Arquivos" (a partir do chat ou upload). */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }
    if (request.body === null) {
      return new ChatbotError(
        "bad_request:api",
        "Corpo da requisição vazio"
      ).toResponse();
    }
    const body = await request.json();
    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(". ");
      return new ChatbotError(
        "bad_request:api",
        msg ?? "Dados inválidos"
      ).toResponse();
    }
    const { pathname, url, filename, contentType, extractedTextCache } =
      parsed.data;
    const created = await createUserFile({
      userId: session.user.id,
      pathname,
      url,
      filename,
      contentType,
      extractedTextCache: extractedTextCache ?? null,
    });

    // Fire-and-forget: extrai resumo estruturado para PI/Contestação (não bloqueia resposta)
    const textForSummary = extractedTextCache?.trim();
    if (textForSummary && textForSummary.length >= 500) {
      extractLegalSummary(textForSummary)
        .then((summary) => {
          if (summary) {
            return updateUserFileStructuredSummary({
              id: created.id,
              structuredSummary: summary,
            });
          }
        })
        .catch(() => {
          /* fire-and-forget: falha silenciosa */
        });
    }

    return Response.json(
      {
        id: created.id,
        pathname: created.pathname,
        filename: created.filename,
        contentType: created.contentType,
        createdAt: created.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return Response.json(
      { code: "bad_request:api", message: "Erro ao guardar em Arquivos." },
      { status: 500 }
    );
  }
}
