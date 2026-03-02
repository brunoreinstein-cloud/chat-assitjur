# Upgrade do Next.js

Ao atualizar a versão do Next.js neste projeto, use a **skill next-upgrade** para guiar a migração e evitar quebras.

## Como usar

1. **No Cursor (ou outro agente com skills):** invocar a skill no chat, por exemplo:
   - “Usa **@next-upgrade** para planear a migração do Next.js 16 para a versão X.”
   - “Segue a skill **@next-upgrade** para fazer o upgrade do Next.js.”

2. **Localização da skill:** `.agents/skills/next-upgrade/` (instalada via [skills.sh](https://skills.sh/vercel-labs/next-skills/next-upgrade)).

3. **Antes do upgrade:** fazer backup ou branch, rodar `pnpm run prebuild` (lint + test:unit) e garantir que o build passa.

4. **Depois do upgrade:** rodar novamente `pnpm run prebuild` e `pnpm build`; corrigir breaking changes indicados pela skill ou pelo changelog do Next.js.

## Referências

- [.agents/README.md](../.agents/README.md) — lista de skills e comandos (`npx skills list`, `npx skills update`).
- [SKILLS_REPORT.md](SKILLS_REPORT.md) — relatório de skills e próximas otimizações.
