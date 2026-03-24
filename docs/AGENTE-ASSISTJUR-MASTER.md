# Agente AssistJur.IA Master

Documentação do agente unificado de **análise processual trabalhista** com 14 módulos especializados.

---

## 1. O que é

O **AssistJur.IA Master** é um agente unificado que concentra 14 módulos de análise processual trabalhista num único assistente. Ativa automaticamente o módulo correto por comando do utilizador (`/relatorio-master`, `/carta-prognostico`, etc.) ou por inferência do contexto.

**Princípio fundamental:** melhor vazio que errado — tolerância zero a alucinações; campos não encontrados ficam em branco ou "Não localizado". Nunca entrega relatório no chat; sempre gera documento via `createMasterDocuments`.

---

## 2. Catálogo de módulos

| # | Módulo | Comando | Entregável | Uso |
|---|--------|---------|------------|-----|
| M01 | Relatório Processual | `/relatorio-processual` | DOCX | Modelo genérico |
| M02 | Carta de Prognóstico | `/carta-prognostico` | DOCX | Risco/provisão/CPC 25 |
| M03 | Relatório Master | `/relatorio-master` | DOCX | Universal (cinza/dourado) |
| M04 | Relatório DPSP | `/relatorio-dpsp` | DOCX | Drogaria São Paulo |
| M05 | Formulário OBF | `/obf` | Formulário estruturado | GPA — Obrigação de Fazer |
| M06 | Ficha Apólice/Garantia | `/ficha-apolice` | DOCX | GPA/Autuori |
| M07 | Auditoria Corporativa | `/auditoria` | DOCX (15-20 pág.) + XLSX | Due Diligence |
| M08 | Cadastro eLaw | `/cadastro-elaw` | XLSX (2 abas) | Upload sistema eLaw |
| M09 | Encerramento | `/encerramento` | XLSX | Relatório de Encerramento |
| M10 | Análise Aquisição Créditos | `/aquisicao-creditos` | XLSX (12 abas) | Fundos/Securitizadoras |
| M11 | Análise Estratégica TST | `/analise-tst` | DOCX (parecer) | Fase recursal superior |
| M12 | Relatório Modelo BR | `/modelo-br` | DOCX (50 campos, 6-10 pág.) | Simplificado |
| M13 | Relatório Completo A-P | `/completo` | DOCX (250 campos, 30-50 pág.) | Master detalhado |
| M14 | Extração de Cálculos | `/extracao-calculos` | JSON estruturado | Liquidação/Execução |

### Inferência automática de módulo

Se o utilizador não especificar comando, o agente infere pelo contexto. Exemplos:
- "carta de prognóstico" / "risco" / "provisão" → M02
- "relatório master" / "relatório completo" → M03
- "auditoria" / "due diligence" → M07
- "cadastro" / "eLaw" / "upload" → M08
- "TST" / "recurso de revista" → M11
- Se ambíguo → pergunta qual módulo ativar.

---

## 3. Pipeline multi-chamadas (PDFs grandes)

Para processos com PDFs extensos (>500 páginas, ex.: cópia integral PJe), o agente usa a tool `analyzeProcessoPipeline`:

1. **Divisão em blocos** — o PDF é segmentado em blocos temáticos (ex.: petição, contestação, sentença, recursos).
2. **Análise por bloco** — cada bloco é analisado numa chamada separada ao LLM.
3. **Consolidação** — os resultados são combinados num único entregável.

Isso evita truncamento de contexto e garante cobertura completa de processos longos.

---

## 4. Geração de documentos (createMasterDocuments + ZIP)

A tool `createMasterDocuments` é a única forma de entrega de relatórios — **nunca no chat**.

- Gera ficheiros nos formatos definidos por módulo: DOCX, XLSX ou JSON.
- Quando há múltiplos ficheiros (ex.: M07 gera DOCX + XLSX), disponibiliza também download em **ZIP**.
- `maxOutputTokens: 16000` (o default global de 8192 trunca o tool call JSON em relatórios longos como M13 com 250 campos).
- Após geração, o agente responde no chat apenas com confirmação e links de download.

---

## 5. Human-in-the-Loop (HITL)

O Master tem `useApprovalTool: true`. Para ações irreversíveis (ex.: submeter peça, enviar comunicação externa), o agente pode pausar e solicitar aprovação explícita via `requestApproval` antes de prosseguir.

---

## 6. Quando usar vs. outros agentes

| Cenário | Agente recomendado |
|---------|-------------------|
| Preparar audiência (PI + Contestação) | **Revisor de Defesas** |
| Redigir contestação | **Redator de Contestações** |
| Avaliar qualidade de contestação | **Avaliador de Contestação** |
| Gerar relatório processual completo (M01–M14) | **AssistJur.IA Master** |
| Conversa livre / pesquisa / rascunhos | **Assistente Geral** |

---

## 7. Referência técnica

| Componente | Ficheiro |
|------------|---------|
| Instruções do agente | `lib/ai/agent-assistjur-master-instructions.md` (carregado por `agent-assistjur-master.ts`) |
| Registry + config | `lib/ai/agents-registry.ts` (`AGENT_ID_ASSISTJUR_MASTER`) |
| Tool de documentos | `lib/ai/tools/create-master-documents.ts` |
| Tool de pipeline | `lib/ai/tools/analyze-processo-pipeline.ts` |
| Flags activas | `useMasterDocumentsTool`, `usePipelineTool`, `useApprovalTool`, `useMemoryTools` |
| Modelos permitidos | `nonReasoningChatModelIds` (reasoning desativa tools → sem documento gerado) |
| `maxOutputTokens` | `16000` (necessário para M13: 250 campos, 30-50 pgs) |
| `agentId` na API | `assistjur-master` |
