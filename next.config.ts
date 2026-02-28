import path from "node:path";
import type { NextConfig } from "next";

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    outputFileTracingIncludes: {
      "/api/chat": ["./lib/ai/modelos/*.txt"],
    },
    proxyClientMaxBodySize: "22mb",
    serverActions: {
      bodySizeLimit: "21mb",
    },
  },
  // OCR (PDF digitalizado): evita bundle de tesseract.js e @napi-rs/canvas
  serverExternalPackages: ["tesseract.js", "@napi-rs/canvas"],
  // Raiz absoluta evita aviso de múltiplos lockfiles e funciona na Vercel
  turbopack: { root: path.resolve(process.cwd()) },
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
