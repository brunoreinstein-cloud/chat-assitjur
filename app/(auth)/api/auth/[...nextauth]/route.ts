import { type NextRequest, NextResponse } from "next/server";
import { auth, GET as AuthGET, POST as AuthPOST } from "@/app/(auth)/auth";

const authErrorResponse = (error: unknown) =>
  NextResponse.json(
    {
      error: "AuthError",
      message:
        error instanceof Error ? error.message : "Authentication failed",
    },
    { status: 500 }
  );

const sessionJsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
} as const;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  const { nextauth } = await context.params;
  if (nextauth?.at(0) === "session") {
    try {
      const session = await auth();
      const body =
        session && typeof session === "object"
          ? { user: session.user, expires: session.expires }
          : {};
      return new NextResponse(JSON.stringify(body), {
        status: 200,
        headers: sessionJsonHeaders,
      });
    } catch (error) {
      return new NextResponse(
        JSON.stringify({
          error: "SessionError",
          message:
            error instanceof Error ? error.message : "Failed to get session",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  try {
    return await AuthGET(request);
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  try {
    return await AuthPOST(request);
  } catch (error) {
    return authErrorResponse(error);
  }
}
