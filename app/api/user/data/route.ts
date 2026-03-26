import { auth } from "@/app/(auth)/auth";
import { exportUserData } from "@/lib/db/queries/users";
import { ChatbotError } from "@/lib/errors";

/**
 * GET /api/user/data
 * Exporta todos os dados do utilizador (LGPD — direito de portabilidade).
 * Retorna JSON com todos os registos associados ao userId.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:auth").toResponse();
  }

  try {
    const data = await exportUserData(session.user.id);

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="assistjur-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return new ChatbotError(
      "bad_request:database",
      "Falha ao exportar dados."
    ).toResponse();
  }
}
