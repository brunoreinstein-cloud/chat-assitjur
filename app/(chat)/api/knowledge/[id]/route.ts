import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { updateKnowledgeDocumentById } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const patchBodySchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(512).optional(),
  content: z.string().min(1).optional(),
});

/** PATCH: atualizar documento (pasta, título ou conteúdo). */
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

  const updated = await updateKnowledgeDocumentById({
    id,
    userId: session.user.id,
    folderId: body.folderId,
    title: body.title,
    content: body.content,
  });
  if (!updated) {
    return new ChatbotError("not_found:document").toResponse();
  }
  return Response.json(updated);
}
