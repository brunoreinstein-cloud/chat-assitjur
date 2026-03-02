import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createKnowledgeFolder,
  getKnowledgeFoldersByUserId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const createBodySchema = z.object({
  name: z.string().min(1).max(256),
  parentId: z.string().uuid().nullable().optional(),
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

/** GET: listar pastas do utilizador. */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const folders = await getKnowledgeFoldersByUserId({
      userId: session.user.id,
    });
    return Response.json(folders);
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

/** POST: criar pasta. */
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

    const folder = await createKnowledgeFolder({
      userId: session.user.id,
      parentId: body.parentId,
      name: body.name,
    });
    return Response.json(folder, { status: 201 });
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
