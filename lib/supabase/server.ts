import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/supabase-types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Cliente Supabase para uso no servidor (API routes, Server Components, server actions).
 * Usa a service role key; ignora RLS. Use apenas no backend.
 * Só existe se as variáveis estiverem definidas.
 */
export function getSupabaseServerClient() {
  if (!(supabaseUrl && supabaseServiceRoleKey)) {
    return null;
  }
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Gera um URL assinado (signed URL) para um ficheiro no Supabase Storage.
 * Apenas funciona como restrição de acesso quando o bucket estiver privado.
 * Para tornar o bucket privado: Supabase Dashboard → Storage → [bucket] → desactivar "Public".
 *
 * @param pathname  Caminho do ficheiro no bucket (ex: "userId/timestamp-file.pdf").
 * @param bucket    Nome do bucket (default: env SUPABASE_STORAGE_BUCKET ou "chat-files").
 * @param expiresIn Duração em segundos (default: 7200 = 2 horas).
 * @returns URL assinado ou null se o cliente não estiver configurado.
 */
export async function generateSignedUrl(
  pathname: string,
  bucket?: string,
  expiresIn = 7200
): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return null;
  }
  const bucketName =
    bucket ?? process.env.SUPABASE_STORAGE_BUCKET ?? "chat-files";
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(pathname, expiresIn);
  if (error || !data) {
    return null;
  }
  return data.signedUrl;
}

/**
 * Transfere um ficheiro do Supabase Storage usando a service role key.
 * Funciona independentemente de o bucket ser público ou privado.
 * Usar no servidor em vez de fetch(publicUrl) para evitar dependência de URLs públicos.
 *
 * @param pathname  Caminho do ficheiro no bucket.
 * @param bucket    Nome do bucket (default: env SUPABASE_STORAGE_BUCKET ou "chat-files").
 * @returns ArrayBuffer do ficheiro ou null se falhar / cliente não configurado.
 */
export async function downloadFromStorage(
  pathname: string,
  bucket?: string
): Promise<ArrayBuffer | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return null;
  }
  const bucketName =
    bucket ?? process.env.SUPABASE_STORAGE_BUCKET ?? "chat-files";
  const { data, error } = await supabase.storage
    .from(bucketName)
    .download(pathname);
  if (error || !data) {
    return null;
  }
  return data.arrayBuffer();
}

/**
 * Extrai o pathname do ficheiro a partir de um URL do Supabase Storage.
 * Suporta URLs públicos e assinados:
 *   public:  https://xxx.supabase.co/storage/v1/object/public/{bucket}/{pathname}
 *   signed:  https://xxx.supabase.co/storage/v1/object/sign/{bucket}/{pathname}?token=...
 *
 * @returns { bucket, pathname } ou null se o URL não for do Supabase Storage.
 */
export function parseSupabaseStorageUrl(
  url: string
): { bucket: string; pathname: string } | null {
  try {
    const u = new URL(url);
    const projectUrl = supabaseUrl ? new URL(supabaseUrl) : null;
    if (projectUrl && u.hostname !== projectUrl.hostname) {
      return null;
    }
    const match =
      /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/.exec(
        u.pathname
      );
    if (!(match?.[1] && match?.[2])) {
      return null;
    }
    return {
      bucket: match[1],
      pathname: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}
