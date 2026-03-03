import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteCustomAgentById,
  getCustomAgentById,
  updateCustomAgentById,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const updateBodySchema = z.object({
  name: z.string().min(1).max(256).optional(),
  instructions: z.string().min(1).max(30_000).optional(),
  baseAgentId: z
    .enum(["revisor-defesas", "redator-contestacao"] as const)
    .optional()
    .nullable(),
});

const databaseErrorResponse = () =>
  Response.json(
    {
      code: "bad_request:database",
      message:
        "Base de dados indisponível. Verifique POSTGRES_URL no .env.local.",
    },
    { status: 503 }
  );

/** GET: obter um agente personalizado por id. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const { id } = await params;
    const agent = await getCustomAgentById({
      id,
      userId: session.user.id,
    });
    if (!agent) {
      return Response.json(
        { code: "not_found", message: "Agente não encontrado." },
        { status: 404 }
      );
    }
    return Response.json(agent);
  } catch (error) {
    if (error instanceof ChatbotError) {
      if (error.surface === "database") {
        return databaseErrorResponse();
      }
      return error.toResponse();
    }
    return Response.json(
      { code: "bad_request:api", message: "Algo correu mal. Tente novamente." },
      { status: 500 }
    );
  }
}

/** PATCH: atualizar agente personalizado. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const { id } = await params;
    let body: z.infer<typeof updateBodySchema>;
    try {
      const json = await request.json();
      body = updateBodySchema.parse(json);
    } catch (parseError) {
      const cause =
        parseError instanceof Error ? parseError.message : "Invalid body";
      return new ChatbotError("bad_request:api", cause).toResponse();
    }

    const agent = await updateCustomAgentById({
      id,
      userId: session.user.id,
      name: body.name,
      instructions: body.instructions,
      baseAgentId: body.baseAgentId,
    });
    if (!agent) {
      return Response.json(
        { code: "not_found", message: "Agente não encontrado." },
        { status: 404 }
      );
    }
    return Response.json(agent);
  } catch (error) {
    if (error instanceof ChatbotError) {
      if (error.surface === "database") {
        return databaseErrorResponse();
      }
      return error.toResponse();
    }
    return Response.json(
      { code: "bad_request:api", message: "Algo correu mal. Tente novamente." },
      { status: 500 }
    );
  }
}

/** DELETE: apagar agente personalizado. */
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
    const deleted = await deleteCustomAgentById({
      id,
      userId: session.user.id,
    });
    if (!deleted) {
      return Response.json(
        { code: "not_found", message: "Agente não encontrado." },
        { status: 404 }
      );
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ChatbotError) {
      if (error.surface === "database") {
        return databaseErrorResponse();
      }
      return error.toResponse();
    }
    return Response.json(
      { code: "bad_request:api", message: "Algo correu mal. Tente novamente." },
      { status: 500 }
    );
  }
}
