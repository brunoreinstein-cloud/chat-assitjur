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
