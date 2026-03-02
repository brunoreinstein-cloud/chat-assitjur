import { auth } from "@/app/(auth)/auth";
import { deleteUserFileById } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

/** DELETE: remover ficheiro da biblioteca "Arquivos" (apenas a referência; o blob no Storage não é apagado). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }
    const { id } = await params;
    const deleted = await deleteUserFileById({
      id,
      userId: session.user.id,
    });
    if (!deleted) {
      return Response.json(
        { code: "not_found", message: "Arquivo não encontrado." },
        { status: 404 }
      );
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return Response.json(
      { code: "bad_request:api", message: "Erro ao remover arquivo." },
      { status: 500 }
    );
  }
}
