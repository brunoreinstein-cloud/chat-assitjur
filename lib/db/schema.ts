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
  /** Hash de palavra-passe (bcrypt ~60 chars; argon2 até ~95). text evita truncação silenciosa ao mudar de algoritmo. */
  password: text("password"),
});

export type User = InferSelectModel<typeof user>;

/**
 * Processos trabalhistas: registo de cada processo associado ao utilizador.
 * Permite gerir risco, verbas e fase do pipeline (Recebimento → Protocolo).
 */
export const processo = pgTable(
  "Processo",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Número do processo no formato CNJ: 0000000-00.0000.5.00.0000 */
    numeroAutos: varchar("numeroAutos", { length: 64 }).notNull(),
    reclamante: varchar("reclamante", { length: 256 }).notNull(),
    reclamada: varchar("reclamada", { length: 256 }).notNull(),
    vara: varchar("vara", { length: 256 }),
    comarca: varchar("comarca", { length: 128 }),
    tribunal: varchar("tribunal", { length: 64 }),
    /** ordinario | sumarissimo */
    rito: varchar("rito", { length: 32 }),
    /** Fase atual do pipeline: recebimento | analise_risco | estrategia | elaboracao | revisao | protocolo */
    fase: varchar("fase", { length: 32 }),
    /** Classificação global de risco: provavel | possivel | remoto */
    riscoGlobal: varchar("riscoGlobal", { length: 16 }),
    valorCausa: varchar("valorCausa", { length: 32 }),
    provisao: varchar("provisao", { length: 32 }),
    prazoFatal: timestamp("prazoFatal"),
    /** IDs de documentos KB associados ao processo (sem FK; IDs órfãos filtrados na query). */
    knowledgeDocumentIds: json("knowledgeDocumentIds")
      .$type<string[]>()
      .default([]),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    userIdCreatedAtIdx: index("Processo_userId_createdAt_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type Processo = InferSelectModel<typeof processo>;

/** Verbas do processo com classificação de risco individual. */
export const verbaProcesso = pgTable("VerbaProcesso", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  processoId: uuid("processoId")
    .notNull()
    .references(() => processo.id, { onDelete: "cascade" }),
  verba: varchar("verba", { length: 256 }).notNull(),
  /** provavel | possivel | remoto */
  risco: varchar("risco", { length: 16 }).notNull(),
  valorMin: integer("valorMin"),
  valorMax: integer("valorMax"),
});

export type VerbaProcesso = InferSelectModel<typeof verbaProcesso>;

export const chat = pgTable(
  "Chat",
  {
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
    /** Agente do chat: built-in (revisor-defesas, redator-contestacao) ou UUID de agente personalizado. Default revisor-defesas. */
    agentId: varchar("agentId", { length: 64 }).default("revisor-defesas"),
    /** Processo associado a este chat (opcional). SET NULL ao apagar o processo. */
    processoId: uuid("processoId").references(() => processo.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    /** GET /api/history: listar chats por userId ordenados por createdAt DESC. */
    userIdCreatedAtIdx: index("Chat_userId_createdAt_idx").on(
      table.userId,
      table.createdAt
    ),
    /** Queries por agente (ex.: apagar agente custom → listar chats que o usam). */
    agentIdIdx: index("Chat_agentId_idx").on(table.agentId),
  })
);

export type Chat = InferSelectModel<typeof chat>;

// ─── DEPRECATED — não usar em código novo; migrar para Message_v2 (parts/attachments) ───
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
// ─────────────────────────────────────────────────────────────────────────────────────

export const message = pgTable(
  "Message_v2",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    role: varchar("role").notNull(),
    parts: json("parts").notNull(),
    attachments: json("attachments").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    chatIdCreatedAtIdx: index("Message_v2_chatId_createdAt_idx").on(
      table.chatId,
      table.createdAt
    ),
    /** getMessageCountByUserId: filtro por role e createdAt após join com Chat. */
    chatIdRoleCreatedAtIdx: index("Message_v2_chatId_role_createdAt_idx").on(
      table.chatId,
      table.role,
      table.createdAt
    ),
  })
);

export type DBMessage = InferSelectModel<typeof message>;

// ─── DEPRECATED — associado ao Message antigo; migrar para Vote_v2 ───────────────────
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
// ─────────────────────────────────────────────────────────────────────────────────────

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
    /** Nome da coluna no Postgres deve ser "kind" (não "text") para queries SQL manuais. */
    kind: varchar("kind", { enum: ["text", "code", "image", "sheet"] })
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

/** Estado da indexação RAG: pending (só guardado), indexed (chunks indexados), failed (erro ao vetorizar). */
export const INDEXING_STATUS = ["pending", "indexed", "failed"] as const;
export type IndexingStatus = (typeof INDEXING_STATUS)[number];

/** Base de conhecimento: documentos que podem ser usados como contexto no chat (RAG ou injeção direta). */
export const knowledgeDocument = pgTable(
  "KnowledgeDocument",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    folderId: uuid("folderId").references(() => knowledgeFolder.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 512 }).notNull(),
    content: text("content").notNull(),
    /** pending = só guardado (job/endpoint vetoriza depois); indexed = chunks disponíveis; failed = erro ao vetorizar. */
    indexingStatus: varchar("indexingStatus", { length: 32 })
      .notNull()
      .default("indexed"),
    /** Resumo estruturado extraído por IA para PI e Contestação (markdown, ~8-12k chars). Null para outros tipos. */
    structuredSummary: text("structuredSummary"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    /** GET /api/knowledge, seletor @, formulário de agentes: listar por userId. */
    userIdIdx: index("KnowledgeDocument_userId_idx").on(table.userId),
    userIdFolderIdx: index("KnowledgeDocument_userId_folderId_idx").on(
      table.userId,
      table.folderId
    ),
  })
);

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
    /** Listar chunks por documento, reindexação parcial, apagar por documento. */
    documentIdChunkIndexIdx: index(
      "KnowledgeChunk_documentId_chunkIndex_idx"
    ).on(table.knowledgeDocumentId, table.chunkIndex),
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
 * Nota: knowledgeDocumentIds não tem FK; documentos apagados deixam IDs órfãos (getKnowledgeDocumentsByIds filtra inexistentes).
 */
export const customAgent = pgTable("CustomAgent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 256 }).notNull(),
  instructions: text("instructions").notNull(),
  /** Id do agente base (revisor-defesas | redator-contestacao); se definido, usa as tools desse agente. */
  baseAgentId: varchar("baseAgentId", { length: 64 }),
  /** IDs de documentos da base de conhecimento associados ao agente (máx. 50); usados ao selecionar o agente no chat. */
  knowledgeDocumentIds: json("knowledgeDocumentIds")
    .$type<string[]>()
    .default([]),
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
 * Limite: integer ~2.1e9; se a granularidade mudar (ex.: 1 crédito = 1 token), considerar bigint.
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
export const llmUsageRecord = pgTable(
  "LlmUsageRecord",
  {
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
  },
  (table) => ({
    userIdCreatedAtIdx: index("LlmUsageRecord_userId_createdAt_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type LlmUsageRecord = InferSelectModel<typeof llmUsageRecord>;

/**
 * Memórias persistentes por utilizador: pares chave-valor para contexto entre sessões.
 * Permite que os agentes "lembrem" dados do cliente, processo, preferências do advogado, etc.
 */
export const userMemory = pgTable(
  "UserMemory",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Chave única por utilizador (ex.: "cliente_principal", "processo_atual"). */
    key: varchar("key", { length: 256 }).notNull(),
    /** Valor associado (texto livre ou JSON serializado). */
    value: text("value").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    /** Expiração opcional; null = memória permanente. */
    expiresAt: timestamp("expiresAt"),
  },
  (table) => ({
    /** Listar memórias por utilizador. */
    userIdIdx: index("UserMemory_userId_idx").on(table.userId),
    /** Upsert por (userId, key). */
    userIdKeyIdx: index("UserMemory_userId_key_idx").on(
      table.userId,
      table.key
    ),
  })
);

export type UserMemory = InferSelectModel<typeof userMemory>;
