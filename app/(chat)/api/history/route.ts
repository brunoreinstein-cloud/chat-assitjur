import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { deleteAllChatsByUserId, getChatsByUserId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const rawLimit = searchParams.get("limit") ?? "10";
  const limit = Number.parseInt(rawLimit, 10);
  const startingAfter = searchParams.get("starting_after");
  const endingBefore = searchParams.get("ending_before");

  if (
    !Number.isFinite(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return new ChatbotError(
      "bad_request:api",
      "limit must be an integer between 1 and 100"
    ).toResponse();
  }

  if (startingAfter && endingBefore) {
    return new ChatbotError(
      "bad_request:api",
      "Only one of starting_after or ending_before can be provided."
    ).toResponse();
  }

  try {
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const chats = await getChatsByUserId({
      id: session.user.id,
      limit,
      startingAfter,
      endingBefore,
    });

    return Response.json(chats);
  } catch (error) {
    if (error instanceof ChatbotError) {
      if (error.surface === "database") {
        return Response.json(
          {
            code: `${error.type}:${error.surface}`,
            message:
              "Base de dados indisponível. Verifique POSTGRES_URL no .env.local.",
            cause: error.cause,
          },
          { status: 503 }
        );
      }
      return error.toResponse();
    }
    return Response.json(
      {
        code: "bad_request:api",
        message: "Something went wrong. Please try again later.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const result = await deleteAllChatsByUserId({ userId: session.user.id });

    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return Response.json(
      {
        code: "bad_request:api",
        message: "Something went wrong. Please try again later.",
      },
      { status: 500 }
    );
  }
}
