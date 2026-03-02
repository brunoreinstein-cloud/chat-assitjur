# Base de conhecimento: barra lateral, pastas e Document Organizer

Proposta de melhoria da interface da Base de conhecimento: **migrar do modal para uma barra lateral** ao chat, com **organização por pastas** e conceito **Document Organizer** (“Save hours of manual filing by automatically extracting, organizing, and tracking every document that enters your business”). Alinhada às **Web Interface Guidelines** (Vercel).

---

## 1. Visão geral

| Hoje | Proposta |
|------|----------|
| Modal “Base de conhecimento” no header (botão livro) | **Barra lateral direita** ao chat, toggle no header ou atalho |
| Lista plana de documentos | **Árvore de pastas** + documentos por pasta |
| Seleção apenas por checkboxes no modal | Seleção na sidebar + indicador “X/20 para este chat” sempre visível |
| Upload/criar manual dentro do modal | Upload/criar na sidebar, com **destino por pasta** |
| Sem noção de “organização automática” | **Document Organizer**: extração automática, sugestão de pasta, rastreio (recentes, usados no chat) |

**Document Organizer** (valor): extrair metadados ao fazer upload, organizar em pastas (manual ou sugestão), e mostrar “últimos adicionados” / “usados neste chat” para localizar documentos mais rápido.

---

## 2. Layout proposto

```
┌─────────────────┬────────────────────────────────────┬──────────────────────────┐
│  AppSidebar     │  SidebarInset (chat)                │  KnowledgeSidebar (novo)  │
│  Histórico      │  Header | Messages | Input          │  Document Organizer      │
│  chats          │  + RevisorChecklist                │  Pastas | Docs | Upload  │
│  Novo chat      │                                     │  "X/20 para este chat"   │
└─────────────────┴────────────────────────────────────┴──────────────────────────┘
```

- **Desktop:** barra lateral direita colapsável (largura fixa, ex. 320px). Quando colapsada, só ícone ou fechada (como o Artifact).
- **Mobile:** Sheet/drawer que desliza da direita (como o Sheet já usado na sidebar esquerda em mobile).
- **Estado no URL (Web Interface Guidelines — Navigation & State):** `?knowledge=open` ou `?panel=knowledge` para barra aberta; permite deep-link e partilha.

---

## 3. Conteúdo da barra lateral (Knowledge Sidebar)

### 3.1 Estrutura

1. **Cabeçalho**
   - Título: “Base de conhecimento” ou “Document Organizer”.
   - Subtítulo opcional: “Extrair, organizar e usar documentos no chat.”
   - Botão fechar (aria-label, focus-visible).
   - Contador: “X/50 documentos para este chat” (tabular-nums, aria-live polite).

2. **Navegação por pastas**
   - Árvore de pastas (expandir/colapsar).
   - Item “Todas” ou “Raiz” para ver todos os documentos.
   - Clique numa pasta filtra a lista de documentos abaixo.
   - Estado da pasta selecionada no URL, ex.: `?knowledge=open&folder=uuid` (nuqs ou searchParams).

3. **Lista de documentos**
   - Da pasta atual (ou todos se “Raiz”).
   - Cada linha: checkbox (incluir no chat) + título (truncate, title com nome completo) + menu (mover para pasta, eliminar).
   - Empty state: “Nenhum documento nesta pasta. Envie ficheiros ou crie um abaixo.”
   - Listas longas: virtualização ou content-visibility (Guidelines — Performance, listas >50 itens).

4. **Upload e criar**
   - Zona de drop (drag-and-drop) com instruções claras.
   - “Ou criar manualmente”: título + conteúdo; destino = pasta atual (ou raiz).
   - Botão “Adicionar documento” (loading “A adicionar…” durante request).

5. **Document Organizer — tracking (opcional na v1)**
   - Secção “Recentes” (últimos N documentos adicionados).
   - Secção “Neste chat” (documentos já selecionados para o chat atual).
   - Ajuda a “rastrear” o que entra e o que está a ser usado.

### 3.2 Acessibilidade e Guidelines

- **Icon-only buttons:** `aria-label` em todos (abrir/fechar sidebar, novo documento, etc.).
- **Form controls:** cada input com `<Label htmlFor>` ou `aria-label`.
- **Focus:** `focus-visible:ring-2` em botões e links; nenhum `outline-none` sem substituição.
- **Async updates:** toasts e contador “X/20” com `aria-live="polite"`.
- **Semantic HTML:** `<nav>`, `<section>`, `<h2>` para cabeçalhos da sidebar; hierarquia h1–h2.
- **Long content:** títulos de documentos com `truncate` e `min-w-0`; tooltip com nome completo.
- **Empty states:** mensagens claras, sem UI partida para listas vazias.
- **Overscroll:** `overscroll-behavior: contain` na área scrollável da sidebar (Guidelines — Touch & Interaction).
- **Destructive actions:** eliminar documento ou pasta com confirmação (AlertDialog), nunca imediato (Guidelines — Anti-patterns).
- **Loading:** “A carregar…”, “A adicionar…” (reticências … conforme Typography).
- **Placeholders:** terminar com “…” e padrão de exemplo (Forms).

---

## 4. Organização por pastas (modelo e API)

- **Tabela `KnowledgeFolder`:** id, userId, parentId (nullable), name, createdAt.
- **`KnowledgeDocument`:** acrescentar `folderId` (nullable, FK → KnowledgeFolder).
- **APIs:**
  - `GET /api/knowledge/folders` — listar pastas do utilizador (árvore ou lista plana).
  - `POST /api/knowledge/folders` — criar pasta (name, parentId opcional).
  - `PATCH /api/knowledge/folders/:id` — renomear ou mover (parentId).
  - `DELETE /api/knowledge/folders/:id` — apagar pasta (documentos: folderId = null ou mover).
  - `GET /api/knowledge?folderId=xxx` — listar documentos (e opcionalmente subpastas).
  - `PATCH /api/knowledge/:id` — atualizar documento (incluindo folderId para mover).

Detalhes de schema e migrações em [docs/KNOWLEDGE-BASE-AT-E-PASTAS.md](KNOWLEDGE-BASE-AT-E-PASTAS.md).

---

## 5. Document Organizer — extração e organização automática

- **Extrair:** ao fazer upload (PDF, DOCX, etc.), já existe extração de texto; pode-se acrescentar extração de metadados (título sugerido, datas, entidades) para preencher título e, no futuro, sugerir pasta.
- **Organizar:** ao criar documento (upload ou manual), o utilizador escolhe a **pasta destino** (select ou breadcrumb na sidebar). Opcional: sugerir pasta com base em regras (ex.: “Teses” se o título contiver “TST”) ou ML.
- **Rastrear:** secções “Recentes” e “Neste chat” na sidebar para localizar rapidamente o que entrou e o que está em uso.

Frase de valor na UI: “Extraia, organize e use os seus documentos no chat — menos tempo a arquivar manualmente.”

---

## 6. Migração do modal para a sidebar

- **Remover:** botão “Base de conhecimento” que abre o Dialog atual no header; conteúdo do Dialog (lista, upload, criar manual) deixa de ser mostrado no modal.
- **Adicionar:**
  - Componente `KnowledgeSidebar` (ou `DocumentOrganizerSidebar`): barra lateral direita com pastas, lista, upload, criar e (opcional) Recentes/Neste chat.
  - No layout do chat: renderizar `KnowledgeSidebar` ao lado de `SidebarInset` quando `?knowledge=open` (ou estado equivalente). Toggle no header que define esse estado (e atualiza URL com nuqs).
  - Estado `knowledgeDocumentIds` e `setKnowledgeDocumentIds` continuam no Chat; a sidebar recebe-os como props e actualiza ao marcar/desmarcar documentos (como hoje, máx. 50).
- **Manter:** comportamento do @ no input (popover de documentos) e a API do chat (`knowledgeDocumentIds` no body); apenas a UI de seleção passa a ser na sidebar em vez do modal.

---

## 7. Fases de implementação sugeridas

| Fase | Entregável |
|------|------------|
| **1** | Barra lateral direita (sem pastas): mesmo conteúdo do modal atual (lista, upload, criar, seleção X/20), com estado no URL e alinhada às Guidelines. Remover modal. |
| **2** | Schema + API de pastas; UI de pastas na sidebar (árvore, filtrar documentos por pasta, escolher pasta ao criar). *(Implementado: tabela KnowledgeFolder, folderId em KnowledgeDocument, GET/POST/PATCH/DELETE pastas, GET docs ?folderId=, PATCH doc, UI Raiz + pastas + nova pasta, destino ao criar/upload.)* |
| **3** | Document Organizer: secções “Recentes” e “Neste chat”; copy e pequenos ajustes de extração (ex.: título sugerido no upload). *(Implementado: secção "Neste chat" com lista dos selecionados e X/20; secção "Recentes" com últimos 8; subtítulo/frase de valor no cabeçalho; toast do upload a referir título a partir do ficheiro e conteúdo extraído.)* |
| **4** | (Opcional) Sugestão automática de pasta a partir de conteúdo; virtualização da lista quando >50 itens. |

---

## 8. Ficheiros a criar ou alterar

- **Novos:** `components/knowledge-sidebar.tsx` (ou `document-organizer-sidebar.tsx`), `app/(chat)/api/knowledge/folders/route.ts`, migração Drizzle para `KnowledgeFolder` e `folderId`.
- **Alterar:** `app/(chat)/layout.tsx` ou página do chat para incluir a sidebar direita condicional; `components/chat-header.tsx` (trocar botão do modal por toggle da sidebar e remover Dialog da base de conhecimento); `lib/db/schema.ts`; `lib/db/queries.ts`; opcional `nuqs` para estado no URL.
- **Documentação:** atualizar `lib/ai/knowledge-base.md` e `AGENTS.md` com a nova UI (sidebar, pastas, Document Organizer).

---

## 9. Resumo

- **Interface:** Base de conhecimento migra do modal para uma **barra lateral direita** ao chat, com toggle no header e estado no URL.
- **Organização:** **Pastas** (árvore) para filtrar e organizar documentos; upload e criação com pasta de destino.
- **Document Organizer:** **Extrair** (já parcial), **organizar** (pastas + destino ao criar), **rastrear** (Recentes, Neste chat) — alinhado ao valor “Save hours of manual filing…”.
- **Guidelines:** a11y (aria, focus, semantic HTML), forms (labels, placeholders, loading), content (truncate, empty states), URL state, destructive confirmations, overscroll, copy com “…” e segunda pessoa.
