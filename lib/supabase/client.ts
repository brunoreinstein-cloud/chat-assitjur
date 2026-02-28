"use client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/supabase-types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Cliente Supabase para uso no browser (componentes cliente).
 * Usa a chave anon; RLS aplica-se. Só existe se as variáveis estiverem definidas.
 */
export function getSupabaseBrowserClient() {
	if (!supabaseUrl || !supabaseAnonKey) {
		return null;
	}
	return createClient<Database>(supabaseUrl, supabaseAnonKey);
}
