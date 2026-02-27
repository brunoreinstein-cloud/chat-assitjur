import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";

function redirectToConfigRequired(request: NextRequest) {
  return NextResponse.rewrite(new URL("/config-required", request.url));
}

function shouldShowConfigRequired(pathname: string): boolean {
  if (pathname === "/config-required") return false;
  if (!process.env.VERCEL) return false;
  return !process.env.POSTGRES_URL || !process.env.AUTH_SECRET;
}

/**
 * Middleware: redirecionamento para /config-required na Vercel quando faltam
 * AUTH_SECRET ou POSTGRES_URL; auth de visitantes (guest) e proteção de rotas.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldShowConfigRequired(pathname)) {
    return redirectToConfigRequired(request);
  }
  if (!process.env.AUTH_SECRET && pathname !== "/config-required") {
    return process.env.VERCEL
      ? redirectToConfigRequired(request)
      : NextResponse.next();
  }

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: !isDevelopmentEnvironment,
    });

    if (!token) {
      const redirectUrl = encodeURIComponent(request.url);

      return NextResponse.redirect(
        new URL(`/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
      );
    }

    const isGuest = guestRegex.test(token?.email ?? "");

    if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  } catch {
    if (process.env.VERCEL && pathname !== "/config-required") {
      return redirectToConfigRequired(request);
    }
    return NextResponse.next();
  }
}

export default middleware;

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
