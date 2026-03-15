"use server";

import { z } from "zod";
import { saveLead } from "@/lib/db/queries";

const leadSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(256),
  email: z.string().email("Email inválido").max(256),
  phone: z.string().max(32).optional(),
  area: z.string().max(128).optional(),
});

export interface LeadActionResult {
  success: boolean;
  error?: string;
}

export async function submitLead(
  _prev: LeadActionResult,
  formData: FormData
): Promise<LeadActionResult> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    area: formData.get("area") || undefined,
  };

  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  try {
    await saveLead({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      area: parsed.data.area,
    });

    return { success: true };
  } catch {
    return {
      success: false,
      error: "Erro ao salvar. Tente novamente em instantes.",
    };
  }
}
