import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/app/(auth)/auth.config";

/**
 * Usa NextAuth com authConfig (sem Credentials provider, sem bcrypt-ts)
 * para que o middleware corra no Edge Runtime sem dependências Node.js.
 * O authConfig partilha o mesmo AUTH_SECRET que auth.ts — os JWTs são válidos em ambos.
 */
const { auth } = NextAuth(authConfig);

/**
 * Rotas que não requerem autenticação.
 * Manter esta lista sincronizada com novas rotas públicas.
 */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    // Auth pages
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    // NextAuth endpoints (signIn, signOut, session, CSRF, etc.)
    pathname.startsWith("/api/auth") ||
    // Health check (usado por DbWarmup e monitorização externa)
    pathname.startsWith("/api/health") ||
    // Páginas públicas de marketing / legal
    pathname.startsWith("/ajuda") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/design") ||
    pathname.startsWith("/comprimir-pdf") ||
    pathname.startsWith("/lp") ||
    // Página de erro de configuração (POSTGRES_URL / AUTH_SECRET em falta)
    pathname.startsWith("/config-required")
  );
}

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  if (!(isLoggedIn || isPublicPath(pathname))) {
    const loginUrl = new URL("/login", req.url);
    const safeCallback =
      pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
    loginUrl.searchParams.set("callbackUrl", safeCallback);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  /*
   * Aplica o middleware a todas as rotas excepto:
   * - Ficheiros estáticos do Next.js (_next/static, _next/image)
   * - Favicon e imagens na raiz
   */
  matcher: [
    String.raw`/((?!_next/static|_next/image|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)`,
  ],
};
