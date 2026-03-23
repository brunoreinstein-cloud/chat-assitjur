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

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    proxyClientMaxBodySize: "22mb",
    serverActions: {
      bodySizeLimit: "21mb",
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
