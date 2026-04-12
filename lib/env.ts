/**
 * Validação de variáveis de ambiente ao boot do servidor.
 * Falha imediatamente com mensagem clara se uma variável obrigatória estiver em falta.
 *
 * Importado em instrumentation.ts (corre no boot do Node.js, antes de qualquer request).
 * Nunca importar diretamente em código cliente — o ficheiro usa `server-only`.
 */
import "server-only";
import { z } from "zod";

const envSchema = z.object({
  AUTH_SECRET: z
    .string()
    .min(
      32,
      "AUTH_SECRET deve ter pelo menos 32 caracteres. Gerar: openssl rand -base64 32"
    ),

  POSTGRES_URL: z
    .string()
    .url(
      "POSTGRES_URL deve ser uma URL válida (ex.: postgresql://user:pass@host:6543/db)"
    ),

  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),

  AUTH_URL: z.string().url().optional(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().optional(),

  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  AI_GATEWAY_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  ADMIN_CREDITS_SECRET: z.string().optional(),

  REDIS_URL: z.string().optional(),

  PROMPT_CACHING_ENABLED: z.enum(["true", "false"]).optional().default("true"),
  PROMPT_CACHING_TTL: z.enum(["5m", "1h"]).optional(),

  DISABLE_CREDITS: z.enum(["true", "false"]).optional(),
  DEBUG_CHAT: z.enum(["true", "false"]).optional(),

  RAG_MIN_SIMILARITY: z
    .string()
    .regex(
      /^0(\.\d+)?$|^1(\.0+)?$/,
      "RAG_MIN_SIMILARITY deve ser um número entre 0 e 1"
    )
    .optional(),

  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().url().optional(),

  MCP_GMAIL_URL: z.string().url().optional(),
  MCP_GMAIL_TOKEN: z.string().optional(),
  MCP_GDRIVE_URL: z.string().url().optional(),
  MCP_GDRIVE_TOKEN: z.string().optional(),
  MCP_NOTION_URL: z.string().url().optional(),
  MCP_NOTION_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `[env] Variáveis de ambiente inválidas ou em falta:\n${formatted}\n\nVerifica o ficheiro .env.local (dev) ou as variáveis na Vercel (produção).`
  );
}

export const env = parsed.data;
