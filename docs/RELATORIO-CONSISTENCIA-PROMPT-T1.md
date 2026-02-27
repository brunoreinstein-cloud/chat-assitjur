# TAREFA 1 — Relatório de consistência do system prompt (Agente Revisor)

**Fonte analisada:** `lib/ai/agent-revisor-defesas.ts` (conteúdo único; não existe ainda a pasta `lib/prompts/agente-trabalhista/` com módulos 01–10).

As seções do prompt (## PAPEL, ## SIGLAS, etc.) foram tratadas como “módulos lógicos” para esta análise.

---

## 1.1 Conflitos entre módulos

| Verificação | Resultado |
|-------------|-----------|
| **Instrução que contradiz outra** | Nenhuma encontrada. PAPEL, ESCOPO, FLUXO e REGRAS estão alinhados. |
| **Fluxo Gate-1 → Gate 0.5 → geração de docs** | Consistente. FLUXO descreve: (1) GATE-1 validar A+B, (2) FASE A extrair+mapear com “PROIBIDO gerar docs”, (3) GATE 0.5 exibir resumo e aguardar CONFIRMAR/CORRIGIR, (4) FASE B gerar 3 DOCX, (5) ENTREGA. DOC 1/2/3 não exigem geração antes do Gate 0.5. |
| **Siglas (RTE, RDO, DAJ, DTC)** | Definidas em SIGLAS como “uso interno — PROIBIDO nos documentos” e “Nos DOCX: sempre por extenso”. Nos templates dos DOC 1/2/3 não aparecem siglas; usam “Reclamante”, “nome”, etc. **Consistente.** |

**Conclusão 1.1:** Não há conflitos entre as seções do prompt.

---

## 1.2 Completude das regras

| Regra | Onde está | Cobertura nos docs |
|-------|-----------|---------------------|
| **R1 Prescrição** | REGRAS + DOC 1 seção 2 | DOC 1 exige “QUADRO SEMPRE com bienal E quinquenal” e “Aviso-prévio indenizado→2 cenários” na regra. **Coberto.** Doc 2 explicita “SEM prescrição”. |
| **R2 Mapeamento** | REGRAS + DOC 1 seções 3 e 4 | Quadro Resumo de Pedidos e Análise Temática com criticidade/impugnado/✅❌⚠️. “NÃO impugnado→🔴” na regra. **Coberto.** |
| **R3 Anti-alucinação** | REGRAS + ESCOPO | Não há seção “Anti-alucinação” nos DOC 1/2/3; a regra é de conduta geral. **Coberto** via ESCOPO + R3. |
| **R4 Jornada** | REGRAS | Aplicável quando o tema for jornada; não há subseção “Jornada” nos docs. **Cobertura implícita** (regra aplica-se ao analisar o tema). |
| **R5 Oportunidades** | REGRAS + DOC 1 seção 4 | Doc 1 Análise Temática inclui “(e)oportunidades(VERMELHO)”. **Coberto.** |

**Sinalização visual (🔴🟡🟢 ✅❌⚠️):**

- **05-sinalizacao (SINALIZAÇÃO VISUAL):** “Usar em TODOS os docs sempre que um pedido/tema aparecer.”
- **DOC 1:** Quadro Resumo “Criticidade(🔴🟡🟢)”, “Defesa detalhada?(✅|⚠️|❌)”; Análise Temática “COR DE FUNDO(🔴🟡🟢)+ÍCONE(✅/❌/⚠️)”; Prescrição “Status(✅/❌/N/A)”; Defesas “Presente?(✅/❌/⚠️/N/A)”.
- **DOC 2:** “bolinha(🔴🟡🟢)” por tema em Resumo e Perguntas.
- **DOC 3:** “bolinha(🔴🟡🟢)” em Pedidos e posição.

**Conclusão 1.2:** As 5 regras têm cobertura; a sinalização está referenciada de forma consistente em SINALIZAÇÃO e nos três documentos.

**Aviso de IA:** Em PAPEL e DOC 1 está explícito que o aviso “Relatório gerado por IA. Revisão humana necessária e obrigatória.” é **SOMENTE no Doc 1**. DOC 2 e DOC 3 dizem “SEM aviso IA”. **Consistente.**

---

## 1.3 Proibições

| Proibição | Explícita? | Onde |
|-----------|------------|------|
| Não redigir peças processuais | Sim | PAPEL: “NÃO redige contestação”; ESCOPO: “Redigir peças” em Proibido. |
| Não inventar jurisprudência | Sim | ESCOPO: “Inventar fatos/jurisprudência”; R3: “NÃO inventar”. |
| Não emitir valores em R$ ou % | Sim | ESCOPO: “Valores R$/%”; DOC 1: “Sem R$”. |
| Não instruir testemunha (art. 342 CP) | Sim | ESCOPO: “Instruir testemunha (art.342 CP)”. |
| Não gerar documentos antes do Gate 0.5 | Sim | FLUXO: “PROIBIDO gerar docs” na FASE A; ESCOPO: “Gerar docs sem Gate 0.5”. |
| Não usar siglas internas nos documentos finais | Sim | SIGLAS: “PROIBIDO nos documentos”, “Nos DOCX: sempre por extenso”. |

**Conclusão 1.3:** Todas as proibições listadas estão explícitas e não contraditas.

---

## 1.4 Ordem de montagem

O prompt atual é um único bloco. A ordem das seções é:

1. PAPEL  
2. SIGLAS  
3. ESCOPO  
4. GATE-1  
5. FLUXO  
6. REGRAS OPERACIONAIS  
7. SINALIZAÇÃO VISUAL  
8. FORMATAÇÃO GERAL  
9. DOC 1  
10. DOC 2  
11. DOC 3  

**Avaliação:** A ordem é semântica: papel → vocabulário (siglas) → escopo → gates/fluxo → regras → formatação → estrutura dos docs. Não há seção dedicada “anti-alucinação” (está em R3) nem “contexto dinâmico” (data, nome do escritório); na arquitetura com `buildSystemPrompt(ctx)` esses itens seriam injetados por módulos separados.

**Sugestão para `index.ts` (quando existir):** Manter ordem equivalente:  
`papel → siglas → escopo → gate-fluxo → regras → sinalizacao → formatação → doc1 → doc2 → doc3 → anti-alucinação → contexto-dinâmico`.  
Assim o modelo vê primeiro identidade e regras, depois formato e estrutura dos docs, e por último restrições de segurança e dados dinâmicos.

---

## Resumo executivo

- **Conflitos:** Nenhum.  
- **Completude R1–R5 e sinalização:** Cobertas e consistentes.  
- **Proibições:** Todas explícitas.  
- **Ordem:** Adequada; em versão modular, acrescentar anti-alucinação e contexto dinâmico no final.

Nenhuma alteração obrigatória no texto do prompt; a análise serve de base para eventual refatoração em módulos em `lib/prompts/agente-trabalhista/`.
