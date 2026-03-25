---
name: finishing-a-development-branch
description: Finaliza uma branch de desenvolvimento no AssistJur: roda testes, apresenta opções (merge/PR/manter/descartar) e limpa worktrees. Use ao concluir uma feature ou correção antes de integrar ao main.
disable-model-invocation: true
allowed-tools: Bash(pnpm *), Bash(git *), Bash(npx vercel *)
---

Finalize a branch de desenvolvimento atual de forma segura.

## Argumento opcional
$ARGUMENTS (ex: `pr` para abrir PR direto, `merge` para merge local, vazio = apresentar opções)

---

## Passo 1 — Verificar estado da branch

```bash
git status
git log main..HEAD --oneline
```

Verificar:
- Há arquivos não commitados? → avisar o usuário antes de prosseguir
- Quantos commits acima do main?
- Qual é o nome da branch atual?

---

## Passo 2 — Rodar suite de testes completa

```bash
pnpm run check        # lint + TypeScript
pnpm run test:unit    # testes unitários (inclui validate-agents)
```

**Se qualquer teste falhar → PARAR.** Não integrar código quebrado.

Reportar resultado: `N testes passaram, M falharam`.

Para falhas, sugerir: `/test-driven-development` para corrigir com TDD.

---

## Passo 3 — Apresentar opções de integração

```
Testes passando. Como você quer integrar esta branch?

1) merge local     → git merge na main (sem PR)
2) pull request    → abrir PR no GitHub via gh pr create
3) manter branch   → deixar como está, sem integrar agora
4) descartar       → deletar a branch (requer confirmação textual "descartar")
```

Se `$ARGUMENTS` for `pr` → ir direto para opção 2.
Se `$ARGUMENTS` for `merge` → ir direto para opção 1.

---

## Passo 4 — Executar a escolha

### Opção 1 — Merge local
```bash
git checkout main
git merge --no-ff <branch> -m "merge: <branch-name>"
git log --oneline -3
```

### Opção 2 — Pull Request
Usar `/commit` para garantir que tudo está commitado, depois:
```bash
git push -u origin <branch>
gh pr create \
  --title "<tipo>(<escopo>): <descrição>" \
  --body "$(cat <<'EOF'
## Resumo
- <mudança principal>

## Testes
- [ ] `pnpm run test:unit` — passou
- [ ] `pnpm run check` — passou
- [ ] Testado manualmente em localhost:3300

🤖 Generated with Claude Code
EOF
)"
```

### Opção 3 — Manter branch
Registrar estado atual:
```bash
git log --oneline -5
```
Nenhuma ação adicional.

### Opção 4 — Descartar (requer "descartar" textual do usuário)
```bash
git checkout main
git branch -D <branch>
```
Se for worktree:
```bash
git worktree remove <path>
```

---

## Passo 5 — Limpeza de worktrees (se aplicável)

Verificar worktrees ativos:
```bash
git worktree list
```

Se houver worktrees de `.claire/worktrees/` relacionados à branch finalizada:
```bash
git worktree remove .claire/worktrees/<nome>
```

---

## Resumo final

Reportar:
- Branch integrada/descartada/mantida
- Status dos testes
- URL do PR (se criado)
- Worktrees limpos
