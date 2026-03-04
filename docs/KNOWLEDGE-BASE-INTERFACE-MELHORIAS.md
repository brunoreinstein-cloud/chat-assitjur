# Melhorias da interface da Base de conhecimento

Este documento consolida o **estado atual** da UI da base de conhecimento e propõe **melhorias concretas** (prioridade, impacto e onde implementar). Complementa [KNOWLEDGE-BASE-SIDEBAR-DOCUMENT-ORGANIZER.md](KNOWLEDGE-BASE-SIDEBAR-DOCUMENT-ORGANIZER.md) e [KNOWLEDGE-BASE-UX-UI-REVISAO.md](KNOWLEDGE-BASE-UX-UI-REVISAO.md).

---

## 1. Estado atual (resumo)

| Área | Implementado |
|------|--------------|
| **Acesso** | Botão no header do chat (ícone livro) + item no dropdown do input «Base de conhecimento»; estado no URL `?knowledge=open` |
| **Layout** | Barra lateral direita (desktop) / Sheet (mobile); fechar com botão ou (se aplicável) clique fora |
| **Pastas** | Raiz + lista de pastas; criar pasta (nome); filtrar documentos por pasta; pasta no URL `?folder=root|uuid` |
| **Documentos** | Lista por pasta; pesquisa por título; checkbox por doc; menu por doc: Renomear, Mover para pasta, Eliminar (com confirmação) |
| **Seleção** | «Neste chat» X/50; secções «Recentes» (8) e «Documentos na pasta»; «Selecionar todos» / «Desmarcar todos»; ações em massa: Mover, Eliminar |
| **Upload** | Drag-and-drop; ficheiros ou pasta; criar doc manual (título + conteúdo); destino = pasta atual; opção «Indexar» para RAG |
| **Arquivos** | Secção «Arquivos» (ficheiros guardados do chat); usar no chat ou «Adicionar à base e usar neste chat» |
| **@ no input** | Digitar `@` no input abre popover com documentos; escolher doc adiciona a `knowledgeDocumentIds` e insere `@Título` no texto |

**O que falta na UI (conforme revisão):**

- Renomear e eliminar **pasta** (APIs existem; não há ações na lista de pastas).
- Ordenação da lista (por data, título).
- Virtualização ou paginação quando há muitos documentos na pasta.
- Pré-visualizar / editar conteúdo do documento (ver texto completo ou editar).

---

## 2. Melhorias propostas (por prioridade)

### 2.1 Alta — Ações por pasta

**Problema:** O utilizador não consegue renomear nem eliminar pastas pela interface.

**Proposta:**

- Em cada **pasta** na secção «Pasta atual»: adicionar um **menu de contexto** (ícone ⋮ ou dropdown) ao lado do nome:
  - **Renomear pasta** — abre um diálogo (ou inline edit) com o nome atual; ao guardar, `PATCH /api/knowledge/folders/[id]` com `{ name }`.
  - **Eliminar pasta** — abre **AlertDialog**: «Eliminar pasta «X»? Os documentos passam para a Raiz.»; ao confirmar, `DELETE /api/knowledge/folders/[id]` e atualizar lista.
- Acessibilidade: botão do menu com `aria-label="Ações da pasta"`; confirmação obrigatória para eliminar.

**Onde:** `components/knowledge-sidebar.tsx` — na zona onde se faz `folders.map` (botões de pasta), envolver cada pasta num grupo com um `DropdownMenu` (trigger = ícone ⋮) e itens Renomear / Eliminar. Reutilizar o padrão já usado no menu por documento (AlertDialog para eliminar).

---

### 2.2 Média — Ordenação da lista de documentos

**Problema:** Com muitos documentos, não há forma de ordenar (por exemplo «mais recentes primeiro» ou «título A–Z»).

**Proposta:**

- Na secção «Documentos na pasta», adicionar um **controlo de ordenação** (dropdown ou dois botões):
  - Opções: «Mais recentes» (data descendente), «Título A–Z», «Título Z–A».
- **Opção A (só frontend):** Ordenar no cliente a lista já obtida por `GET /api/knowledge?folderId=...` (a API já devolve `createdAt` e `title`).
- **Opção B (API):** Se a lista for muito grande, a API passar a aceitar `?sort=createdAt|title&order=asc|desc` e devolver já ordenado; a sidebar envia esses parâmetros.

**Onde:** `knowledge-sidebar.tsx`: estado `sortBy: 'createdAt' | 'title'`, `sortOrder: 'asc' | 'desc'`; aplicar `filteredKnowledgeDocs` ordenado antes de renderizar; pequeno `<Select>` ou botões acima da lista.

---

### 2.3 Média — Hierarquia de pastas (subpastas)

**Problema:** A especificação fala em árvore de pastas (`parentId`), mas a UI mostra apenas uma lista plana de pastas (sem subpastas).

**Proposta:**

- Se o backend já suportar `parentId` em `KnowledgeFolder`:
  - Mostrar pastas em **árvore** (expandir/colapsar): Raiz → pasta → subpastas.
  - Ao criar pasta, permitir escolher **pasta pai** (opcional; null = Raiz).
- Se ainda não houver subpastas na API, pode ficar para uma fase seguinte.

**Onde:** `knowledge-sidebar.tsx` — componente recursivo ou lista com indentação por nível; `GET /api/knowledge/folders` deve devolver estrutura em árvore (ou construir no cliente a partir de `parentId`).

---

### 2.4 Média — Indicador de estado de indexação (RAG)

**Problema:** O utilizador pode não perceber porque é que um documento «não responde» bem no RAG (ex.: ainda «pending» ou «failed»).

**Proposta:**

- Na lista de documentos, mostrar um **indicador discreto** por documento:
  - **Indexado** (ícone ✓ ou bolinha verde) — chunks disponíveis para RAG.
  - **Pendente** (ícone de relógio ou amarelo) — à espera de indexação.
  - **Falha** (ícone de aviso ou vermelho) — com tooltip «Falha ao indexar; pode tentar indexar de novo».
- O botão «Indexar X pendente(s)» já existe; manter e garantir que, após indexar, o estado é atualizado na lista (mutate da SWR).

**Onde:** `knowledge-sidebar.tsx` — na linha de cada documento (`KnowledgeDoc` já tem `indexingStatus`); ícone ou badge ao lado do título conforme `indexingStatus`.

---

### 2.5 Baixa — Virtualização ou paginação da lista

**Problema:** Com 50+ documentos numa pasta, a lista pode ficar pesada (scroll longo, muitos nós no DOM).

**Proposta:**

- **Virtualização:** Usar `@tanstack/react-virtual` (ou equivalente) na lista «Documentos na pasta» para renderizar apenas os itens visíveis.
- **Alternativa:** Paginação (ex.: 20 por página) com `GET /api/knowledge?folderId=...&limit=20&offset=...` se a API passar a suportar.

**Onde:** `knowledge-sidebar.tsx` — envolver o `<ul>` da lista de documentos num `useVirtualizer`; manter acessibilidade (lista semântica, foco e teclado).

---

### 2.6 Baixa — Pré-visualizar / editar conteúdo do documento

**Problema:** Não há forma de ver o texto completo de um documento nem de o editar sem ir a outra ferramenta.

**Proposta:**

- **Pré-visualizar:** No menu do documento, opção «Ver conteúdo» que abre um **modal ou drawer** com o texto do documento (só leitura). Dados via `GET /api/knowledge/[id]` (já usado no «Ver» atual, se existir).
- **Editar (fase seguinte):** No mesmo modal, modo edição: textarea com `content`; ao guardar, `PATCH /api/knowledge/[id]` com `{ content }` e, se aplicável, reindexar (chamar endpoint de indexação).

**Onde:** `knowledge-sidebar.tsx` — já existe `docToView` e `viewedDoc`; garantir que o modal de «Ver» mostra o conteúdo de forma legível (scroll, tipografia). Se ainda não existir, adicionar item «Ver conteúdo» no menu do documento e um `Dialog` que mostra `viewedDoc?.content`.

---

### 2.7 Consistência e microcopy

- **Termo destrutivo:** Usar sempre **«Eliminar»** (e não «Remover» ou «Apagar») para documento e pasta, em toda a sidebar e nos AlertDialogs.
- **Mensagens de sucesso:** Manter padrão «Documento «X» eliminado.» / «Documento renomeado.» / «Documento movido para «Pasta».» / «Pasta eliminada.».
- **Empty states:** Manter frases claras, em segunda pessoa quando fizer sentido (ex.: «Nenhum documento nesta pasta. Adicione por ficheiros ou crie abaixo.»).
- **Placeholders:** Terminar com «…» (ex.: «Procurar por título…», «Nova pasta…»).

---

### 2.8 Acessibilidade e Guidelines

- **Menu de pasta:** Garantir que o trigger do dropdown (ícone ⋮) tem `aria-label` e que os itens são focáveis; Escape fecha o menu.
- **AlertDialogs:** Foco no botão «Cancelar» ao abrir; confirmação destrutiva sempre com dois passos (abrir diálogo → confirmar).
- **Contador X/50:** Manter `aria-live="polite"` e `tabular-nums` para leitores de ecrã.
- **Listas longas:** Se se adoptar virtualização, manter `role="list"` e itens com `role="listitem"` (ou elementos semânticos `<ul>`/`<li>`) para não quebrar a árvore de acessibilidade.

---

### 2.9 Experiência no input (@ e botão)

- **Botão da base no input:** Já mostra badge com o número de documentos selecionados; manter e garantir contraste (ex.: `text-primary` quando > 0).
- **Popover @:** Garantir que:
  - A lista de documentos no popover está filtrada por texto após `@` e que o primeiro resultado é focável;
  - Tecla Enter seleciona o item em foco; Escape fecha sem alterar texto.
- **Descoberta:** O dropdown do input já inclui «Base de conhecimento»; na página de Ajuda ou tooltip, pode referir-se que «@ no texto» também abre a escolha de documentos.

---

## 3. Resumo em tabela

| Prioridade | Melhoria | Onde | Esforço |
|------------|----------|------|--------|
| **Alta** | Menu pasta: Renomear, Eliminar (com confirmação) | `knowledge-sidebar.tsx` (botões de pasta) | Pequeno |
| **Média** | Ordenação lista (data, título A–Z / Z–A) | `knowledge-sidebar.tsx` (estado + UI) | Pequeno |
| **Média** | Árvore de pastas (subpastas) | Sidebar + API folders (estrutura) | Médio |
| **Média** | Indicador de indexação por documento (pending/indexed/failed) | `knowledge-sidebar.tsx` (linha do doc) | Pequeno |
| **Baixa** | Virtualização ou paginação da lista | `knowledge-sidebar.tsx` | Médio |
| **Baixa** | Pré-visualizar / editar conteúdo do documento | Sidebar (modal/drawer + PATCH) | Médio |
| **Geral** | Consistência de copy e a11y | Toda a sidebar e modais | Contínuo |

---

## 4. Referências

- [KNOWLEDGE-BASE-SIDEBAR-DOCUMENT-ORGANIZER.md](KNOWLEDGE-BASE-SIDEBAR-DOCUMENT-ORGANIZER.md) — layout, pastas, Document Organizer.
- [KNOWLEDGE-BASE-UX-UI-REVISAO.md](KNOWLEDGE-BASE-UX-UI-REVISAO.md) — revisão com muitos arquivos, ações por documento/pasta.
- [KNOWLEDGE-BASE-AT-E-PASTAS.md](KNOWLEDGE-BASE-AT-E-PASTAS.md) — @ no input e estrutura de pastas.
- `.cursor/rules/ultracite.mdc` — a11y, confirmação em ações destrutivas.
- Componente atual: `components/knowledge-sidebar.tsx`.
