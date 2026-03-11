import { z } from "zod";
import { auth } from "@/app/(auth)/auth";

export const maxDuration = 30;
import {
  createCustomAgent,
  ensureStatementTimeout,
  getCustomAgentsByUserId,
} from "@/lib/db/queries";
import {
  ChatbotError,
  databaseUnavailableResponse,
  isDatabaseConnectionError,
  isLikelyDatabaseError,
  isStatementTimeoutError,
} from "@/lib/errors";

export const maxDuration = 30;

const createBodySchema = z.object({
  name: z.string().min(1).max(256),
  instructions: z.string().min(1).max(30_000),
  baseAgentId: z
    .enum([
      "revisor-defesas",
      "redator-contestacao",
      "assistjur-master",
    ] as const)
    .optional()
    .nullable(),
  knowledgeDocumentIds: z.array(z.string().uuid()).max(50).optional(),
});

/** GET: listar agentes personalizados do utilizador. */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    await ensureStatementTimeout();
    const agents = await getCustomAgentsByUserId(session.user.id);
    return Response.json(agents);
  } catch (error) {
    if (error instanceof ChatbotError) {
      if (error.surface === "database") {
        return databaseUnavailableResponse();
      }
      return error.toResponse();
    }
    if (
      isDatabaseConnectionError(error) ||
      isStatementTimeoutError(error) ||
      isLikelyDatabaseError(error)
    ) {
      return databaseUnavailableResponse();
    }
    if (process.env.NODE_ENV === "development") {
      console.warn("[api/agents/custom] GET 500:", error);
    }
    return Response.json(
      { code: "bad_request:api", message: "Algo correu mal. Tente novamente." },
      { status: 500 }
    );
  }
}

/** POST: criar agente personalizado. */
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    let body: z.infer<typeof createBodySchema>;
    try {
      const json = await request.json();
      body = createBodySchema.parse(json);
    } catch (parseError) {
      const cause =
        parseError instanceof Error ? parseError.message : "Invalid body";
      return new ChatbotError("bad_request:api", cause).toResponse();
    }

    const agent = await createCustomAgent({
      userId: session.user.id,
      name: body.name,
      instructions: body.instructions,
      baseAgentId: body.baseAgentId ?? null,
      knowledgeDocumentIds: body.knowledgeDocumentIds?.slice(0, 50),
    });
    return Response.json(agent, { status: 201 });
  } catch (error) {
    if (error instanceof ChatbotError) {
      if (error.surface === "database") {
        return databaseUnavailableResponse();
      }
      return error.toResponse();
    }
    if (
      isDatabaseConnectionError(error) ||
      isStatementTimeoutError(error) ||
      isLikelyDatabaseError(error)
    ) {
      return databaseUnavailableResponse();
    }
    if (process.env.NODE_ENV === "development") {
      console.warn("[api/agents/custom] POST 500:", error);
    }
    return Response.json(
      { code: "bad_request:api", message: "Algo correu mal. Tente novamente." },
      { status: 500 }
    );
  }
}
