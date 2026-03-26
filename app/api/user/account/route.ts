import { auth } from "@/app/(auth)/auth";
import { deleteUser } from "@/lib/db/queries/users";
import { ChatbotError } from "@/lib/errors";

/**
 * DELETE /api/user/account
 * Apaga permanentemente a conta do utilizador e todos os dados associados.
 * LGPD — direito ao esquecimento (Art. 18, VI).
 *
 * Requer confirmação explícita no body: { "confirm": true }
 */
export async function DELETE(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:auth").toResponse();
  }

  try {
    const body = await request.json();

    if (body?.confirm !== true) {
      return Response.json(
        {
          error:
            'Para confirmar a exclusão da conta, envie { "confirm": true } no body.',
        },
        { status: 400 }
      );
    }

    const result = await deleteUser(session.user.id);

    if (!result.deleted) {
      return new ChatbotError(
        "not_found:database",
        "Conta não encontrada."
      ).toResponse();
    }

    return Response.json(
      {
        message:
          "Conta e todos os dados associados foram excluídos permanentemente.",
        deletedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return new ChatbotError(
      "bad_request:database",
      "Falha ao excluir conta."
    ).toResponse();
  }
}
