import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createKnowledgeDocument,
  deleteKnowledgeDocumentById,
  getKnowledgeDocumentsByIds,
  getKnowledgeDocumentsByUserId,
  getKnowledgeDocumentsRecentByUserId,
  updateKnowledgeDocumentStructuredSummary,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { vectorizeAndIndex } from "@/lib/rag";
import { extractLegalSummary } from "@/lib/ai/extract-legal-summary";

const createBodySchema = z.object({
  title: z.string().min(1).max(512),
  content: z.string().min(1),
  folderId: z.string().uuid().nullable().optional(),
  /** Se true, cria documento sem vetorizar (indexingStatus = pending); vetorizar depois via POST /api/knowledge/index-pending ou job. */
  skipVectorize: z.boolean().optional().default(false),
});

const databaseErrorResponse = () =>
  Response.json(
    {
      code: "bad_request:database",
      message:
        "Base de dados indisponível. Verifique POSTGRES_URL no .env.local.",
    },
    { status: 503 }
  );

/** GET: listar documentos do usuário ou buscar por ids (para contexto do chat). */
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");

    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        return Response.json([]);
      }
      const documents = await getKnowledgeDocumentsByIds({
        ids,
        userId: session.user.id,
      });
      return Response.json(documents);
    }

    const recentParam = searchParams.get("recent");
    const recentLimit =
      recentParam !== null && recentParam !== ""
        ? Number.parseInt(recentParam, 10)
        : Number.NaN;
    if (Number.isFinite(recentLimit) && recentLimit > 0) {
      const documents = await getKnowledgeDocumentsRecentByUserId({
        userId: session.user.id,
        limit: Math.min(recentLimit, 50),
      });
      return Response.json(documents);
    }

    const folderIdParam = searchParams.get("folderId");
    const folderId =
      folderIdParam === "" || folderIdParam === "root"
        ? null
        : (folderIdParam ?? undefined);

    const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const limitParam = Number.parseInt(searchParams.get("limit") ?? "0", 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const pageSize =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 200)
        : undefined;
    const offset = pageSize !== undefined ? (page - 1) * pageSize : undefined;

    const documents = await getKnowledgeDocumentsByUserId({
      userId: session.user.id,
      folderId,
      limit: pageSize,
      offset,
    });
    return Response.json(documents);
  } catch (error) {
    if (error instanceof ChatbotError) {
      if (error.surface === "database") {
        return databaseErrorResponse();
      }
      return error.toResponse();
    }
    return Response.json(
      { code: "bad_request:api", message: "Algo correu mal. Tente novamente." },
      { status: 500 }
    );
  }
}

/** POST: criar documento na base de conhecimento. */
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    let body: z.infer<typeof createBodySchema>;
    try {
      const json = await request.json();
      body = createBodySchema.parse(json);
    } catch (parseError) {
      const cause =
        parseError instanceof Error ? parseError.message : "Invalid body";
      return new ChatbotError("bad_request:api", cause).toResponse();
    }

    const doc = await createKnowledgeDocument({
      userId: session.user.id,
      folderId: body.folderId,
      title: body.title,
      content: body.content,
      indexingStatus: body.skipVectorize ? "pending" : "indexed",
    });

    if (!body.skipVectorize) {
      await vectorizeAndIndex(doc.id, body.content, {
        meta: { userId: doc.userId, title: doc.title },
      });
      // Fire-and-forget: extrai resumo estruturado para PI/Contestação sem bloquear a resposta
      extractLegalSummary(body.content)
        .then((summary) => {
          if (summary) {
            return updateKnowledgeDocumentStructuredSummary({
              id: doc.id,
              structuredSummary: summary,
            });
          }
        })
        .catch(() => {});
    }

    return Response.json(doc, { status: 201 });
  } catch (error) {
    if (error instanceof ChatbotError) {
      if (error.surface === "database") {
        return databaseErrorResponse();
      }
      return error.toResponse();
    }
    return Response.json(
      { code: "bad_request:api", message: "Algo correu mal. Tente novamente." },
      { status: 500 }
    );
  }
}

/** DELETE: remover documento por id. */
export async function DELETE(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return new ChatbotError(
        "bad_request:api",
        "Parameter id is required"
      ).toResponse();
    }

    const deleted = await deleteKnowledgeDocumentById({
      id,
      userId: session.user.id,
    });
    if (!deleted) {
      return new ChatbotError("not_found:document").toResponse();
    }
    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof ChatbotError) {
      if (error.surface === "database") {
        return databaseErrorResponse();
      }
      return error.toResponse();
    }
    return Response.json(
      { code: "bad_request:api", message: "Algo correu mal. Tente novamente." },
      { status: 500 }
    );
  }
}
