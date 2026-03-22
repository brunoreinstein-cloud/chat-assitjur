/**
 * GET  /api/processos/[id]/tasks  — lista execuções de tarefas do processo
 * POST /api/processos/[id]/tasks  — cria uma nova execução de tarefa
 */

import { auth } from "@/app/(auth)/auth";
import {
  createTaskExecution,
  ensureStatementTimeout,
  getProcessoById,
  getTaskExecutionsByProcessoId,
  updateTaskExecution,
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

    const { id: processoId } = await params;
    await ensureStatementTimeout();

    // Verifica que o processo pertence ao utilizador
    const proc = await getProcessoById({
      id: processoId,
      userId: session.user.id,
    });
    if (!proc) {
      return Response.json(
        { error: "Processo não encontrado" },
        { status: 404 }
      );
    }

    const tasks = await getTaskExecutionsByProcessoId({ processoId });
    return Response.json(tasks);
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return Response.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const { id: processoId } = await params;
    await ensureStatementTimeout();

    // Verifica que o processo pertence ao utilizador
    const proc = await getProcessoById({
      id: processoId,
      userId: session.user.id,
    });
    if (!proc) {
      return Response.json(
        { error: "Processo não encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { taskId, chatId } = body as { taskId?: string; chatId?: string };

    if (!taskId?.trim()) {
      return Response.json(
        { error: "taskId é obrigatório" },
        { status: 400 }
      );
    }

    const created = await createTaskExecution({
      processoId,
      taskId: taskId.trim(),
      chatId: chatId?.trim() || undefined,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return Response.json({ error: "Erro interno" }, { status: 500 });
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

    const { id: processoId } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      taskExecutionId,
      status,
      result,
      documentsUrl,
      creditsUsed,
      chatId,
    } = body as {
      taskExecutionId?: string;
      status?: string;
      result?: Record<string, unknown>;
      documentsUrl?: string[];
      creditsUsed?: number;
      chatId?: string;
    };

    if (!taskExecutionId) {
      return Response.json(
        { error: "taskExecutionId é obrigatório" },
        { status: 400 }
      );
    }

    // Verify ownership via processo
    const proc = await getProcessoById({
      id: processoId,
      userId: session.user.id,
    });
    if (!proc) {
      return Response.json(
        { error: "Processo não encontrado" },
        { status: 404 }
      );
    }

    const updated = await updateTaskExecution({
      id: taskExecutionId,
      data: {
        ...(status ? { status } : {}),
        ...(result ? { result } : {}),
        ...(documentsUrl ? { documentsUrl } : {}),
        ...(creditsUsed !== undefined ? { creditsUsed } : {}),
        ...(chatId ? { chatId } : {}),
        ...(status === "complete" || status === "error"
          ? { completedAt: new Date() }
          : {}),
      },
    });

    if (!updated) {
      return Response.json(
        { error: "Execução não encontrada" },
        { status: 404 }
      );
    }

    return Response.json(updated);
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return Response.json({ error: "Erro interno" }, { status: 500 });
  }
}
