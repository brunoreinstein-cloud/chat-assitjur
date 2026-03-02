import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

/** Tabela de utilizadores. No Postgres existe como public."User" (nome entre aspas = case-sensitive). */
export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  /** ID do stream ativo no Redis (resumable-stream); limpo em onFinish. Usado pelo GET /api/chat/[id]/stream para retomar. */
  activeStreamId: text("activeStreamId"),
  /** Agente do chat: built-in (revisor-defesas, analise-contratos, redator-contestacao) ou UUID de agente personalizado. Default revisor-defesas. */
  agentId: varchar("agentId", { length: 64 }).default("revisor-defesas"),
});

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chatbot.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chatbot.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

/** Pastas da base de conhecimento (organização por utilizador; hierarquia opcional). */
export const knowledgeFolder = pgTable(
  "KnowledgeFolder",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    parentId: uuid("parentId"),
    name: varchar("name", { length: 256 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    parentFk: foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "KnowledgeFolder_parentId_fk",
    }),
  })
);

export type KnowledgeFolder = InferSelectModel<typeof knowledgeFolder>;

/** Base de conhecimento: documentos que podem ser usados como contexto no chat (RAG ou injeção direta). */
export const knowledgeDocument = pgTable("KnowledgeDocument", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  folderId: uuid("folderId").references(() => knowledgeFolder.id, {
    onDelete: "set null",
  }),
  title: varchar("title", { length: 512 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type KnowledgeDocument = InferSelectModel<typeof knowledgeDocument>;

/** Chunks da base de conhecimento para RAG: texto + embedding para busca por similaridade. */
export const knowledgeChunk = pgTable(
  "KnowledgeChunk",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    knowledgeDocumentId: uuid("knowledgeDocumentId")
      .notNull()
      .references(() => knowledgeDocument.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunkIndex").notNull(),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    embeddingHnswIdx: index("KnowledgeChunk_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  })
);

export type KnowledgeChunk = InferSelectModel<typeof knowledgeChunk>;

/**
 * Arquivos: biblioteca de ficheiros do utilizador (referências ao Storage).
 * Permite "Guardar em Arquivos" a partir do chat e depois "Adicionar à base de conhecimento".
 */
export const userFile = pgTable("UserFile", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  pathname: varchar("pathname", { length: 1024 }).notNull(),
  /** URL pública para obter o ficheiro (Supabase public URL ou Blob); usada ao converter em conhecimento. */
  url: varchar("url", { length: 2048 }).notNull(),
  filename: varchar("filename", { length: 512 }).notNull(),
  contentType: varchar("contentType", { length: 128 }).notNull(),
  /** Texto extraído em cache; evita re-extração ao converter em conhecimento. */
  extractedTextCache: text("extractedTextCache"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type UserFile = InferSelectModel<typeof userFile>;

/**
 * Agentes personalizados criados pelo utilizador (AGENTES-IA-PERSONALIZADOS).
 * Instruções próprias; opcionalmente herdam tools de um agente base (ex.: revisor-defesas).
 */
export const customAgent = pgTable("CustomAgent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 256 }).notNull(),
  instructions: text("instructions").notNull(),
  /** Id do agente base (revisor-defesas | analise-contratos | redator-contestacao); se definido, usa as tools desse agente. */
  baseAgentId: varchar("baseAgentId", { length: 64 }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type CustomAgent = InferSelectModel<typeof customAgent>;

/**
 * Overrides de agentes built-in editados pelo admin (painel administrativo).
 * Só instruções e label; useRevisorDefesaTools e allowedModelIds vêm do código.
 */
export const builtInAgentOverride = pgTable("BuiltInAgentOverride", {
  agentId: varchar("agentId", { length: 64 }).primaryKey(),
  instructions: text("instructions"),
  label: varchar("label", { length: 256 }),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type BuiltInAgentOverride = InferSelectModel<
  typeof builtInAgentOverride
>;

/**
 * Saldo de créditos por utilizador (consumo de LLM).
 * 1 crédito = 1000 tokens (input+output). Ver docs/SPEC-CREDITOS-LLM.md.
 */
export const userCreditBalance = pgTable("UserCreditBalance", {
  userId: uuid("userId")
    .primaryKey()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type UserCreditBalance = InferSelectModel<typeof userCreditBalance>;

/**
 * Registo de uso de LLM por pedido (auditoria e transparência).
 */
export const llmUsageRecord = pgTable("LlmUsageRecord", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  chatId: uuid("chatId").references(() => chat.id, { onDelete: "set null" }),
  promptTokens: integer("promptTokens").notNull(),
  completionTokens: integer("completionTokens").notNull(),
  model: varchar("model", { length: 128 }),
  creditsConsumed: integer("creditsConsumed").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type LlmUsageRecord = InferSelectModel<typeof llmUsageRecord>;
