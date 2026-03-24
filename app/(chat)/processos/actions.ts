"use server";

import { revalidatePath } from "next/cache";
import { nextFase } from "@/lib/constants/processo";
import {
  ensureStatementTimeout,
  getProcessoById,
  linkProcessoToChat,
  replaceVerbasByProcessoId,
  savePeca,
  updateProcesso,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { RbacError, requirePermission } from "@/lib/rbac/guards";

// ─── Verbas / Risco ──────────────────────────────────────────────────────────

export interface VerbaInput {
  verba: string;
  risco: "provavel" | "possivel" | "remoto";
  valorMin?: number | null;
  valorMax?: number | null;
}

export type UpsertVerbaResult =
  | { success: true; count: number }
  | { success: false; error: string };

/**
 * Substitui todas as verbas de um processo pelas fornecidas.
 * Chamado pelos agentes (via tool upsertRiscoVerba) após análise de risco.
 * Verifica posse do processo antes de gravar.
 */
export async function upsertRiscoVerbaAction(
  processoId: string,
  verbas: VerbaInput[]
): Promise<UpsertVerbaResult> {
  try {
    const { userId } = await requirePermission("verba:update");

    await ensureStatementTimeout();

    const proc = await getProcessoById({
      id: processoId,
      userId,
    });
    if (!proc) {
      return { success: false, error: "not_found" };
    }

    const RISCOS_VALIDOS = ["provavel", "possivel", "remoto"];
    const verbasValidas = verbas.filter(
      (v) => v.verba?.trim() && RISCOS_VALIDOS.includes(v.risco)
    );

    await replaceVerbasByProcessoId({
      processoId,
      verbas: verbasValidas.map((v) => ({
        verba: v.verba.trim(),
        risco: v.risco,
        valorMin: v.valorMin ?? null,
        valorMax: v.valorMax ?? null,
      })),
    });

    revalidatePath(`/processos/${processoId}`);
    return { success: true, count: verbasValidas.length };
  } catch (error) {
    if (error instanceof RbacError) {
      return { success: false, error: "forbidden" };
    }
    if (error instanceof ChatbotError) {
      return { success: false, error: error.type ?? "error" };
    }
    return { success: false, error: "error" };
  }
}

// ─── Peças ───────────────────────────────────────────────────────────────────

export type SavePecaResult =
  | { success: true; id: string }
  | { success: false; error: string };

/**
 * Guarda uma peça processual gerada pelo agente (Redator, Master).
 * O agente passa o markdown; o blobUrl é preenchido após upload do DOCX pelo cliente.
 */
export async function savePecaAction(params: {
  processoId: string;
  titulo: string;
  tipo: string;
  conteudo?: string;
  blobUrl?: string;
  chatId?: string;
}): Promise<SavePecaResult> {
  try {
    const { userId } = await requirePermission("peca:create");

    await ensureStatementTimeout();

    const proc = await getProcessoById({
      id: params.processoId,
      userId,
    });
    if (!proc) {
      return { success: false, error: "not_found" };
    }

    const created = await savePeca({
      processoId: params.processoId,
      userId,
      titulo: params.titulo.trim(),
      tipo: params.tipo || "outro",
      conteudo: params.conteudo,
      blobUrl: params.blobUrl,
      chatId: params.chatId,
    });

    revalidatePath(`/processos/${params.processoId}`);
    return { success: true, id: created.id };
  } catch (error) {
    if (error instanceof RbacError) {
      return { success: false, error: "forbidden" };
    }
    if (error instanceof ChatbotError) {
      return { success: false, error: error.type ?? "error" };
    }
    return { success: false, error: "error" };
  }
}

// ─── Fases ───────────────────────────────────────────────────────────────────

export type FaseActionResult =
  | { success: true; fase: string }
  | { success: false; error: string };

/**
 * Avança a fase do processo para a próxima etapa do pipeline.
 * Idempotente: se já está na fase terminal (protocolo), retorna erro.
 */
export async function avancaFaseAction(
  processoId: string
): Promise<FaseActionResult> {
  try {
    const { userId } = await requirePermission("processo:update");

    await ensureStatementTimeout();

    const proc = await getProcessoById({ id: processoId, userId });
    if (!proc) {
      return { success: false, error: "not_found" };
    }

    const nova = nextFase(proc.fase);
    if (!nova) {
      return {
        success: false,
        error: proc.fase === "protocolo" ? "already_terminal" : "unknown_fase",
      };
    }

    const updated = await updateProcesso({
      id: processoId,
      userId,
      data: { fase: nova },
    });

    if (!updated) {
      return { success: false, error: "update_failed" };
    }

    revalidatePath(`/processos/${processoId}`);
    revalidatePath("/processos");
    return { success: true, fase: nova };
  } catch (error) {
    if (error instanceof RbacError) {
      return { success: false, error: "forbidden" };
    }
    if (error instanceof ChatbotError) {
      return { success: false, error: error.type ?? "error" };
    }
    return { success: false, error: "error" };
  }
}

/**
 * Define a fase do processo diretamente (para correcções manuais).
 * Valida que a fase é uma das fases conhecidas.
 */
export async function setFaseAction(
  processoId: string,
  fase: string
): Promise<FaseActionResult> {
  const FASES_VALIDAS = [
    "recebimento",
    "analise_risco",
    "estrategia",
    "elaboracao",
    "revisao",
    "protocolo",
  ];

  if (!FASES_VALIDAS.includes(fase)) {
    return { success: false, error: "invalid_fase" };
  }

  try {
    const { userId } = await requirePermission("processo:update");

    await ensureStatementTimeout();

    const proc = await getProcessoById({ id: processoId, userId });
    if (!proc) {
      return { success: false, error: "not_found" };
    }

    const updated = await updateProcesso({
      id: processoId,
      userId,
      data: { fase },
    });

    if (!updated) {
      return { success: false, error: "update_failed" };
    }

    revalidatePath(`/processos/${processoId}`);
    revalidatePath("/processos");
    return { success: true, fase };
  } catch (error) {
    if (error instanceof RbacError) {
      return { success: false, error: "forbidden" };
    }
    if (error instanceof ChatbotError) {
      return { success: false, error: error.type ?? "error" };
    }
    return { success: false, error: "error" };
  }
}

// ─── Chat ↔ Processo ─────────────────────────────────────────────────────────

export type SetChatProcessoResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Vincula (ou desvincula) um processo a um chat existente.
 * Se processoId for fornecido, verifica que o utilizador possui o processo.
 * Chamado pelo ProcessoSelector quando o utilizador muda o processo no chat.
 */
export async function setChatProcessoAction(
  chatId: string,
  processoId: string | null
): Promise<SetChatProcessoResult> {
  try {
    const { userId } = await requirePermission("processo:update");

    if (processoId) {
      const proc = await getProcessoById({ id: processoId, userId });
      if (!proc) {
        return { success: false, error: "not_found" };
      }
    }

    await linkProcessoToChat({ chatId, processoId });
    return { success: true };
  } catch (error) {
    if (error instanceof RbacError) {
      return { success: false, error: "forbidden" };
    }
    if (error instanceof ChatbotError) {
      return { success: false, error: error.type ?? "error" };
    }
    return { success: false, error: "error" };
  }
}
