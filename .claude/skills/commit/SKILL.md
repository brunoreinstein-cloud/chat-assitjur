---
name: commit
description: Cria um commit padronizado seguindo as convenções do AssistJur (Conventional Commits em português)
disable-model-invocation: true
allowed-tools: Bash(git *)
---

Crie um commit seguindo as convenções do AssistJur.

## Argumento opcional
$ARGUMENTS (use para prefixar ou dar dica do escopo — ex: `feat(auth)` ou deixe vazio para inferir)

## Passos

1. **Inspecionar estado atual** — execute em paralelo:
   - `git status` — arquivos modificados/novos
   - `git diff --cached` — o que já está staged
   - `git diff` — o que está unstaged
   - `git log --oneline -5` — histórico recente para seguir o estilo

2. **Verificar segurança** — antes de qualquer commit:
   - Não commitar arquivos como `.env`, `.env.local`, `*.key`, `*secret*`, `credentials*`
   - Se encontrar, avisar o usuário e abortar

3. **Analisar mudanças** — entender o que foi alterado e por quê

4. **Selecionar arquivos** — dar preferência a `git add <arquivo>` por arquivo específico em vez de `git add .`
   - Nunca adicionar arquivos de build, `.next/`, `node_modules/`, `dist/`

5. **Redigir mensagem de commit** seguindo Conventional Commits:

   ```
   <tipo>(<escopo>): <descrição curta em português>

   [corpo opcional — o "porquê", não o "o quê"]

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```

   **Tipos válidos:**
   | Tipo | Quando usar |
   |------|-------------|
   | `feat` | Nova funcionalidade |
   | `fix` | Correção de bug |
   | `refactor` | Refatoração sem mudar comportamento |
   | `docs` | Documentação |
   | `chore` | Configuração, deps, scripts |
   | `test` | Testes |
   | `perf` | Melhoria de performance |
   | `style` | Formatação, lint (sem lógica) |

   **Escopos comuns do AssistJur:** `chat`, `auth`, `processos`, `agentes`, `db`, `cache`, `api`, `ui`, `deploy`

   **Regras:**
   - Descrição em português, imperativo, sem ponto final, máx 72 chars
   - Corpo só se necessário para explicar decisão não óbvia
   - Usar `!` após o tipo para breaking changes: `feat(auth)!:`

6. **Criar o commit** com `git commit -m "$(cat <<'EOF' ... EOF)"` (HEREDOC para formatação correta)

7. **Confirmar** com `git status` e `git log --oneline -1`
