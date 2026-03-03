# Templates AssistJur.IA Master

Esta pasta contém os **templates oficiais** do agente AssistJur.IA Master (estrutura e campos dos relatórios). O agente usa estes ficheiros como referência de estrutura quando não houver template selecionado na Base de conhecimento.

## Formato

- **Ficheiros .txt ou .md** — Estrutura/lista de campos extraída do DOCX original (títulos de secção, placeholders, ordem).
- O conteúdo é carregado pelo sistema ou importado na **Base de conhecimento** para o agente preencher com dados dos autos.

## Ficheiros esperados (por módulo)

| Módulo | Ficheiro sugerido | Uso |
|--------|-------------------|-----|
| M01 Relatório Processual | `RELATORIO_PROCESSUAL.txt` | Modelo genérico cliente |
| M02 Carta de Prognóstico | `CARTA_PROGNOSTICO.txt` | Autuori & Burmann |
| M03 Relatório Processual Master | `RELATORIO_PROCESSUAL_MASTER.txt` | Universal (cinza/dourado) |
| M04 Relatório DPSP | `RELATORIO_DPSP.txt` | Drogaria São Paulo |
| M07 Auditoria | `AUDITORIA_360.txt` | Corporativo |
| M12 Modelo BR | `MODELO_BR.txt` | Simplificado (50 campos) |

Outros módulos (M05 OBF, M06 Ficha Apólice, M08 eLaw, etc.) podem ter ficheiros adicionados conforme necessidade.

## Como o agente referencia os templates

1. **Base de conhecimento (recomendado)**  
   O utilizador importa o ficheiro desta pasta para a Base de conhecimento (sidebar do chat) e seleciona-o na conversa. O conteúdo é injetado no prompt na secção "Base de conhecimento (documentos selecionados pelo utilizador)". O agente deve usar **esse conteúdo como estrutura obrigatória** — preencher cada campo/secção com os dados extraídos dos autos, sem alterar rótulos nem ordem.

2. **Estrutura na própria instrução**  
   Para módulos como M03 (Relatório Processual Master), a instrução do agente já descreve as 20 secções e a régua de momentos. O agente pode gerar o relatório seguindo essa descrição. Quando existir ficheiro de template na Base de conhecimento, ele tem prioridade sobre a descrição genérica.

3. **Regra**  
   Se o utilizador tiver selecionado documento(s) na Base de conhecimento cujo título ou conteúdo indique ser um template (ex.: "Template Relatório Processual Master", "Carta de Prognóstico", "Estrutura RELATÓRIO DPSP"), usar **sempre** esse conteúdo como estrutura. Caso contrário, seguir a estrutura definida na instrução para o módulo ativo.

## Como adicionar um novo template

1. Obter o DOCX oficial do módulo (ex.: do cliente ou da BR Consultoria).
2. Extrair a estrutura em texto: secções, títulos, lista de campos, placeholders. Guardar como `.txt` ou `.md` nesta pasta (ex.: `RELATORIO_PROCESSUAL_MASTER.txt`).
3. Opcional: importar o ficheiro na Base de conhecimento (uma vez por ambiente ou por utilizador) para que o agente o use quando o utilizador o selecionar no chat.

## Nota sobre DOCX binário

O repositório guarda apenas a **versão texto** da estrutura (para versionamento e injeção no prompt). O ficheiro DOCX original (ex.: `RELATORIO_PROCESSUAL_MASTER_1001563-61_v4.docx`) pode ficar em partilha interna ou na máquina do operador; a geração do DOCX final pode ser feita pelo editor de artefactos (exportar como DOCX) ou por uma ferramenta futura de preenchimento de DOCX.
