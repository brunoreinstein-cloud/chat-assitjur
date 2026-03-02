import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteKnowledgeFolderById,
  updateKnowledgeFolderById,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const patchBodySchema = z.object({
  name: z.string().min(1).max(256).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

/** PATCH: renomear ou mover pasta. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await context.params;
  let body: z.infer<typeof patchBodySchema>;
  try {
    const json = await request.json();
    body = patchBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api", "Invalid body").toResponse();
  }

  const updated = await updateKnowledgeFolderById({
    id,
    userId: session.user.id,
    name: body.name,
    parentId: body.parentId,
  });
  if (!updated) {
    return new ChatbotError("not_found:document").toResponse();
  }
  return Response.json(updated);
}

/** DELETE: apagar pasta (documentos ficam com folderId null; subpastas ficam com parentId null). */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await context.params;
  const deleted = await deleteKnowledgeFolderById({
    id,
    userId: session.user.id,
  });
  if (!deleted) {
    return new ChatbotError("not_found:document").toResponse();
  }
  return Response.json({ deleted: true });
}
