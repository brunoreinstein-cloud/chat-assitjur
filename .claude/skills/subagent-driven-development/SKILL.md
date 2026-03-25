---
name: subagent-driven-development
description: Executa um plano de implementação despachando subagentes por tarefa com revisão dupla (conformidade + qualidade). Use após /writing-plans para executar planos granulares do AssistJur com isolamento de contexto por tarefa.
disable-model-invocation: true
---

Execute um plano de implementação com subagentes especializados e revisão em dois estágios.

## Alvo
$ARGUMENTS (ex: `plano Gap 2 thinking mode`, `plano Template Lock M02`, ou caminho para arquivo de plano)

---

## Pré-condição obrigatória

Deve existir um plano com tarefas T1-TN definidas. Se não existir, rodar `/writing-plans` primeiro.

Verificar estado limpo do repositório:
```bash
git status
pnpm run test:unit
```
**Se testes falharem → resolver antes de começar.**

---

## Passo 1 — Carregar e revisar o plano

1. Ler o plano (arquivo ou conversa anterior)
2. Revisar criticamente antes de começar:
   - As tarefas são realmente independentes?
   - Os critérios de aceitação são testáveis?
   - Há dependências não explicitadas?
3. Se houver problemas críticos → discutir com o usuário antes de prosseguir

---

## Passo 2 — Executar tarefas em sequência (com subagentes)

Para cada tarefa Tn do plano:

### Subagente Implementador

Contexto isolado fornecido ao agente:
```
Tarefa: <título>
Arquivo(s) alvo: <lista>
O que fazer: <descrição precisa>
NÃO modificar: <lista de restrições>
Verificação de sucesso: <comando>
Contexto do AssistJur: [incluir trechos relevantes de CLAUDE.md e SPEC-V9 se necessário]
```

O subagente implementa e retorna um dos sinais:
- `DONE` — concluído, testes passam
- `DONE_WITH_CONCERNS` — concluído mas há ressalvas
- `NEEDS_CONTEXT` — faltou informação (especificar o quê)
- `BLOCKED` — bloqueador encontrado (especificar)

### Revisão Estágio 1 — Conformidade com spec

Verificar se a implementação:
- Respeita a estrutura XML dos agentes (se alterou agente)
- Mantém os 7 Princípios Invioláveis
- Segue os padrões de `docs/ESTRUTURA-INSTRUCOES-AGENTES.md`
- Não quebrou testes existentes: `pnpm run test:unit`

### Revisão Estágio 2 — Qualidade de código

Verificar:
- TypeScript sem erros: `pnpm run check`
- Sem duplicação desnecessária
- Sem código de debug ou console.log esquecido
- Compatível com padrões do projeto (Drizzle, NextAuth, Vercel AI SDK)

Se qualquer revisão falhar → subagente corrije e passa pelas revisões novamente (máx 2 loops).

---

## Passo 3 — Progressão entre tarefas

Só avançar para Tn+1 quando Tn estiver com `DONE` ou `DONE_WITH_CONCERNS` revisado.

Manter registro de progresso:
```
T1 — ✅ DONE
T2 — ✅ DONE
T3 — 🔄 Em progresso
T4 — ⏳ Aguardando T3
```

---

## Passo 4 — Finalização

Quando todas as tarefas estiverem `DONE`:

1. Rodar suite completa:
   ```bash
   pnpm run test:unit
   pnpm run check
   ```
2. Se tudo passar → usar `/finishing-a-development-branch`
3. Se falhar → usar `/dispatching-parallel-agents` para falhas independentes

---

## Seleção de modelo por tarefa

| Tipo de tarefa | Modelo recomendado |
|----------------|-------------------|
| Tipos TypeScript, campos simples | `haiku` |
| Lógica de negócio, queries | `sonnet` |
| Instruções de agente, arquitetura | `sonnet` ou `opus` |
| Revisão de conformidade | `sonnet` |

---

## Regras de segurança

- **Nunca pular revisões** mesmo que a tarefa pareça trivial
- **Nunca mergear em main** sem todos os testes passando
- **Nunca modificar** `.env.local`, `AUTH_SECRET`, ou credenciais
- Se `BLOCKED` por 2+ loops → escalar para o usuário
