/**
 * GET /api/storage/download?url={encodedUrl}
 *
 * Endpoint autenticado para acesso a ficheiros no Supabase Storage ou Vercel Blob.
 * Gera um URL assinado de curta duração (2 horas) para ficheiros Supabase e
 * redireciona; para Vercel Blob redireciona directamente.
 *
 * Validações:
 *  - Autenticação obrigatória (NextAuth session).
 *  - Para ficheiros Supabase: o pathname DEVE começar com o userId da sessão
 *    (formato {userId}/{...}), prevenindo acesso a ficheiros de outros utilizadores (IDOR).
 *  - Allowlist de hosts para prevenir SSRF.
 *
 * Para que os signed URLs efectivamente restrinjam o acesso, o bucket Supabase
 * DEVE estar privado: Dashboard → Storage → [bucket] → desactivar "Public".
 */

import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import {
  generateSignedUrl,
  parseSupabaseStorageUrl,
} from "@/lib/supabase/server";

const VERCEL_BLOB_SUFFIX = "blob.vercel-storage.com";
const SIGNED_URL_TTL = 7200; // 2 horas em segundos

/** Verifica se o URL pertence a um host de storage autorizado. */
function isAllowedStorageHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  // Vercel Blob
  if (host === VERCEL_BLOB_SUFFIX || host.endsWith(`.${VERCEL_BLOB_SUFFIX}`)) {
    return true;
  }
  // Supabase Storage (valida contra o URL do projecto configurado)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const supabaseHost = new URL(supabaseUrl).hostname;
      if (host === supabaseHost) {
        return true;
      }
    } catch {
      /* ignorar URL Supabase malformado */
    }
  }
  return false;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl || rawUrl.trim().length === 0) {
    return NextResponse.json(
      { error: "Parâmetro url é obrigatório." },
      { status: 400 }
    );
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(decodeURIComponent(rawUrl.trim()));
  } catch {
    return NextResponse.json({ error: "URL inválido." }, { status: 400 });
  }

  if (targetUrl.protocol !== "https:") {
    return NextResponse.json(
      { error: "Apenas URLs HTTPS são permitidos." },
      { status: 400 }
    );
  }

  if (!isAllowedStorageHost(targetUrl)) {
    return NextResponse.json(
      { error: "Host de storage não autorizado." },
      { status: 403 }
    );
  }

  // ── Supabase Storage ──────────────────────────────────────────────────────
  const supabaseParsed = parseSupabaseStorageUrl(targetUrl.toString());
  if (supabaseParsed) {
    const { bucket, pathname } = supabaseParsed;
    const userId = session.user.id;

    // Validação de ownership: pathname deve começar com o userId do utilizador autenticado.
    // Formato dos uploads: {userId}/{timestamp}-{filename}
    if (!pathname.startsWith(`${userId}/`)) {
      return NextResponse.json(
        { error: "Acesso negado a este ficheiro." },
        { status: 403 }
      );
    }

    const signedUrl = await generateSignedUrl(pathname, bucket, SIGNED_URL_TTL);
    if (!signedUrl) {
      // Supabase não configurado ou erro ao gerar — fallback para URL original
      return NextResponse.redirect(targetUrl.toString(), { status: 302 });
    }

    return NextResponse.redirect(signedUrl, { status: 302 });
  }

  // ── Vercel Blob ───────────────────────────────────────────────────────────
  // Vercel Blob é sempre público; o redirect é protegido pela auth acima.
  return NextResponse.redirect(targetUrl.toString(), { status: 302 });
}
