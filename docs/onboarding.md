# Onboarding — desenvolvimento

Documentação rápida para quem entra no projeto.

## Antes de começar

- **Variáveis de ambiente:** [.env.example](../.env.example). Usar `pnpm run vercel:env` após `vercel:link` (ver [vercel-cli.md](vercel-cli.md)).
- **Base de dados:** `pnpm db:migrate` após configurar `POSTGRES_URL`.

## Agent Skills

O projeto usa [skills.sh](https://skills.sh) em `.agents/skills/`. Para ver as skills instaladas:

```bash
pnpm run skills:list
# ou
npx skills list
```

Visão completa e comandos: [.agents/README.md](../.agents/README.md). Arquitetura das skills: [.agents/SKILLS_ARCHITECTURE.md](../.agents/SKILLS_ARCHITECTURE.md).

## Guia para agentes de IA

Convenções, stack e regras para agentes (Cursor, etc.): [AGENTS.md](../AGENTS.md).
