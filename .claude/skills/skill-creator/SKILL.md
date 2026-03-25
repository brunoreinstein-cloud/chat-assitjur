---
name: skill-creator
description: Cria ou melhora instruções de agentes do AssistJur seguindo a taxonomia de 4 camadas do Playbook v9.0. Use quando quiser formalizar, auditar ou evoluir as instruções de um agente (Revisor, Redator, Avaliador, Master, ou novo agente).
disable-model-invocation: true
allowed-tools: Read, Bash(pnpm run test:unit *), Bash(pnpm run test:unit)
---

Crie ou melhore as instruções de um agente do AssistJur seguindo a metodologia: **Draft → Validar → Testar → Refinar**.

## Alvo
$ARGUMENTS (ex: `revisor`, `redator`, `master`, `avaliador`, ou nome de novo agente)

## Referências obrigatórias — leia antes de qualquer edição

1. `docs/ESTRUTURA-INSTRUCOES-AGENTES.md` — padrão XML, checklist e regras de estrutura
2. `docs/SPEC-ASSISTJUR-V9.md` — taxonomia 4 camadas (A-D), 7 princípios invioláveis, gaps atuais
3. Arquivo do agente alvo (ex: `lib/ai/agent-revisor-defesas.ts`)

---

## Fase 1 — Context Gathering (leitura)

1. Ler o arquivo do agente alvo
2. Ler `docs/ESTRUTURA-INSTRUCOES-AGENTES.md` completo
3. Ler seções relevantes de `docs/SPEC-ASSISTJUR-V9.md` (Seção 3 — 7 Princípios, Seção 5 — Módulos)
4. Identificar: qual **Tipo** do Playbook (A-H)? Quais **Módulos** (M01-M14) o agente cobre?
5. Rodar validação atual:
   ```bash
   pnpm run test:unit -- tests/validate-agents.test.ts
   ```
   Registrar quais checks passam/falham antes da edição.

---

## Fase 2 — Diagnóstico

Preencher esta tabela com o estado atual:

| Check | Estado | Observação |
|-------|--------|------------|
| `<role>` com identidade e escopo explícitos | ✅/❌ | |
| `<thinking>` (se agente com gates/fases) | ✅/❌ | |
| `<workflow>` com gates numerados | ✅/❌ | |
| `<output_format>` especificado | ✅/❌ | |
| `<constraints>` com anti-alucinação | ✅/❌ | |
| `<examples>` few-shot | ✅/❌ | |
| 7 Princípios Invioláveis referenciados | ✅/❌ | |
| Temperatura correta para o tipo (A/F/G=0.1, B/C/D=0.2-0.3) | ✅/❌ | |
| Thinking mode definido | ✅/❌ | |
| Versão e resumo no comentário do topo | ✅/❌ | |

---

## Fase 3 — Draft das melhorias

Para cada gap identificado, propor a alteração mínima necessária.

**Regras de edição:**
- Não remover comportamento existente sem justificativa explícita
- Manter compatibilidade com `lib/ai/validate-agents.ts` (não quebrar checks existentes)
- Para Revisor: manter os 6 Gates e estrutura XML completa
- Para Master: manter as PARTES numeradas e o padrão de módulos M01-M14
- Adicionar comentário de versão no topo (ex: `// v3.3 — adicionado thinking mode, alinhado Tipo B`)

---

## Fase 4 — Validação pós-edição

```bash
# Validar estrutura dos agentes
pnpm run test:unit -- tests/validate-agents.test.ts

# Todos os testes unitários
pnpm run test:unit
```

Se algum teste quebrar, corrigir antes de prosseguir.

---

## Fase 5 — Teste com "leitor fresco" (Reader Testing)

Simular um caso de uso real do agente editado:
1. Descrever um input típico (ex: contestação trabalhista com 3 teses)
2. Traçar mentalmente como o agente processaria com as novas instruções
3. Verificar se os 7 Princípios Invioláveis seriam respeitados
4. Identificar possíveis ambiguidades ou conflitos introduzidos

---

## Fase 6 — Relatório final

Produzir um resumo com:
- **O que mudou** (diff conceitual, não de código)
- **Por que mudou** (alinhamento com Playbook v9.0, gap corrigido)
- **Testes:** status antes/depois
- **Próximos passos** recomendados (ex: "Gap 2 — thinking mode ainda pendente")

---

## Tipos do Playbook para referência rápida

| Tipo | Nome | Temperatura | Thinking | Agente atual |
|------|------|-------------|----------|--------------|
| A | Extrator (Template Lock) | 0.1 | sem | — (gap) |
| B | Analisador | 0.2 | sim | Revisor, Avaliador |
| C | Redator de Peça | 0.3 | sim | Redator |
| D | Auditor Recursal | 0.2 | sim | Revisor (parcial) |
| E | Estratégico | 0.2 | opus+thinking | — (gap) |
| F | Dados/Excel | 0.1 | sem | Master (M08-M10) |
| G | Pesquisa | 0.1 | sem | Assistente Geral |
| H | Gerador com Código | 0.1 | sem | — (gap) |
