# Avaliação: Upload → Arquivos → Conhecimento e Chat → Conhecimento

Avaliação da proposta de fluxo: **ao fazer upload de ficheiros no chat**, permitir (1) **guardar em Arquivos**, (2) **transformar arquivos em conhecimento** e (3) **transformar o chat em conhecimento**. Este documento serve como referência para decisão de produto e design técnico.

**Data:** 2026-03  
**Estado:** Fases 1, 2 e 3 implementadas. Guardar em Arquivos; Arquivos → Conhecimento; Chat → Conhecimento (última resposta do assistente, com aviso de reutilização).

---

## 1. Resumo da proposta

| Etapa | Descrição |
|-------|-----------|
| **Guardar em Arquivos** | Ao anexar ficheiros no chat, o utilizador pode opcionalmente “Guardar em Arquivos” — ficando com uma biblioteca de ficheiros do utilizador, reutilizável. |
| **Arquivos → Conhecimento** | A partir da biblioteca “Arquivos”, o utilizador pode escolher ficheiros e “Adicionar à base de conhecimento” (criar KnowledgeDocuments com extração + RAG). |
| **Chat → Conhecimento** | Possibilidade de “guardar esta conversa” (ou parte dela) como documento na base de conhecimento, para reutilização em outros chats. |

---

## 2. Avaliação por componente

### 2.1 Guardar em Arquivos

**Faz sentido?** **Sim.**

- **Problema atual:** Anexos do chat ficam apenas na mensagem (URL no Storage + texto extraído na parte `document`). Não existe um sítio único “os meus ficheiros” para reutilizar o mesmo documento noutro chat ou mais tarde.
- **Valor:** Biblioteca de uploads por utilizador (“Arquivos”); reutilizar o mesmo ficheiro em vários chats sem novo upload; alinha com a ideia de **Document Organizer** (extrair, organizar, rastrear) em [KNOWLEDGE-BASE-SIDEBAR-DOCUMENT-ORGANIZER.md](KNOWLEDGE-BASE-SIDEBAR-DOCUMENT-ORGANIZER.md).
- **Modelo de dados sugerido:** Nova entidade **Arquivo** (ex.: `UserFile`): `id`, `userId`, `pathname` (caminho no Storage), `filename`, `contentType`, `createdAt`, opcionalmente `extractedText` em cache. **Não duplicar** o blob no Storage: o ficheiro já está em Supabase/Blob; “Arquivos” é uma camada de metadados + referência que permite listar, filtrar e depois “transformar em conhecimento”.
- **UX:** No chat, após upload (ou na lista de anexos), ação “Guardar em Arquivos”. Numa vista “Arquivos” (ou na sidebar de conhecimento), listar os ficheiros guardados e permitir “Adicionar à base de conhecimento”.

**Conclusão:** Recomendado. Encara-se como extensão natural do Document Organizer e da base de conhecimento.

---

### 2.2 Transformar arquivos em conhecimento

**Faz sentido?** **Sim.**

- **Problema atual:** Para ter um ficheiro na base de conhecimento é preciso fazer upload **dentro** da base de conhecimento (sidebar/modal) via `POST /api/knowledge/from-files`. Não há “pegue neste ficheiro que já guardei e torne-o conhecimento”.
- **Valor:** O utilizador guarda ficheiros em “Arquivos” (incluindo a partir do chat) e depois escolhe quais passar a conhecimento. Reutiliza a pipeline existente: extração de texto (ou uso de `extractedText` em cache), criação de `KnowledgeDocument`, chunking e embeddings (RAG).
- **Implementação:** Nova rota ou fluxo do tipo “from-file-ids”: receber uma lista de IDs de Arquivos; para cada um, obter o ficheiro (pathname → fetch do Storage ou conteúdo em cache), correr a mesma lógica que `from-files` (extração se necessário, `createKnowledgeDocument`, chunks, embeddings). A UI em “Arquivos” teria “Adicionar à base de conhecimento” (um ou vários).

**Conclusão:** Recomendado. É um segundo ponto de entrada para a base de conhecimento, coerente com o produto.

---

### 2.3 Chat em conhecimento

**Faz sentido?** **Sim, com definição clara de escopo e avisos.**

- **Valor:** Guardar conclusões, resumos ou Q&A de uma conversa para usar noutros chats (ex.: “resumo desta revisão”, “teses usadas”, “pergunta e resposta sobre este contrato”). Aumenta reutilização e aprendizagem.
- **Riscos e requisitos:**
  - **Sigilo e reutilização:** O conteúdo do chat pode ser confidencial (caso concreto, partes, estratégia). Ao guardar como conhecimento, esse conteúdo passará a poder ser injetado como contexto noutras conversas. É essencial: (a) aviso explícito na UI (“Este conteúdo passará a ser usado como contexto noutros chats”); (b) preferência por “guardar resumo” ou “guardar resposta do assistente” em vez de guardar o thread inteiro por defeito.
  - **Definição de produto:** O que exactamente se guarda?
    - **Opção A:** Resumo da conversa (uma chamada ao LLM: “Gera um resumo estruturado desta conversa” → criar KnowledgeDocument com esse texto).
    - **Opção B:** Conteúdo completo do chat (todas as mensagens em texto) — mais simples, mas mais volumoso e com maior risco de incluir dados sensíveis.
    - **Opção C:** Apenas a última resposta do assistente (ou mensagens seleccionadas pelo utilizador).
  - Recomendação: começar por **Opção A (resumo)** ou **Opção C (resposta do assistente / seleção)**, com aviso claro de reutilização e, se possível, escolha de pasta na base de conhecimento.

**Conclusão:** Faz sentido como funcionalidade, com escopo definido (resumo vs. thread vs. resposta) e avisos de privacidade/reutilização. Implementação técnica é viável (mensagens já estão em BD; criar `KnowledgeDocument` com o texto escolhido e pipeline RAG existente).

---

## 3. Resumo da avaliação

| Ideia | Faz sentido? | Prioridade sugerida | Notas |
|-------|--------------|---------------------|--------|
| **Guardar em Arquivos** | Sim | Alta | Nova entidade “Arquivos” (metadados + ref. Storage); botão/ação no chat “Guardar em Arquivos”. |
| **Arquivos → Conhecimento** | Sim | Alta | Fluxo “from-file-ids” + mesma pipeline de from-files; UI em “Arquivos”: “Adicionar à base de conhecimento”. |
| **Chat → Conhecimento** | Sim, com cuidado | Média | Definir: resumo vs. thread vs. resposta; aviso de reutilização; usar pipeline RAG existente. |

---

## 4. Encadeamento no produto

Fluxo proposto:

1. **Upload no chat** → ficheiro vai para Storage e para a mensagem (como hoje).
2. **“Guardar em Arquivos”** (opcional) → cria registo em Arquivos (pathname, nome, etc.).
3. **Em “Arquivos”** → utilizador pode “Adicionar à base de conhecimento” (um ou vários) → cria KnowledgeDocuments + RAG.
4. **“Guardar chat em conhecimento”** (futuro) → gera resumo ou conteúdo seleccionado → cria KnowledgeDocument → RAG.

Assim, **Arquivos** funciona como camada intermédia entre “ficheiro anexado ao chat” e “documento na base de conhecimento”, e o chat pode alimentar a base de conhecimento de forma controlada.

---

## 5. Próximos passos sugeridos

1. **Produto:** Decidir se “Arquivos” entra no roadmap (ex. Fase 4 ou 5 da SPEC) e onde aparece na UI (sidebar, separador, etc.).
2. **Design:** Especificar modelo de dados de “Arquivos” (tabela, campos, relação com Storage) e fluxos “Guardar em Arquivos” e “Arquivos → Conhecimento”.
3. **Chat → Conhecimento:** Definir variante (resumo / resposta / seleção), texto de aviso e local na UI (ex. menu da conversa ou do header).
4. **Implementação:** Fase 1 — Arquivos + “Guardar em Arquivos” no chat; Fase 2 — “Arquivos → Conhecimento”; Fase 3 — “Chat → Conhecimento” com resumo ou resposta e avisos.

---

*Este documento pode ser atualizado quando houver decisão de produto ou alteração de prioridades (ex. em PLANO-PROXIMOS-PASSOS.md ou SPEC-AI-DRIVE-JURIDICO.md).*
