import { auth } from "@/app/(auth)/auth";
import {
  createKnowledgeDocument,
  deleteKnowledgeDocumentById,
  getKnowledgeDocumentsByIds,
  getKnowledgeDocumentsByUserId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { z } from "zod";

const createBodySchema = z.object({
  title: z.string().min(1).max(512),
  content: z.string().min(1),
});

/** GET: listar documentos do usuário ou buscar por ids (para contexto do chat). */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");

  if (idsParam) {
    const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      return Response.json([]);
    }
    const documents = await getKnowledgeDocumentsByIds({
      ids,
      userId: session.user.id,
    });
    return Response.json(documents);
  }

  const documents = await getKnowledgeDocumentsByUserId({
    userId: session.user.id,
  });
  return Response.json(documents);
}

/** POST: criar documento na base de conhecimento. */
export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let body: z.infer<typeof createBodySchema>;
  try {
    const json = await request.json();
    body = createBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api", "Invalid body").toResponse();
  }

  const doc = await createKnowledgeDocument({
    userId: session.user.id,
    title: body.title,
    content: body.content,
  });
  return Response.json(doc, { status: 201 });
}

/** DELETE: remover documento por id. */
export async function DELETE(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return new ChatbotError("bad_request:api", "Parameter id is required").toResponse();
  }

  const deleted = await deleteKnowledgeDocumentById({
    id,
    userId: session.user.id,
  });
  if (!deleted) {
    return new ChatbotError("not_found:document").toResponse();
  }
  return Response.json({ deleted: true });
}
