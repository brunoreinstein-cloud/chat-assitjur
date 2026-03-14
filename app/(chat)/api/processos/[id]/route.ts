import { auth } from "@/app/(auth)/auth";
import {
  deleteProcesso,
  ensureStatementTimeout,
  getProcessoById,
  replaceVerbasByProcessoId,
  updateProcesso,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export const maxDuration = 30;

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
    const p = await getProcessoById({ id, userId: session.user.id });
    if (!p) return Response.json({ message: "Not found" }, { status: 404 });
    return Response.json(p);
  } catch (error) {
    if (error instanceof ChatbotError) return error.toResponse();
    return Response.json({ message: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }
    const { id } = await params;
    const body = await request.json();
    const { verbas, ...fields } = body;

    await ensureStatementTimeout();

    const updated = await updateProcesso({
      id,
      userId: session.user.id,
      data: {
        ...(fields.numeroAutos != null && {
          numeroAutos: fields.numeroAutos,
        }),
        ...(fields.reclamante != null && { reclamante: fields.reclamante }),
        ...(fields.reclamada != null && { reclamada: fields.reclamada }),
        ...(fields.vara != null && { vara: fields.vara }),
        ...(fields.comarca != null && { comarca: fields.comarca }),
        ...(fields.tribunal != null && { tribunal: fields.tribunal }),
        ...(fields.rito != null && { rito: fields.rito }),
        ...(fields.fase != null && { fase: fields.fase }),
        ...(fields.riscoGlobal != null && {
          riscoGlobal: fields.riscoGlobal,
        }),
        ...(fields.valorCausa != null && { valorCausa: fields.valorCausa }),
        ...(fields.provisao != null && { provisao: fields.provisao }),
        ...(fields.prazoFatal !== undefined && {
          prazoFatal: fields.prazoFatal ? new Date(fields.prazoFatal) : null,
        }),
      },
    });

    if (!updated) return Response.json({ message: "Not found" }, { status: 404 });

    if (Array.isArray(verbas)) {
      await replaceVerbasByProcessoId({ processoId: id, verbas });
    }

    const result = await getProcessoById({ id, userId: session.user.id });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ChatbotError) return error.toResponse();
    return Response.json({ message: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
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
    await deleteProcesso({ id, userId: session.user.id });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ChatbotError) return error.toResponse();
    return Response.json({ message: "Internal error" }, { status: 500 });
  }
}
