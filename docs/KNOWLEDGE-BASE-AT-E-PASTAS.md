# Base de conhecimento: @ para documentos e estrutura de pastas

Este documento descreve duas evoluções possíveis para a Base de conhecimento: **(1)** usar `@` no input do chat para referenciar documentos e **(2)** organizar documentos em pastas.

---

## 1. @ para chamar documento

### Objetivo

Permitir que o utilizador escreva `@` na caixa de mensagem e escolha um documento da base de conhecimento para incluir no contexto do chat (sem abrir o modal). O documento é adicionado a `knowledgeDocumentIds` e o texto `@Título do documento` pode ser inserido na mensagem para o utilizador e para o modelo.

### Fluxo

1. Utilizador digita `@` no input.
2. Abre um popover com a lista de documentos (título); lista filtrada pelo texto digitado após `@` (ex.: `@banco` → documentos cujo título contenha "banco").
3. Ao selecionar um documento:
   - O id do documento é adicionado a `knowledgeDocumentIds` (máx. 50, sem duplicar).
   - O texto desde o `@` até à posição do cursor é substituído por `@Título do documento `.
   - O popover fecha.

### Implementação (resumo)

- **Frontend:** No `MultimodalInput`, ao detetar `@` no texto (e.g. pelo último `@` antes do cursor), mostrar um popover com documentos obtidos por `GET /api/knowledge`. Filtrar no cliente por `atQuery` (texto após `@`). Ao escolher um item, chamar `setKnowledgeDocumentIds` e atualizar o valor do input (substituir `@` + query por `@` + título).
- **Backend:** Sem alterações. Continua a usar `knowledgeDocumentIds` no body do `POST /api/chat` e a injetar o conteúdo no system prompt.
- **Opcional:** Campo `slug` em `KnowledgeDocument` (ex.: `bancodetese`) para permitir `@bancodetese` em vez de só buscar por título. Exige migração e API para criar/editar slug.

### Ficheiros envolvidos

- `components/multimodal-input.tsx` — deteção de `@`, popover, filtro, atualização de `knowledgeDocumentIds` e do texto.
- `components/chat.tsx` — passar `setKnowledgeDocumentIds` ao `MultimodalInput`.
- Opcional: `lib/db/schema.ts` + migração para `slug`; `app/(chat)/api/knowledge/route.ts` para devolver slug e permitir busca por slug.

---

## 2. Estrutura de pastas para a Base de conhecimento

### Objetivo

Organizar documentos em pastas (ex.: "Teses", "Precedentes", "Modelos de cláusulas") para facilitar a escolha no modal e, no futuro, partilha ou permissões por pasta.

### Modelo de dados (proposta)

- **Nova tabela:** `KnowledgeFolder`
  - `id` (UUID, PK)
  - `userId` (UUID, FK → user)
  - `parentId` (UUID, nullable, FK → KnowledgeFolder) — para pastas aninhadas
  - `name` (varchar 256)
  - `createdAt` (timestamp)

- **Alteração em `KnowledgeDocument`:**
  - `folderId` (UUID, nullable, FK → KnowledgeFolder). Se null, o documento fica "na raiz".

### API (proposta)

- `GET /api/knowledge/folders` — listar pastas do utilizador (árvore ou lista plana com `parentId`).
- `POST /api/knowledge/folders` — criar pasta (`name`, `parentId` opcional).
- `PATCH /api/knowledge/folders/:id` — renomear ou mover (alterar `parentId`).
- `DELETE /api/knowledge/folders/:id` — apagar pasta (documentos podem ficar com `folderId = null` ou serem movidos).
- `GET /api/knowledge?folderId=xxx` — listar documentos do utilizador filtrados por pasta (e opcionalmente subpastas).
- `PATCH /api/knowledge/:id` (ou PUT) — atualizar documento, incluindo `folderId` (mover para outra pasta).

### UI (proposta)

- No modal "Base de conhecimento":
  - Navegação por pastas (breadcrumb ou árvore lateral).
  - Lista de documentos da pasta atual (e opcionalmente subpastas).
  - Ao criar documento (manual ou por upload), permitir escolher pasta (select ou breadcrumb).
- Manter limite de 50 documentos selecionados para o chat; a pasta serve só para organização e listagem.

### Migrações

1. Criar tabela `KnowledgeFolder`.
2. Adicionar coluna `folderId` a `KnowledgeDocument`.
3. (Opcional) Índices em `folderId` e `userId` para listagens rápidas.

---

## Ordem sugerida

1. **Primeiro:** Implementar **@ no input** (sem alterações de schema). Melhora imediata da UX para "chamar" um documento sem abrir o modal.
2. **Depois:** Implementar **pastas** (schema + API + UI) quando houver muitos documentos e necessidade de organização.
