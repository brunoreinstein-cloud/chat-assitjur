export function updateUrlRemoveKnowledge(base = "/chat") {
  if (globalThis.window === undefined) {
    return;
  }
  const params = new URLSearchParams(globalThis.window.location.search);
  params.delete("knowledge");
  params.delete("folder");
  const q = params.toString();
  globalThis.window.history.replaceState(null, "", q ? `${base}?${q}` : base);
}

export function updateUrlForKnowledgeOpen(base = "/chat") {
  if (globalThis.window === undefined) {
    return;
  }
  const params = new URLSearchParams(globalThis.window.location.search);
  params.set("knowledge", "open");
  globalThis.window.history.replaceState(
    null,
    "",
    `${base}?${params.toString()}`
  );
}
