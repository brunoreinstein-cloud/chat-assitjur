import { auth } from "@/app/(auth)/auth";
import {
  ensureStatementTimeout,
  getAuditEventsByProcesso,
  getProcessoById,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const { id } = await params;
    await ensureStatementTimeout();

    // Validar que o processo pertence ao utilizador
    const processo = await getProcessoById({ id, userId: session.user.id });
    if (!processo) {
      return Response.json({ message: "Not found" }, { status: 404 });
    }

    const events = await getAuditEventsByProcesso(id);
    return Response.json({ events });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return Response.json(
      { message: "Failed to fetch audit events" },
      { status: 500 }
    );
  }
}
