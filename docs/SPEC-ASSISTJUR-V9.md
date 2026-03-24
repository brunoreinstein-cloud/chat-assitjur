# SPEC AssistJur.IA — v9.0 (Estado Atual + Roadmap)

**Baseado em:** MEGA_PLAYBOOK_PROCESSO_TRABALHISTA_v9.0.docx (23/03/2026)
**Data:** 2026-03-23
**Status:** Documento vivo — atualizar quando estado mudar

---

## 1. Visão e Missão

O **AssistJur.IA** é um HUB de assistentes de IA especializados em processo trabalhista brasileiro. Opera pela perspectiva exclusiva da **Reclamada** (defesa empresarial). Missão central: receber documentos de processos (PDFs PJe, planilhas) e produzir entregáveis com **assertividade mínima de 99,5% e tolerância zero a alucinações**.

**Princípio inviolável:** Melhor vazio que inventado. Campo não encontrado após 7+3 camadas de busca = `---`. Nunca inventar, estimar ou inferir sem rastreabilidade.

---

## 2. Taxonomia Normativa (4 Camadas)

O Playbook v9.0 define uma hierarquia normativa que **toda instrução de agente deve respeitar**:

| Camada | Nome | Escopo | Prevalência |
|--------|------|--------|-------------|
| **A** | Regras Universais | Valem para TODOS os agentes, sem exceção | Máxima — nunca overridden |
| **B** | Regras por Tipo (A-H) | Específicas do tipo de agente (Extrator, Analisador, etc.) | Alta |
| **C** | Regras por Módulo | M01-M14, produtos específicos | Média |
| **D** | Referência & Exemplos | Regex, aliases, schemas, exemplos | Informativa |

**Estado atual:** Os agentes têm instruções proprietárias mas **não seguem formalmente a estrutura de 4 camadas**. As instruções misturam regras universais com regras de módulo sem hierarquia explícita.

---

## 3. Os 7 Princípios Invioláveis (Camada A)

Estes princípios devem estar em **todos** os agentes:

1. **Melhor vazio que inventado** — campo ausente = `---`; dado ambíguo → reportar ambiguidade
2. **Rastreabilidade tripla** — cada dado: (1) nº página no PDF, (2) trecho literal (≤200 chars), (3) documento-fonte
3. **Precedência de título** — Sentença > Acórdão > Ata > Cálculos > Contestação > Inicial
4. **Busca 7+3 camadas** — exaurir todas antes de declarar "não localizado"
5. **Validação tripla** — Formato → Plausibilidade → Contexto; falha = rejeição
6. **Res judicata inviolável** — pós-trânsito: apenas aritmética; fatos imutáveis
7. **Zero alucinação** — confiança < 0.998 em campo crítico → FLAG revisão humana

---

## 4. Agentes Atuais vs. Tipos do Playbook

### 4.1 Mapeamento

| Agente Atual | Tipo Playbook | Estado |
|---|---|---|
| Assistente Geral | G — Pesquisa | ✅ Implementado |
| Revisor de Defesas | B — Analisador + D — Auditor Recursal | ✅ Implementado |
| Redator de Contestações | C — Redator de Peça | ✅ Implementado |
| Avaliador de Contestação | B — Analisador | ✅ Implementado |
| AssistJur.IA Master | A/B/C/D/E/F — todos os 14 módulos | ✅ Implementado (parcial) |

### 4.2 Tipos do Playbook não cobertos explicitamente

| Tipo | Nome | Gap |
|---|---|---|
| **A** | Extrator (Template Lock) | Master tem M08/M09 mas sem Template Lock real (substituição de `{PLACEHOLDER}` em DOCX existente) |
| **E** | Estratégico (Provisão/CPC25) | Parcialmente em M02/M11 do Master; sem agente dedicado |
| **F** | Dados/Excel | M08/M09/M10 no Master; pipeline FASE 0-4 não implementado |
| **H** | Gerador com Código Python | Não há agente com código fixo no RAG para geração DOCX via python-docx |

---

## 5. Catálogo de Módulos M01-M14 — Estado

| # | Módulo | Comando | Entregável | Estado |
|---|--------|---------|------------|--------|
| M01 | Relatório Processual | `/relatorio-processual` | DOCX | ✅ Master |
| M02 | Carta de Prognóstico | `/carta-prognostico` | DOCX | ✅ Master |
| M03 | Relatório Master | `/relatorio-master` | DOCX | ✅ Master |
| M04 | Relatório DPSP | `/relatorio-dpsp` | DOCX | ✅ Master |
| M05 | Formulário OBF | `/obf` | Formulário | ✅ Master |
| M06 | Ficha Apólice/Garantia | `/ficha-apolice` | DOCX | ✅ Master |
| M07 | Auditoria Corporativa | `/auditoria` | DOCX + XLSX | ✅ Master |
| M08 | Cadastro eLaw | `/cadastro-elaw` | XLSX (2 abas) | ✅ Master |
| M09 | Encerramento | `/encerramento` | XLSX | ✅ Master |
| M10 | Análise Aquisição Créditos | `/aquisicao-creditos` | XLSX (12 abas) | ✅ Master |
| M11 | Análise Estratégica TST | `/analise-tst` | DOCX | ✅ Master |
| M12 | Relatório Modelo BR | `/modelo-br` | DOCX (50 campos) | ✅ Master |
| M13 | Relatório Completo A-P | `/completo` | DOCX (250 campos) | ✅ Master |
| M14 | Extração de Cálculos | `/extracao-calculos` | JSON | ✅ Master |

**Nota:** Todos os módulos estão cobertos nas instruções do Master. Os gaps são de **qualidade de implementação** (Template Lock, pipeline FASE 0-4, validação de confiança), não de existência.

---

## 6. Arquitetura Técnica Atual vs. Playbook

### 6.1 O que está implementado ✅

| Componente | Estado |
|---|---|
| ToolLoopAgent per-request | ✅ `lib/ai/chat-agent.ts` |
| 5 agentes built-in | ✅ `lib/ai/agents-registry.ts` |
| Memory tools (`saveMemory`, `recallMemories`, `forgetMemory`) | ✅ `lib/ai/tools/memory.ts` |
| Human-in-the-Loop (`requestApproval`) | ✅ `lib/ai/tools/human-in-the-loop.ts` |
| Pipeline multi-chamadas (`analyzeProcessoPipeline`) | ✅ `lib/ai/tools/analyze-processo-pipeline.ts` |
| `createMasterDocuments` (DOCX/XLSX/JSON + ZIP) | ✅ `lib/ai/tools/create-master-documents.ts` |
| Knowledge base + RAG (pgvector) | ✅ `lib/ai/knowledge-base.md` |
| Schema `Processo`, `TaskExecution`, `VerbaProcesso` | ✅ `lib/db/schema.ts` |
| Admin panel (overrides de instruções, label, modelo) | ✅ `/admin/agents` |
| `maxOutputTokens: 16000` para Master (M13: 250 campos) | ✅ `agents-registry.ts` |
| Restrição de modelos por agente (`allowedModelIds`) | ✅ `nonReasoningChatModelIds` para Revisor/Master |
| Prompt caching Anthropic | ✅ `withPromptCachingForAnthropic` |
| 6 Gates nos agentes Revisor e Avaliador (via prompt) | ✅ instruções dos agentes |

### 6.2 Gaps identificados vs. Playbook v9.0

#### Gap 1 — Seleção de temperatura por tipo de assistente

**Playbook define:**
- Tipo A/F/G (extração, dados): `temperature: 0.1`
- Tipo B/C/D/E (análise, redação, estratégico): `temperature: 0.2-0.3`

**Atual:** todos os agentes usam `temperature: 0.2` uniforme.

**Impacto:** Extração de dados pelo Master pode ter variância desnecessária.

---

#### Gap 2 — Thinking mode por tipo de agente

**Playbook define:**
- Tipo A/F/G/H: `claude-sonnet` sem thinking (AUTO)
- Tipo B/C/D: `claude-sonnet` com thinking
- Tipo E (Estratégico): `claude-opus` com thinking

**Atual:** thinking mode não é configurado por tipo — depende do modelo escolhido pelo utilizador. Sem distinção Estratégico vs. Analisador.

**Ação:** Adicionar flag `thinkingMode` em `AgentConfig`; mapear agentes para modo correto.

---

#### Gap 3 — Template Lock (Cluster C04)

**Playbook define:** O agente nunca cria DOCX do zero — abre template existente, localiza `{PLACEHOLDER}`, substitui preservando fontes, ordem e layout.

**Atual:** `createMasterDocuments` gera DOCX programaticamente via docx-js. Para módulos com templates fixos do cliente (M02 Carta Prognóstico Autuori, M04 DPSP, M06 Apólice GPA), o template correto deve ser carregado da Knowledge Base e preenchido via ZIP/XML.

**Ação:** Implementar Template Lock para módulos com template fixo do cliente; `createMasterDocuments` deve distinguir entre modo "gerar do zero" e modo "preencher template".

---

#### Gap 4 — 6 Gates de Validação formais

**Playbook define 6 Gates obrigatórios:**
- GATE 1: CNJ válido (formato + dígito verificador)
- GATE 2: CNPJ validado (MATRIZ, dígitos verificadores)
- GATE 3: Cronologia válida (admissão < demissão < distribuição < sentença < trânsito)
- GATE 4: Valores plausíveis (RDA ≥ BRUTO; condenação ≤ valor causa)
- GATE 5: Campos críticos com confiança ≥ 0.998 (prazo_fatal, CNJ, data_transito, valor_homologado)
- GATE 6: Res judicata (pós-trânsito: apenas aritmética)

**Atual:** Gates implementados via instruções de prompt no Revisor e Avaliador (GATE-1 e GATE 0.5). Não há validação de formato CNJ/CNPJ, validação de cronologia ou confiança automatizada no código.

**Ação:** Tool de validação (`runProcessoGates`) que executa os 6 gates antes de gerar output; retorna lista de falhas com mensagens padronizadas.

---

#### Gap 5 — Padrão Tripartite de Entrega

**Playbook define:** Entrega em UMA ÚNICA mensagem com:
1. `📋 APONTAMENTOS` — 3-5 bullets com achados mais relevantes
2. Arquivo DOCX/XLSX
3. `⚠️ OBSERVAÇÕES AO REVISOR` — alertas, pendências, flags

**Atual:** O chat usa streaming contínuo. O Master envia confirmação + link após gerar documento. Não há estruturação explícita tripartite na UI.

**Ação:** Definir padrão de resposta tripartite nas instruções dos agentes Tipo B/C/D. UI: renderizar bloco de observações após link do documento.

---

#### Gap 6 — Escala de confiança e campos críticos

**Playbook define:**
- Campos críticos (≥ 0.998): `prazo_fatal`, `CNJ`, `data_transito`, `valor_homologado`, `RDA`, `RCTE`, `valor_condenacao`
- Confiança < 0.700 → REJEITAR
- 0.700-0.950 → VALIDAR MANUALMENTE
- ≥ 0.998 → aceitar sem revisão

**Atual:** Não implementado. Confiança não é calculada nem reportada.

**Ação:** Campo de confiança nos outputs JSON das tools; flags automáticos para campos críticos abaixo do limiar.

---

#### Gap 7 — Autonomia: zero confirmações intermediárias

**Playbook define:** O assistente executa TUDO e entrega em UMA mensagem. Proibido pedir confirmação entre etapas.

**Exceções taxativas:** múltiplas reclamadas sem alvo, empresa fora do cadastro, dado externo indispensável, falha técnica bloqueante, ambiguidade em campo crítico.

**Atual:** O HITL (`requestApproval`) e o GATE 0.5 (Revisor/Avaliador) contradizem parcialmente este princípio.

**Resolução:** O GATE 0.5 do Revisor/Avaliador é uma **exceção taxativa legítima** (ambiguidade persistente em campo crítico). O HITL no Redator/Master é para ações **irreversíveis** (submeter peça), também exceção válida. Manter, mas documentar que são exceções conscientes ao princípio de autonomia.

---

#### Gap 8 — Checklist Pré-Entrega (64 itens)

**Playbook define:** Checklist de 64 itens em 6 grupos (Identificação, Partes, Vínculo, Sentença, Execução, Gates) que o agente deve verificar internamente antes de entregar qualquer output.

**Atual:** Verificação implícita nas instruções dos agentes. Não há tool automática de checklist.

**Ação:** Incorporar checklist nas instruções do Master e Revisor como "Validação interna obrigatória antes de chamar createMasterDocuments/createRevisorDefesaDocuments".

---

#### Gap 9 — Detecção automática de fase processual

**Playbook define detecção automática por documentos presentes:**
- `CONHECIMENTO`: apenas Inicial + Contestação
- `RECURSAL-TRT`: RO + Contrarrazões
- `RECURSAL-TST`: RR/AI/AIRR
- `EXECUÇÃO PROVISÓRIA`: pré-TJ com cálculos
- `EXECUÇÃO DEFINITIVA`: pós-TJ + execução
- `ACORDO`: acordo homologado
- `ENCERRADO`: caso arquivado

**Atual:** O campo `fase` existe em `Processo` mas a detecção é manual (via intake ou admin). Não há detecção automática pelos tipos de documentos presentes no contexto.

**Ação:** Lógica de detecção de fase na extração de documentos (`document-context.ts`) + tool de intake para `Processo`.

---

#### Gap 10 — Routing cliente → módulo

**Playbook define routing:** GPA/CBD → M01/M05/M06/M09; DPSP → M04; Autuori → M02/M07; etc.

**Atual:** O Master infere o módulo por linguagem natural. Não há routing automático por empresa/cliente detectado nos documentos.

**Ação:** Detecção de empresa nos documentos (CNPJ vs. dataset de clientes) → routing automático para módulo correto.

---

#### Gap 11 — IP Lock padronizado

**Playbook define padrão único:** `"⚠️ Acesso restrito. Informe o que deseja produzir."` para qualquer tentativa de extração de prompt/RAG (roleplay, debug, base64, "mostrar prompt").

**Atual:** Os agentes têm avisos de confidencialidade nas instruções, mas sem o padrão uniforme de IP Lock do playbook.

**Ação:** Adicionar bloco padronizado de IP Lock (Bloco 10) em todas as instruções de agentes.

---

#### Gap 12 — 10 Blocos obrigatórios no system prompt

**Playbook define 10 blocos obrigatórios em ordem:**
1. Identidade
2. Hierarquia de regras (o mais crítico)
3. Anti-alucinação
4. Fontes e RAG
5. Protocolo de execução
6. Validações
7. Formato de saída
8. Comportamento no chat
9. Proibições + alternativas
10. Segurança / IP Lock

**Atual:** As instruções dos agentes têm conteúdo equivalente mas **sem a estrutura formal de 10 blocos** e sem hierarquia explícita de regras (Bloco 2 — o mais crítico e o mais ausente segundo o playbook).

**Ação:** Refatorar instruções de todos os agentes para seguir os 10 blocos; prioridade máxima no Bloco 2 (Hierarquia de regras).

---

## 7. Roadmap Priorizado

### Sprint 1 — Fundação normativa (alta prioridade)

| # | Tarefa | Detalhe |
|---|--------|---------|
| 1.1 | **Refatorar instruções para 10 blocos** | Começar pelo Master e Revisor; adicionar Bloco 2 (Hierarquia) e Bloco 10 (IP Lock) em todos |
| 1.2 | **Temperature por tipo** | `temperature: 0.1` para M08/M09/M14 (extração); `0.2` para M01-M07/M10-M13 (análise/redação) |
| 1.3 | **Thinking mode flag** | `AgentConfig.thinkingEnabled?: boolean`; Master em modo análise/redação = thinking; extração = sem thinking |
| 1.4 | **Tripartite delivery nas instruções** | Formalizar padrão `📋 APONTAMENTOS → arquivo → ⚠️ OBSERVAÇÕES` em Master, Revisor e Redator |

### Sprint 2 — Validação e gates

| # | Tarefa | Detalhe |
|---|--------|---------|
| 2.1 | **Tool `runProcessoGates`** | Gates 1-6: validar CNJ (regex + dígito), CNPJ (MATRIZ), cronologia, valores, campos críticos, res judicata |
| 2.2 | **Checklist pré-entrega nas instruções** | Adicionar checklist de 64 itens como "VALIDAÇÃO INTERNA OBRIGATÓRIA" nas instruções Master e Revisor |
| 2.3 | **Detecção de fase processual** | Em `document-context.ts`: detectar fase por keywords (ISSO POSTO, ACÓRDÃO, CERTIFICO trânsito, RCTE) |
| 2.4 | **Confiança em campos críticos** | Campos `prazo_fatal`, `CNJ`, `data_transito`, `valor_homologado` → flag VERIFICAR se abaixo de 0.998 |

### Sprint 3 — Template Lock e outputs

| # | Tarefa | Detalhe |
|---|--------|---------|
| 3.1 | **Template Lock para M02/M04/M06** | `createMasterDocuments` aceitar modo `"template"` + `templateId`; carregar template da KB e substituir `{PLACEHOLDER}` via ZIP/XML |
| 3.2 | **Routing cliente → módulo** | Dataset de CNPJs de clientes conhecidos (GPA, DPSP, Autuori) → routing automático para módulo correto quando CNPJ detectado |
| 3.3 | **Pipeline FASE 0-4 para Tipo F** | Para M08/M09/M10/M14: implementar pipeline FASE 0 (mapeamento landmarks) → FASE 1 (mapeamento colunas) → FASE 4 (output) |

### Sprint 4 — Processo e chat por processo

| # | Tarefa | Detalhe |
|---|--------|---------|
| 4.1 | **Chat com `processoId`** | `processoId` no body do POST /api/chat; injetar contexto do processo no system prompt; ligar `TaskExecution` ao `chatId` |
| 4.2 | **State machine de fases** | `avancaFaseAction`; badge de fase na UI; transições válidas |
| 4.3 | **AgentRisk** | Agente para análise de risco por verba (M03/M12); `upsertRiscoVerbaAction`; painel de risco |
| 4.4 | **Peças e AgentDrafter integrado** | Tabela `pecas`; `savePecaAction` (Blob); Redator recebe contexto do processo |

---

## 8. Variáveis de Ambiente a Adicionar

| Variável | Descrição | Padrão |
|---|---|---|
| `EXTRACTION_TEMPERATURE` | Temperature para agentes de extração (Tipo A/F) | `0.1` |
| `ANALYSIS_TEMPERATURE` | Temperature para agentes de análise/redação (Tipo B/C/D/E) | `0.2` |
| `CONFIDENCE_CRITICAL_THRESHOLD` | Limiar mínimo para campos críticos sem flag | `0.998` |
| `COMPLETENESS_MIN_THRESHOLD` | % mínimo de campos preenchidos antes de entregar | `0.85` |
| `CLIENT_ROUTING_DATASET` | Path/ID do dataset de CNPJs de clientes para routing automático | — |

---

## 9. Métricas de Qualidade (targets do Playbook v9.0)

| Métrica | Target | Estado Atual |
|---|---|---|
| Completude de campos | ≥ 90% | Não medido |
| Precisão de valores extraídos | ≥ 99% | Não medido |
| Tempo por processo | < 15 min | Não medido |
| Taxa "NÃO LOCALIZADO" | < 15% | Não medido |
| Confiança média | ≥ 0.95 | Não medido |
| Gates aprovados | 6/6 | Parcial (2/6 via prompt) |
| Cobertura de documentos | ≥ 95% | Não medido |
| Rastreabilidade (log completo) | 100% | Não medido |

**Ação:** Implementar telemetria de outputs — registrar em `TaskExecution.result` os valores dessas métricas a cada execução.

---

## 10. Referências

| Documento | Conteúdo |
|---|---|
| `G:\Meu Drive\AssistJur\...\MEGA_PLAYBOOK_PROCESSO_TRABALHISTA_v9.0.docx` | Playbook normativo completo — fonte deste SPEC |
| [AGENTE-ASSISTJUR-MASTER.md](AGENTE-ASSISTJUR-MASTER.md) | Guia operacional do Master; catálogo M01-M14 |
| [AGENTE-AVALIADOR-CONTESTACAO.md](AGENTE-AVALIADOR-CONTESTACAO.md) | Guia do Avaliador (Tipo B) |
| [PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md) | Guia do Revisor (Tipo B + D) |
| [FLUXO-CHAT-AGENTE.md](FLUXO-CHAT-AGENTE.md) | Fluxo técnico completo (ToolLoopAgent → stream) |
| [PROCESSO-TASKEXECUTION.md](PROCESSO-TASKEXECUTION.md) | Schema das entidades de processo |
| [HUMAN-IN-THE-LOOP.md](HUMAN-IN-THE-LOOP.md) | HITL — aprovação humana |
| [MEMORY-TOOLS.md](MEMORY-TOOLS.md) | Memória persistente entre sessões |
| [ASSISTJUR-PRD-ALINHAMENTO.md](ASSISTJUR-PRD-ALINHAMENTO.md) | Alinhamento com PRD v1.0 (Contencioso Trabalhista) |
| [PLANO-PROXIMOS-PASSOS.md](PLANO-PROXIMOS-PASSOS.md) | Plano de tarefas e estado de implementação |
