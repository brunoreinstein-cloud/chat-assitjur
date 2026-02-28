import { NextResponse } from "next/server";

/**
 * Diagnóstico: indica se BLOB_READ_WRITE_TOKEN está definido em produção.
 * Não requer auth. Abre em produção: https://teu-dominio.vercel.app/api/files/blob-status
 */
export function GET(): NextResponse {
  const configured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  return NextResponse.json({
    blobConfigured: configured,
    message: configured
      ? "BLOB_READ_WRITE_TOKEN está definido."
      : "BLOB_READ_WRITE_TOKEN não está definido. Vercel → Settings → Environment Variables → Production.",
  });
}
