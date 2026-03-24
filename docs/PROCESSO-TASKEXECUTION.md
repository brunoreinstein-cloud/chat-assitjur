# Processo & TaskExecution — Tracking de Chamados

Sistema de rastreio de processos trabalhistas e execuções de tarefas por IA.

---

## Visão geral

Cada **Processo** representa um chamado trabalhista (PI recebida, contestação a redigir, etc.). Cada vez que um agente é executado num processo (ex.: "Revisar Defesa", "Relatório Master"), cria-se um registo de **TaskExecution** para auditoria e reutilização.

---

## Schema: tabela `Processo`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID PK | Identificador único |
| `userId` | UUID FK → User | Dono do processo |
| `numeroAutos` | varchar(64) | Número CNJ: `0000000-00.0000.5.00.0000` |
| `titulo` | varchar(512) | Título amigável. Ex: "Ygor Silva x CBD S.A." |
| `reclamante` | varchar(256) | Nome do reclamante |
| `reclamada` | varchar(256) | Nome da reclamada |
| `vara` | varchar(256) | Vara trabalhista |
| `comarca` | varchar(128) | Comarca |
| `tribunal` | varchar(64) | Tribunal (ex.: TRT-2) |
| `rito` | varchar(32) | `ordinario` \| `sumarissimo` |
| `fase` | varchar(32) | Pipeline: `recebimento` \| `analise_risco` \| `estrategia` \| `elaboracao` \| `revisao` \| `protocolo` |
| `riscoGlobal` | varchar(16) | `provavel` \| `possivel` \| `remoto` |
| `valorCausa` | varchar(32) | Valor da causa |
| `provisao` | varchar(32) | Provisão contábil |
| `prazoFatal` | timestamp | Prazo fatal processual |
| `knowledgeDocumentIds` | JSON (`string[]`) | IDs de documentos KB associados (sem FK; órfãos filtrados na query) |
| `tipo` | varchar(32) | Tipo do doc principal: `pi` \| `contestacao` \| `processo_completo` |
| `blobUrl` | varchar(2048) | URL do PDF no Blob Storage (cache — evita re-upload por tarefa) |
| `parsedText` | text | Texto completo extraído do PDF (cache) |
| `totalPages` | integer | Total de páginas |
| `fileHash` | varchar(64) | SHA-256 do arquivo — deteta re-upload do mesmo PDF |
| `intakeMetadata` | JSON | Metadados estruturados do intake: `{ pedidos, teses, valores, ... }` |
| `intakeStatus` | varchar(16) | `processing` \| `ready` \| `error` \| null (sem intake) |
| `createdAt` | timestamp | Data de criação |

**Índices:** `(userId, createdAt)` para listagem; `(userId, fileHash)` para detecção de re-upload.

---

## Schema: tabela `TaskExecution`

Cada execução de agente num processo gera um registo aqui.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID PK | Identificador único |
| `processoId` | UUID FK → Processo | Processo associado |
| `taskId` | varchar(64) | Tarefa: `revisar-defesas`, `redator-contestacao`, `assistjur-master`, etc. |
| `chatId` | UUID | Chat gerado para esta execução (navegação de volta) |
| `status` | varchar(16) | `running` \| `complete` \| `error` |
| `result` | JSON (`TaskTelemetry`) | Métricas de qualidade (ver secção abaixo) |
| `documentsUrl` | JSON (`string[]`) | URLs dos documentos gerados (DOCX, PDF, etc.) |
| `creditsUsed` | integer | Créditos consumidos nesta execução |
| `startedAt` | timestamp | Início da execução |
| `completedAt` | timestamp | Fim da execução |

**Índice:** `(processoId, startedAt)` para listar execuções por processo (mais recente primeiro).

---

### TaskTelemetry — estrutura de `result`

Após a conclusão de cada execução de agente, `TaskExecution.result` é preenchido automaticamente com 8 métricas de qualidade (interface `TaskTelemetry` em `lib/ai/chat-agent.ts`):

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `latencyMs` | number | Latência total (ms) — do início do request ao fim do agente |
| `inputTokens` | number | Tokens de input (prompt) |
| `outputTokens` | number | Tokens de output (completion) |
| `totalTokens` | number | Total (input + output) |
| `stepsCount` | number | Número de steps do agente (tool steps + step final) |
| `toolsUsed` | string[] | Tools invocadas (sem duplicados, por ordem de chamada) |
| `finishReason` | string | Razão de paragem: `stop` \| `tool-calls` \| `length` \| `content-filter` \| `error` |
| `modelId` | string | Modelo utilizado (ex: `claude-sonnet-4-6`) |

**Quando é gravado:** no `onFinish` do `ToolLoopAgent`, apenas quando o chat está vinculado a um processo (`processoId` não nulo). O `TaskExecution.status` passa a `complete` e `completedAt` é preenchido.

---

## Schema: tabela `VerbaProcesso`

Verbas do processo com classificação de risco individual.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID PK | Identificador único |
| `processoId` | UUID FK → Processo | Processo associado |
| `verba` | varchar(256) | Nome da verba. Ex: "Horas extras", "FGTS + 40%" |
| `risco` | varchar(16) | `provavel` \| `possivel` \| `remoto` |
| `valorMin` | integer | Valor mínimo estimado (R$) |
| `valorMax` | integer | Valor máximo estimado (R$) |

---

## APIs disponíveis

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/processos` | Listar processos do utilizador |
| `POST` | `/api/processos` | Criar processo (com intake opcional) |
| `GET` | `/api/processos/[id]` | Detalhe do processo |
| `PATCH` | `/api/processos/[id]` | Atualizar campos do processo |
| `DELETE` | `/api/processos/[id]` | Apagar processo |
| `GET` | `/api/processos/[id]/tasks` | Listar execuções de tarefas |
| `POST` | `/api/processos/[id]/tasks` | Registar nova execução |

---

## Fluxo de intake (document-first)

1. Utilizador faz upload do PDF (PI, contestação ou processo completo) via `/api/processos`.
2. Sistema extrai texto (`parsedText`), conta páginas (`totalPages`) e calcula hash (`fileHash`).
3. `intakeStatus` passa a `processing` → `ready` (ou `error`).
4. Metadados estruturados ficam em `intakeMetadata` (pedidos, teses, valores extraídos).
5. `blobUrl` e `parsedText` ficam em cache — tarefas subsequentes reutilizam sem re-upload.

---

## Referência técnica

| Componente | Ficheiro |
|------------|---------|
| Schema Drizzle | `lib/db/schema.ts` — `processo`, `taskExecution`, `verbaProcesso`, `peca` |
| Queries | `lib/db/queries/processos.ts` — `getProcessoById`, `createTaskExecution`, `updateTaskExecution`, `getTaskExecutionByChatId`, `savePeca`, etc. |
| Server actions | `app/(chat)/processos/actions.ts` — `avancaFaseAction`, `setFaseAction`, `upsertRiscoVerbaAction`, `savePecaAction`, `setChatProcessoAction` |
| TaskTelemetry | `lib/ai/chat-agent.ts` — interface `TaskTelemetry`, parâmetro `onTelemetry` em `createChatAgent` |
| ProcessoSelector | `components/processo-selector.tsx` — dropdown no topbar do chat |
| Fases | `lib/constants/processo.ts` — `FASE_ORDER`, `nextFase()`, `FASE_LABEL` |
| RBAC | `lib/rbac/roles.ts`, `lib/rbac/guards.ts` — permissões `processo:update`, `verba:update`, `peca:create` |
| Migrações | `lib/db/migrations/0030_pecas.sql`, `0031_user_role.sql` |
