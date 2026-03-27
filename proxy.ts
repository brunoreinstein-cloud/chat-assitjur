import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isDevelopmentEnvironment } from "./lib/constants";

function redirectToConfigRequired(request: NextRequest) {
  return NextResponse.rewrite(new URL("/config-required", request.url));
}

function shouldShowConfigRequired(pathname: string): boolean {
  if (pathname === "/config-required") {
    return false;
  }
  if (!process.env.VERCEL) {
    return false;
  }
  return !(process.env.POSTGRES_URL && process.env.AUTH_SECRET);
}

function handleNoToken(request: NextRequest, pathname: string): NextResponse {
  const isAuthPage = pathname === "/login" || pathname === "/register";
  if (isAuthPage) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.url);
  const callbackPath = pathname + (request.nextUrl.search || "");
  if (callbackPath && callbackPath !== "/") {
    loginUrl.searchParams.set("callbackUrl", callbackPath);
  }
  return NextResponse.redirect(loginUrl);
}

/**
 * Proxy (Next.js 16): redirecionamento para /config-required na Vercel quando faltam
 * AUTH_SECRET ou POSTGRES_URL; proteção de rotas (redireciona para /login se não autenticado).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldShowConfigRequired(pathname)) {
    return redirectToConfigRequired(request);
  }
  if (!process.env.AUTH_SECRET && pathname !== "/config-required") {
    return process.env.VERCEL
      ? redirectToConfigRequired(request)
      : NextResponse.next();
  }

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
      return handleNoToken(request, pathname);
    }

    const isAuthPage = pathname === "/login" || pathname === "/register";
    if (isAuthPage) {
      return NextResponse.redirect(new URL("/chat", request.url));
    }

    return NextResponse.next();
  } catch {
    if (process.env.VERCEL && pathname !== "/config-required") {
      return redirectToConfigRequired(request);
    }
    return NextResponse.next();
  }
}

export default proxy;

export const config = {
  matcher: [
    "/",
    "/chat",
    "/chat/:path*",
    "/login",
    "/register",
    "/admin",
    "/admin/:path*",
    // Exclui /api para não invocar o proxy em pedidos a /api/auth/session e restantes APIs
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
