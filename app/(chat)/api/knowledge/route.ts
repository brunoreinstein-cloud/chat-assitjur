import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { chunkText, embedChunks } from "@/lib/ai/rag";
import {
  createKnowledgeDocument,
  deleteChunksByKnowledgeDocumentId,
  deleteKnowledgeDocumentById,
  getKnowledgeDocumentsByIds,
  getKnowledgeDocumentsByUserId,
  getKnowledgeDocumentsRecentByUserId,
  insertKnowledgeChunks,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const createBodySchema = z.object({
  title: z.string().min(1).max(512),
  content: z.string().min(1),
  folderId: z.string().uuid().nullable().optional(),
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

    const documents = await getKnowledgeDocumentsByUserId({
      userId: session.user.id,
      folderId,
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
    });

    const chunks = chunkText(body.content);
    if (chunks.length > 0) {
      const embedded = await embedChunks(chunks);
      if (embedded !== null && embedded.length === chunks.length) {
        try {
          await insertKnowledgeChunks({
            knowledgeDocumentId: doc.id,
            chunksWithEmbeddings: chunks.map((text, i) => ({
              text,
              embedding: embedded[i]?.embedding ?? [],
            })),
          });
        } catch {
          await deleteChunksByKnowledgeDocumentId(doc.id);
        }
      }
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
