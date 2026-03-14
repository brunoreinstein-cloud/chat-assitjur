import { auth } from "@/app/(auth)/auth";
import {
  createProcesso,
  ensureStatementTimeout,
  getProcessosByUserId,
  replaceVerbasByProcessoId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export const maxDuration = 30;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }
    await ensureStatementTimeout();
    const processos = await getProcessosByUserId({ userId: session.user.id });
    return Response.json(processos);
  } catch (error) {
    if (error instanceof ChatbotError) return error.toResponse();
    return Response.json({ message: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const body = await request.json();
    const {
      numeroAutos,
      reclamante,
      reclamada,
      vara,
      comarca,
      tribunal,
      rito,
      fase,
      riscoGlobal,
      valorCausa,
      provisao,
      prazoFatal,
      verbas,
    } = body;

    if (!numeroAutos?.trim() || !reclamante?.trim() || !reclamada?.trim()) {
      return Response.json(
        { message: "numeroAutos, reclamante e reclamada são obrigatórios" },
        { status: 400 }
      );
    }

    await ensureStatementTimeout();

    const created = await createProcesso({
      userId: session.user.id,
      data: {
        numeroAutos: numeroAutos.trim(),
        reclamante: reclamante.trim(),
        reclamada: reclamada.trim(),
        vara: vara?.trim() || undefined,
        comarca: comarca?.trim() || undefined,
        tribunal: tribunal?.trim() || undefined,
        rito: rito || undefined,
        fase: fase || undefined,
        riscoGlobal: riscoGlobal || undefined,
        valorCausa: valorCausa?.trim() || undefined,
        provisao: provisao?.trim() || undefined,
        prazoFatal: prazoFatal ? new Date(prazoFatal) : null,
      },
    });

    if (Array.isArray(verbas) && verbas.length > 0) {
      await replaceVerbasByProcessoId({ processoId: created.id, verbas });
    }

    return Response.json({ ...created, verbas: verbas ?? [] }, { status: 201 });
  } catch (error) {
    if (error instanceof ChatbotError) return error.toResponse();
    return Response.json({ message: "Internal error" }, { status: 500 });
  }
}
