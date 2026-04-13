import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

// Em worktrees git, node_modules ficam no repo principal (3 níveis acima).
// Detectamos isso verificando se node_modules existe localmente.
const repoRoot = fs.existsSync(path.join(import.meta.dirname, "node_modules"))
  ? path.resolve(import.meta.dirname)
  : path.resolve(import.meta.dirname, "../../..");

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // React requer 'unsafe-eval' em dev para reconstrução de callstacks e HMR
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://vercel.live"
        : "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://vercel.live",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://vercel.live",
      "font-src 'self' https://fonts.gstatic.com https://vercel.live",
      "img-src 'self' data: blob: https://avatar.vercel.sh https://*.public.blob.vercel-storage.com https://*.supabase.co https://vercel.live https://vercel.com",
      "connect-src 'self' https://*.supabase.co https://*.vercel-storage.com https://cdn.jsdelivr.net https://vercel.com https://vercel.live wss://ws-us3.pusher.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  logging: {
    browserToTerminal: "error",
  },
  // Permite pedidos de 127.0.0.1 ao servidor dev (necessário para testes E2E com Playwright).
  // Next.js 15+ bloqueia cross-origin por defeito; 127.0.0.1 é usado como baseURL nos testes.
  ...(isDev && { allowedDevOrigins: ["127.0.0.1"] }),
  headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  experimental: {
    proxyClientMaxBodySize: "35mb",
    serverActions: {
      bodySizeLimit: "34mb",
    },
  },
  outputFileTracingIncludes: {
    "/api/chat": ["./lib/ai/modelos/*.txt"],
  },
  // OCR (PDF digitalizado): evita bundle de tesseract.js e @napi-rs/canvas
  serverExternalPackages: ["tesseract.js", "@napi-rs/canvas"],
  // Turbopack root: apontar para a raiz do repo (resolve node_modules em worktrees git).
  // Se node_modules não existe localmente, subimos até encontrar a raiz do repo principal.
  // outputFileTracingRoot deve ter o mesmo valor para evitar warnings no build.
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
