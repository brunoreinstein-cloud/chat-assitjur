import "server-only";

import { lead } from "@/lib/db/schema";
import { getDb } from "../connection";

// ─── Leads (LP) ───────────────────────────────────────────────────────────────

export async function saveLead(data: {
  name: string;
  email: string;
  phone?: string | null;
  area?: string | null;
}) {
  await getDb()
    .insert(lead)
    .values({
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      area: data.area ?? null,
    });
}
