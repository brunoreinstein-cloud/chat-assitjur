import "server-only";

// Barrel re-export — all callers using `import { ... } from "@/lib/db/queries"` continue to work unchanged.

export * from "./queries/users";
export * from "./queries/chats";
export * from "./queries/messages";
export * from "./queries/documents";
export * from "./queries/knowledge";
export * from "./queries/files";
export * from "./queries/agents";
export * from "./queries/credits";
export * from "./queries/memory";
export * from "./queries/processos";
export * from "./queries/leads";

// Re-export DB infrastructure helpers used directly by some callers
export { ensureStatementTimeout, pingDatabase } from "./connection";
