import "server-only";

import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { ChatbotError } from "@/lib/errors";
import { llmUsageRecord, user, userCreditBalance } from "@/lib/db/schema";
import { getDb, toDatabaseError } from "../connection";

// --- Créditos por consumo de LLM (docs/SPEC-CREDITOS-LLM.md) ---

export async function getCreditBalance(userId: string) {
  try {
    const [row] = await getDb()
      .select()
      .from(userCreditBalance)
      .where(eq(userCreditBalance.userId, userId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to get credit balance");
  }
}

/** Devolve o saldo atual; se não existir linha, cria com initialBalance e devolve esse valor. */
export async function getOrCreateCreditBalance(
  userId: string,
  initialBalance: number
) {
  const existing = await getCreditBalance(userId);
  if (existing) {
    return existing.balance;
  }
  try {
    await getDb().insert(userCreditBalance).values({
      userId,
      balance: initialBalance,
      updatedAt: new Date(),
    });
    return initialBalance;
  } catch (err) {
    const code = err as { code?: string };
    if (code?.code === "23505") {
      const row = await getCreditBalance(userId);
      return row?.balance ?? initialBalance;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create credit balance"
    );
  }
}

/**
 * Regista o consumo de LLM e debita créditos numa transação atómica.
 *
 * Correções face à versão anterior:
 * 1. Transação: INSERT + UPDATE fazem commit juntos — se o UPDATE falhar, o
 *    registo de uso também não fica gravado (sem créditos "gratuitos").
 * 2. UPDATE atómico: usa SQL `GREATEST(0, balance - creditsConsumed)` em vez de
 *    SELECT + Math.max(), eliminando a race condition TOCTOU em pedidos concorrentes.
 *
 * NOTA: postgres.js envia BEGIN/COMMIT sobre a mesma conexão mesmo com o pooler
 * Supabase porta 6543 (Transaction mode) — o driver reserva a conexão para a
 * duração da transação.
 */
export async function deductCreditsAndRecordUsage({
  userId,
  chatId,
  promptTokens,
  completionTokens,
  model,
  creditsConsumed,
}: {
  userId: string;
  chatId: string | null;
  promptTokens: number;
  completionTokens: number;
  model: string | null;
  creditsConsumed: number;
}) {
  try {
    await getDb().transaction(async (tx) => {
      // SET LOCAL garante que o statement_timeout está definido nesta transação,
      // independentemente da ligação do pool (funciona em transaction mode, porta 6543).
      // Essencial para onFinish após streams longos (>2 min): a nova ligação do pool
      // herda o default Supabase (~8s) sem o SET que foi feito no início do request.
      await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);

      await tx.insert(llmUsageRecord).values({
        userId,
        chatId,
        promptTokens,
        completionTokens,
        model,
        creditsConsumed,
      });
      // UPDATE atómico — elimina race condition TOCTOU de pedidos concorrentes.
      // Não precisa de SELECT prévio: GREATEST garante balance ≥ 0 em linha única.
      await tx
        .update(userCreditBalance)
        .set({
          balance: sql`GREATEST(0, ${userCreditBalance.balance} - ${creditsConsumed})`,
          updatedAt: new Date(),
        })
        .where(eq(userCreditBalance.userId, userId));
    });
  } catch (err) {
    toDatabaseError(err, "Failed to deduct credits or record usage");
  }
}

/**
 * Adiciona créditos a um utilizador de forma atómica (upsert).
 *
 * Correções face à versão anterior:
 * 1. Usa INSERT … ON CONFLICT DO UPDATE em vez de SELECT + INSERT/UPDATE.
 *    Elimina a race condition onde dois pedidos simultâneos fazem SELECT → NULL
 *    e ambos tentam INSERT, falhando o segundo com 23505.
 * 2. O incremento é atómico no servidor de BD — sem TOCTOU.
 */
export async function addCreditsToUser({
  userId,
  delta,
}: {
  userId: string;
  delta: number;
}) {
  if (delta <= 0) {
    return;
  }
  try {
    await getDb()
      .insert(userCreditBalance)
      .values({
        userId,
        balance: delta,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userCreditBalance.userId,
        set: {
          balance: sql`${userCreditBalance.balance} + ${delta}`,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    toDatabaseError(err, "Failed to add credits");
  }
}

const RECENT_USAGE_LIMIT = 200;

export async function getRecentUsageByUserId(userId: string, limit = 10) {
  try {
    return await getDb()
      .select({
        id: llmUsageRecord.id,
        chatId: llmUsageRecord.chatId,
        promptTokens: llmUsageRecord.promptTokens,
        completionTokens: llmUsageRecord.completionTokens,
        model: llmUsageRecord.model,
        creditsConsumed: llmUsageRecord.creditsConsumed,
        createdAt: llmUsageRecord.createdAt,
      })
      .from(llmUsageRecord)
      .where(eq(llmUsageRecord.userId, userId))
      .orderBy(desc(llmUsageRecord.createdAt))
      .limit(Math.min(limit, RECENT_USAGE_LIMIT));
  } catch (err) {
    toDatabaseError(err, "Failed to get recent usage");
  }
}

/**
 * Busca registos de uso com filtros opcionais — usado pelo endpoint Natural Language Postgres.
 * Os filtros são extraídos via LLM (generateObject) e passados como parâmetros tipados.
 */
export async function getRecentUsage({
  userId,
  limit = 50,
  dateFrom,
  dateTo,
  modelPrefix,
  minCredits,
}: {
  userId: string;
  limit?: number;
  dateFrom?: Date;
  dateTo?: Date;
  /** Prefixo do modelo (ex: "anthropic/" filtra todos os modelos Anthropic). */
  modelPrefix?: string;
  minCredits?: number;
}) {
  try {
    const conditions: SQL[] = [eq(llmUsageRecord.userId, userId)];
    if (dateFrom) {
      conditions.push(gte(llmUsageRecord.createdAt, dateFrom));
    }
    if (dateTo) {
      conditions.push(lt(llmUsageRecord.createdAt, dateTo));
    }
    if (modelPrefix) {
      conditions.push(sql`${llmUsageRecord.model} ILIKE ${`${modelPrefix}%`}`);
    }
    if (minCredits !== undefined && minCredits > 0) {
      conditions.push(gte(llmUsageRecord.creditsConsumed, minCredits));
    }
    return await getDb()
      .select({
        id: llmUsageRecord.id,
        chatId: llmUsageRecord.chatId,
        promptTokens: llmUsageRecord.promptTokens,
        completionTokens: llmUsageRecord.completionTokens,
        model: llmUsageRecord.model,
        creditsConsumed: llmUsageRecord.creditsConsumed,
        createdAt: llmUsageRecord.createdAt,
      })
      .from(llmUsageRecord)
      .where(and(...conditions))
      .orderBy(desc(llmUsageRecord.createdAt))
      .limit(Math.min(limit, RECENT_USAGE_LIMIT));
  } catch (err) {
    toDatabaseError(err, "Failed to get recent usage with filters");
  }
}

/** Lista todos os utilizadores com saldo de créditos (para admin). */
export async function getUsersWithCreditBalances() {
  try {
    const rows = await getDb()
      .select({
        userId: user.id,
        email: user.email,
        balance: userCreditBalance.balance,
        updatedAt: userCreditBalance.updatedAt,
      })
      .from(user)
      .leftJoin(userCreditBalance, eq(user.id, userCreditBalance.userId));
    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      balance: r.balance ?? 0,
      updatedAt: r.updatedAt,
    }));
  } catch (err) {
    toDatabaseError(err, "Failed to list users with credits");
  }
}
