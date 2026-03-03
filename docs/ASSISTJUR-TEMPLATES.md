# Templates do AssistJur.IA Master

Onde guardar os templates DOCX (em formato texto) no projeto e como o agente os referencia.

## Onde guardar no projeto

| Local | Uso |
|-------|-----|
| **`lib/ai/templates/assistjur/`** | Templates oficiais do agente (estrutura em .txt ou .md). Ficheiros como `RELATORIO_PROCESSUAL_MASTER.txt`, `CARTA_PROGNOSTICO.txt`, `RELATORIO_DPSP.txt`. |

Detalhes e lista de ficheiros sugeridos por módulo: **[lib/ai/templates/assistjur/README.md](../lib/ai/templates/assistjur/README.md)**.

## Como o agente referencia os templates

1. **Base de conhecimento (recomendado)**  
   O utilizador importa o ficheiro de `lib/ai/templates/assistjur/` para a **Base de conhecimento** (sidebar do chat) e seleciona-o na conversa. O conteúdo é injetado no prompt na secção *"Base de conhecimento (documentos selecionados pelo utilizador)"*. O agente usa esse conteúdo como **estrutura obrigatória** e preenche os campos com os dados extraídos dos autos.

2. **Estrutura na instrução**  
   Se nenhum template for selecionado na Base de conhecimento, o agente segue a estrutura descrita na instrução do agente para o módulo ativo (ex.: M03 — 20 secções do Relatório Processual Master).

3. **Prioridade**  
   Template na Base de conhecimento tem **prioridade** sobre a estrutura genérica da instrução.

## Fluxo recomendado para o operador

1. Importar uma vez os templates necessários de `lib/ai/templates/assistjur/` para a Base de conhecimento (ou usar documentos já existentes com título claro, ex.: "Template Relatório Processual Master").
2. No chat, selecionar o agente **AssistJur.IA Master** e os documentos de template na sidebar.
3. Enviar o PDF do processo e o comando (ex.: `/relatorio-master`). O agente gera o relatório seguindo o template selecionado e entrega via createDocument (exportável como DOCX no editor).

## Export DOCX com layout completo

Ao exportar um documento de texto como DOCX, é possível obter **layout completo** (paleta AssistJur: cinza/dourado, cabeçalho e rodapé):

- **Na UI:** No artefacto de texto, usar a ação **"DOCX (layout Master)"** em vez de **"DOCX"**. O ficheiro descarregado terá secções `##` com fundo charcoal e texto branco, `###` em dourado, primeira linha de tabelas com fundo charcoal, e cabeçalho/rodapé "RELATÓRIO PROCESSUAL MASTER | [título]" e "CONFIDENCIAL — BR Consultoria | AssistJur.IA | Revisão humana obrigatória".
- **Na API:** `GET /api/document/export?id=xxx&layout=assistjur-master`.

O conteúdo do documento deve usar as convenções já suportadas: `##` e `###` para títulos, linhas com `\t` ou ` | ` para tabelas de 2 colunas. Ver `lib/document-to-docx.ts` e `docs/PROJETO-REVISOR-DEFESAS.md` (secção conversão texto → DOCX).

## Nota sobre ficheiros DOCX

O repositório guarda apenas a **versão texto** da estrutura (para versionamento e injeção no prompt). O DOCX original (ex.: `RELATORIO_PROCESSUAL_MASTER_1001563-61_v4.docx`) pode ficar em partilha interna; o utilizador exporta o artefacto gerado como DOCX a partir do editor (com ou sem layout Master).
