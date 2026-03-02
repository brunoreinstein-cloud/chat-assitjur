# Revisão UX/UI — Base de conhecimento (muitos arquivos)

Revisão da interface da Base de conhecimento quando há **muitos documentos**: organização, exclusão, renomear, mover e escalabilidade.

---

## 1. Estado atual

| Aspecto | Hoje | Problema com muitos arquivos |
|--------|------|------------------------------|
| **Lista de documentos** | Checkbox + título + data por linha | Sem ações por documento; difícil gerir dezenas de itens. |
| **Renomear** | Não existe na UI | Utilizador não pode corrigir títulos (ex.: extraídos do nome do ficheiro). |
| **Excluir** | Não existe na UI | Não há forma de remover documentos da base pela sidebar. |
| **Mover para pasta** | Só ao criar/upload (destino = pasta atual) | Não é possível reorganizar documentos já existentes. |
| **Pastas** | Raiz + lista de pastas; criar pasta | Não é possível renomear ou eliminar pastas na UI. |
| **Seleção em massa** | Checkbox por doc + «Selecionar todos» / «Desmarcar todos»; barra com Mover e Eliminar | Implementado em `knowledge-sidebar.tsx`. |
| **Ordenação / filtro** | Apenas pesquisa por título | Sem ordenação (data, nome); lista longa sem paginação/virtualização. |
| **Recentes / Neste chat** | Secções fixas (8 recentes, lista “Neste chat”) | Útil; com muitos docs a lista da pasta pode ficar longa. |

**APIs já existentes (não usadas na UI):**

- `PATCH /api/knowledge/[id]` — atualizar documento (title, content, folderId).
- `DELETE /api/knowledge?id=...` — eliminar documento.
- `PATCH /api/knowledge/folders/[id]` — renomear ou mover pasta.
- `DELETE /api/knowledge/folders/[id]` — eliminar pasta.

---

## 2. Propostas de melhoria

### 2.1 Ações por documento (prioridade alta)

- **Menu de contexto** (ícone ⋮ ou dropdown) em cada linha da lista:
  - **Renomear** — abre diálogo (ou inline edit) com o título atual; ao guardar, `PATCH /api/knowledge/[id]` com `{ title }`.
  - **Mover para pasta** — submenu ou dropdown com lista de pastas (incl. “Raiz”); ao escolher, `PATCH` com `{ folderId }`.
  - **Eliminar** — abre **AlertDialog** de confirmação (“Eliminar documento «X»? Esta ação não pode ser desfeita.”); ao confirmar, `DELETE /api/knowledge?id=...` e remover o id de `knowledgeDocumentIds` se estiver selecionado.
- Acessibilidade: botão do menu com `aria-label="Abrir ações do documento"`, itens com labels claros; confirmação destrutiva obrigatória.

### 2.2 Ações por pasta (prioridade média)

- No botão da pasta (ou menu ao lado do nome):
  - **Renomear pasta** — diálogo com nome atual; `PATCH /api/knowledge/folders/[id]` com `{ name }`.
  - **Eliminar pasta** — AlertDialog: “Eliminar pasta «X»? Os documentos passam para a Raiz.”; `DELETE /api/knowledge/folders/[id]`.
- Evitar eliminar sem confirmação (Guidelines — destructive actions).

### 2.3 Organização e listagem (muitos arquivos)

- **Ordenação:** dropdown ou toggles “Mais recentes” / “Título A–Z” (se a API passar a suportar `?sort=createdAt|title`).
- **Lista longa:** com 50+ itens na pasta, considerar:
  - **Virtualização** (ex.: `react-virtual` ou content-visibility) para manter performance;
  - Ou **paginação** (ex.: 20 por página) se a API suportar `?offset=&limit=`.
- **Contador:** “X documentos nesta pasta” no cabeçalho da secção para dar noção de volume.
- **Seleção em massa:** “Selecionar todos nesta pasta” / “Desmarcar todos” para o uso “Neste chat”.

### 2.4 Revisão de conteúdo (prioridade média/baixa)

- **Pré-visualizar / editar conteúdo:** link ou botão “Ver conteúdo” que abre um modal/drawer com o texto do documento (só leitura ou editável). Se editável, ao guardar `PATCH` com `{ content }` (e eventualmente re-indexar chunks RAG).
- Pode ser uma página dedicada `/base-de-conhecimento/[id]` em vez de modal.

### 2.5 Consistência e copy

- **Eliminar** em vez de “Remover” ou “Apagar” (escolher um termo e usar em documento e pasta).
- **Raiz** já está claro; manter “Mover para pasta” com opção “Raiz” explícita.
- Mensagens de sucesso: “Documento «X» eliminado.” / “Documento renomeado.” / “Documento movido para «Pasta».”

---

## 3. Resumo de implementação sugerida

| Prioridade | Funcionalidade | Onde | Estado |
|------------|----------------|------|--------|
| **Alta** | Menu por documento: Renomear, Mover, Eliminar (com confirmação) | `knowledge-sidebar.tsx` | ✅ Implementado |
| **Média** | Renomear / Eliminar pasta (com confirmação) | `knowledge-sidebar.tsx` (nav de pastas) | Pendente |
| **Média** | Contador “X documentos nesta pasta” | Sidebar, secção da lista | ✅ Implementado |
| **Baixa** | Ordenação (API + UI) | `route.ts` GET + sidebar | Pendente |
| **Baixa** | Virtualização ou paginação da lista | Sidebar | Pendente |
| **Futuro** | Pré-visualizar / editar conteúdo do documento | Modal ou página | Pendente |

---

## 4. Referências

- [KNOWLEDGE-BASE-SIDEBAR-DOCUMENT-ORGANIZER.md](KNOWLEDGE-BASE-SIDEBAR-DOCUMENT-ORGANIZER.md) — layout, pastas, Document Organizer.
- [.cursor/rules/ultracite.mdc](../.cursor/rules/ultracite.mdc) — a11y, destrutivos com confirmação.
- APIs: `app/(chat)/api/knowledge/route.ts`, `app/(chat)/api/knowledge/[id]/route.ts`, `app/(chat)/api/knowledge/folders/[id]/route.ts`.
