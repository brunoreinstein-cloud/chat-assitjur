import "server-only";

import { and, desc, eq, gte, lt, type SQL, sql } from "drizzle-orm";
import {
  creditTransaction,
  llmUsageRecord,
  user,
  userCreditBalance,
} from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { getDb, toDatabaseError, withRetry } from "../connection";

// --- Créditos por consumo de LLM (docs/SPEC-CREDITOS-LLM.md) ---

export async function getCreditBalance(userId: string) {
  try {
    return await withRetry(async () => {
      const [row] = await getDb()
        .select()
        .from(userCreditBalance)
        .where(eq(userCreditBalance.userId, userId))
        .limit(1);
      return row ?? null;
    });
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
 * Implementação hardened (0b):
 * 1. SELECT FOR UPDATE na linha do utilizador — garante exclusividade durante
 *    a transação; previne race conditions em pedidos paralelos.
 * 2. Verificação do saldo ANTES do débito: se balance < creditsConsumed, não
 *    debita (regista igualmente o uso LLM para auditoria, com delta=0).
 * 3. INSERT em CreditTransaction — audit log completo de todas as movimentações.
 * 4. UPDATE atómico com GREATEST(0, ...) como salvaguarda adicional.
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

      // SELECT FOR UPDATE: bloqueia a linha durante a transação.
      // Previne race condition onde dois pedidos paralelos lêem o mesmo saldo
      // e ambos debitam, resultando em saldo negativo ou duplo débito.
      const [locked] = await tx.execute<{ balance: number }>(
        sql`SELECT balance FROM "UserCreditBalance" WHERE "userId" = ${userId} FOR UPDATE`
      );
      const balanceBefore = locked?.balance ?? 0;

      // Débito efectivo: não pode exceder o saldo disponível.
      const actualDebit = Math.min(creditsConsumed, balanceBefore);
      const balanceAfter = balanceBefore - actualDebit;

      // Registo de uso LLM (sempre, mesmo se saldo insuficiente)
      await tx.insert(llmUsageRecord).values({
        userId,
        chatId,
        promptTokens,
        completionTokens,
        model,
        creditsConsumed,
      });

      if (actualDebit > 0) {
        // UPDATE atómico com GREATEST como salvaguarda adicional.
        await tx
          .update(userCreditBalance)
          .set({
            balance: sql`GREATEST(0, ${userCreditBalance.balance} - ${actualDebit})`,
            updatedAt: new Date(),
          })
          .where(eq(userCreditBalance.userId, userId));

        // Audit log da movimentação
        await tx.insert(creditTransaction).values({
          userId,
          delta: -actualDebit,
          type: "llm_debit",
          referenceId: chatId ?? undefined,
          balanceBefore,
          balanceAfter,
        });
      }
    });
  } catch (err) {
    toDatabaseError(err, "Failed to deduct credits or record usage");
  }
}

/**
 * Adiciona créditos a um utilizador de forma atómica (upsert).
 * Regista também em CreditTransaction para audit log completo.
 *
 * 1. Usa INSERT … ON CONFLICT DO UPDATE em vez de SELECT + INSERT/UPDATE.
 *    Elimina a race condition onde dois pedidos simultâneos fazem SELECT → NULL
 *    e ambos tentam INSERT, falhando o segundo com 23505.
 * 2. O incremento é atómico no servidor de BD — sem TOCTOU.
 */
export async function addCreditsToUser({
  userId,
  delta,
  type = "top_up",
  referenceId,
}: {
  userId: string;
  delta: number;
  /** Tipo de movimentação: "top_up" | "refund" | "admin" | "initial". Default: "top_up". */
  type?: string;
  referenceId?: string;
}) {
  if (delta <= 0) {
    return;
  }
  try {
    await getDb().transaction(async (tx) => {
      // Saldo antes (para o audit log)
      const [row] = await tx.execute<{ balance: number }>(
        sql`SELECT balance FROM "UserCreditBalance" WHERE "userId" = ${userId} FOR UPDATE`
      );
      const balanceBefore = row?.balance ?? 0;

      await tx
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

      await tx.insert(creditTransaction).values({
        userId,
        delta,
        type,
        referenceId,
        balanceBefore,
        balanceAfter: balanceBefore + delta,
      });
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
