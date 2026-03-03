# Testes: hidratação (next-themes), editor de artefatos e animações

Checklist manual para validar o comportamento após alterações em temas, ProseMirror/CodeMirror ou framer-motion.

---

## 1. Dark mode (next-themes) e hidratação

**Objetivo:** Garantir que não há flash de conteúdo ao alternar tema ou ao carregar a página.

**Alterações feitas no código:**

- **Script anti-flash** em `app/layout.tsx`: um script inline no `<head>` aplica a classe `dark` no `<html>` antes da hidratação, com base em `localStorage.getItem('theme')` e em `prefers-color-scheme`. Assim, o tema já está correto no primeiro paint.
- **Toggle de tema** em `components/sidebar-user-nav.tsx`: uso de estado `mounted` para só mostrar o texto dependente do tema (“Alternar modo escuro” / “Alternar modo claro”) após a hidratação; antes mostra “Alternar tema”, evitando mismatch e flash do texto.

**Como testar:**

1. Definir tema **escuro** (menu do utilizador → Alternar modo escuro).
2. Recarregar a página (F5): a página deve carregar já em dark sem flash para claro.
3. Alternar para **claro** e recarregar: deve carregar já em light sem flash para escuro.
4. Alternar várias vezes entre claro e escuro sem recarregar: sem flash; o texto do item do menu deve ser consistente (“Alternar modo escuro” em tema claro e “Alternar modo claro” em tema escuro).

---

## 2. Editor de artefatos (ProseMirror + CodeMirror)

**Objetivo:** Confirmar que a edição funciona e que o tema do editor de código segue o tema da aplicação.

**Contexto:**

- **Texto (Markdown):** ProseMirror (`text-editor.tsx`, `prosemirror-*`). Estilos via Tailwind `prose dark:prose-invert`.
- **Código (Python):** CodeMirror 6 (`code-editor.tsx`, `@codemirror/*`, `codemirror`). O tema `oneDark` é aplicado apenas quando `resolvedTheme === "dark"` (next-themes); em tema claro o editor usa o estilo claro.

**Como testar:**

1. No chat, abrir um artefato (por exemplo, criar um artefato de texto ou de código).
2. **Artefato de texto:** escrever, formatar (títulos, listas), guardar. Verificar que não há erros na consola e que o conteúdo persiste.
3. **Artefato de código:** escrever código Python, guardar. Alternar entre tema claro e escuro: o editor de código deve mudar de aparência (claro ↔ oneDark) sem quebrar a edição.
4. Se houver incompatibilidades entre versões de `prosemirror-*` ou `@codemirror/*`, erros tendem a aparecer na consola ao abrir/editar; verificar também que não há avisos de peer dependencies após `pnpm install`.

---

## 3. Animações (framer-motion + motion)

**Objetivo:** Confirmar que as transições no sidebar e nos componentes do chat estão corretas.

**Onde são usadas:**

- **Sidebar:** `sidebar-history.tsx` — `motion.div` com `onViewportEnter` para carregar mais conversas (infinite scroll).
- **Chat / artefato:** `artifact.tsx` — `AnimatePresence` e vários `motion.div` (painel do artefato, painel da conversa, overlay).
- **Outros:** `artifact-messages.tsx`, `toolbar.tsx`, `greeting.tsx`, `suggestion.tsx`, `version-footer.tsx`; `shimmer.tsx` usa `motion/react` (pacote `motion`).

**Como testar:**

1. **Sidebar:** rolar o histórico de conversas até ao fim; deve carregar mais itens e a animação de viewport não deve falhar.
2. **Artefato:** abrir um artefato (texto/código/folha/imagem) e fechar; o painel deve abrir/fechar com a animação (spring) definida em `artifact.tsx`.
3. **Toolbar / sugestões:** interagir com a barra de ferramentas e com sugestões; as transições devem ser suaves.
4. Se tiver atualizado `framer-motion` ou `motion`, rever a documentação das duas bibliotecas; o projeto usa ambas (`framer-motion` na maioria dos componentes, `motion/react` no shimmer).

---

## Comandos úteis

```bash
pnpm dev          # http://localhost:3300
pnpm run lint     # Ultracite check
pnpm run format   # Ultracite fix
```
