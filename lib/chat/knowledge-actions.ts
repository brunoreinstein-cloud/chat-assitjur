export async function saveReplyToKnowledge(
  title: string,
  content: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const res = await fetch("/api/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      error: data?.message ?? "Erro ao guardar em conhecimento.",
    };
  }
  const created = (await res.json()) as { id: string; title: string };
  return { ok: true, id: created.id };
}
