# UX/UI — Agente Revisor de Defesas Trabalhistas

Sugestões de especialista para alinhar a interface ao fluxo do Revisor (GATE-1 → FASE A → GATE 0.5 → FASE B → ENTREGA).

**Processo completo (upload → validação → execução em sequência):** ver [Processo do Revisor — Upload, Validação e Execução](processo-revisor-upload-validacao.md).

---

## Implementado

- **Greeting:** Título "Revisor de Defesas Trabalhistas", descrição do papel e instrução "Para começar" (PI + Contestação).
- **Tela inicial simplificada:** As quatro sugestões em bolhas foram **removidas** da tela inicial (0 mensagens, 0 anexos), para não sugerir ações que dependem de anexos (PI + Contestação) antes do utilizador anexar o processo. O foco passa a ser: anexar documentos e usar o hint abaixo do input.
- **Seletor de prompts no chat:** Botão "Sugestões" (ícone de sparkles) na barra do input abre um menu com prompts **contextuais**:
  - **Sempre:** "Explicar o fluxo do Revisor" (informativo).
  - **Com anexos:** "Auditar minha contestação".
  - **Com conversa já iniciada:** "Preparar roteiros de audiência", "Usar base de teses (@bancodetese)".
- **Placeholder do input:** "Cole o texto da Petição Inicial e da Contestação, ou descreva o caso e anexe documentos..."
- **Dialog "Instruções do agente":** Texto explicando que o padrão é o Revisor; placeholder para sobrescrita.
- **Dialog "Base de conhecimento":** Menção a @bancodetese e uso para teses/precedentes.
- **Sidebar:** Nome "Revisor de Defesas" em vez de "Chatbot".
- **Metadata:** Título e descrição da aplicação focados no Revisor.
- **Remoção:** Botão "Deploy with Vercel" do header.
- **Upload de documentos:** Aceita JPEG, PNG, PDF, DOC e DOCX; texto extraído no backend (`unpdf` para PDF, `word-extractor` para DOC, `mammoth` para DOCX) e enviado como parte `document` no contexto do chat.
- **Rótulos PI/Contestação:** Para anexos com texto extraído, o utilizador pode marcar "Petição Inicial" ou "Contestação" no seletor (dropdown) em cada anexo.

---

## Simplificação do processo (upload → validação → execução)

Objetivo: o advogado **sobe todos os arquivos**, a interface **valida se tem as informações necessárias** e só então permite **rodar os prompts em sequência** sem idas e voltas.

### Validação pré-envio (recomendado)

- **Regra:** Para o fluxo do Revisor, são obrigatórios (A) Petição Inicial e (B) Contestação. Validar antes de enviar a primeira mensagem de auditoria.
- **Comportamento sugerido:** Ao submeter, se houver anexos com texto extraído (PDF/DOCX) mas faltar pelo menos um marcado como "Petição Inicial" e um como "Contestação", exibir mensagem de erro **inline** (ex.: "Para auditar a contestação, identifique qual anexo é a Petição Inicial e qual é a Contestação.") e não enviar, ou exibir confirmação ("Ainda não há PI e Contestação identificados. Enviar mesmo assim? O agente pedirá o que faltar.").
- **Alternativa mais rígida:** Exigir que existam exactamente um anexo tipo PI e um tipo Contestação (com texto extraído) para o botão "Enviar" estar activo; caso contrário, botão desactivado e tooltip/aria-describedby explicando o que falta.
- **Acessibilidade (Web Interface Guidelines):** Erros inline junto ao controlo (área de anexos); mensagem de erro com próximo passo; não bloquear paste; botão de submit mantém estado claro (desactivado + motivo, ou activo com aviso).

### Checklist visível "Antes de executar"

- Exibir mini-checklist acima ou abaixo do input, apenas quando o chat estiver vazio ou sem mensagens do agente: "Petição Inicial ✓ / ✗", "Contestação ✓ / ✗", opcionalmente "Base de conhecimento (bancodetese) ✓ / ✗".
- Atualizar os ✓/✗ em tempo real conforme o utilizador anexa e marca os tipos. Assim o advogado vê de relance se pode "auditar" ou se falta algo.

### Fluxo único "Enviar tudo de uma vez"

- (Futuro) Opção de modo "Preparar auditoria": passo 1 — anexar PI; passo 2 — anexar Contestação; passo 3 — opcionais; com validação em cada passo e um único botão "Auditar contestação" no final, que só fica activo quando PI + Contestação estiverem satisfeitos. Reduz ambiguidade e evita envio prematuro.

---

## Sugestões adicionais (futuro)

### Documentos (PI e Contestação)

- **Upload:** JPEG, PNG, PDF, DOC e DOCX já suportados; extração de texto no backend (`unpdf` para PDF, `word-extractor` para DOC, `mammoth` para DOCX); texto injetado como parte `document`. Ver `api/files/upload` e `accept` no cliente.
- **Rótulos por tipo de documento:** Já existente para PDF/DOC/DOCX (dropdown por anexo). Melhoria: destacar anexos ainda "Selecionar tipo" quando há mais de um documento, para incentivar a identificação.
- **Dica visual:** Abaixo do input, texto curto: "Anexe a Petição Inicial e a Contestação (PDF, DOC ou DOCX) e identifique cada uma no menu. Ou cole o texto abaixo."

### Fluxo e confirmação (GATE 0.5)

- **Indicador de etapa:** Quando o agente estiver na FASE A, exibir um pequeno banner ou badge no chat: "FASE A — Extração e mapeamento. Aguardando sua confirmação para gerar os 3 DOCX." Após CONFIRMAR, "FASE B — Gerando documentos."
- **Botões de confirmação:** Se o modelo devolver um bloco estruturado "Resumo para GATE 0.5", o front pode exibir botões "CONFIRMAR" e "CORRIGIR" que enviam essa resposta como mensagem do usuário (ex.: "CONFIRMAR" ou "CORRIGIR: [edição]").

### Acessibilidade e clareza

- **Tooltip no ícone de anexo:** "Anexar documentos (imagens, PDF, DOC, DOCX)".
- **Título da página do chat:** Manter `<title>` como "Revisor de Defesas Trabalhistas" (já feito no layout raiz); em `/chat/[id]` pode acrescentar "Chat" ou o número do processo se vier no futuro.

### Base de conhecimento

- **Template "bancodetese":** Opção "Criar documento de teses" que pré-preenche título "Bancodetese" e um esqueleto (ex.: seções por tema) para o usuário preencher.
- **Badge no header:** Quando houver documentos da base selecionados, mostrar um badge discreto "Base: N itens" ao lado do ícone do livro.

### Entrega dos 3 DOCX

- **Destacando artefatos:** Se o agente usar `createDocument` para os 3 arquivos, garantir que os nomes sigam o padrão (AVALIACAO_DEFESA_..., ROTEIRO_ADVOGADO_..., ROTEIRO_PREPOSTO_...) e que o painel de artefatos deixe claro qual é qual (ícone ou label por tipo).
- **Ressalva visível:** No primeiro DOC (Avaliação), o aviso "Relatório gerado por IA. Revisão humana necessária e obrigatória." deve estar sempre visível no topo; o prompt já orienta isso.

---

## Revisão UX/UI (tela inicial e seletor de prompts)

**Problema:** Na tela inicial apareciam quatro bolhas de prompts (Auditar contestação, Explicar fluxo, Roteiros, @bancodetese). Três delas dependem de anexos ou de análise prévia; mostrar tudo antes de anexar o processo gerava inconsistência e frustração.

**Alterações feitas:**

1. **Remoção das sugestões da tela inicial**  
   Quando não há mensagens nem anexos, a área acima do input fica vazia. O utilizador vê apenas o input, o hint ("Anexe a Petição Inicial e a Contestação...") e o botão de anexos. Fluxo claro: primeiro anexar, depois escolher ação.

2. **Seletor de prompts integrado ao chat**  
   Um botão "Sugestões" (ícone ✨) na barra do input abre um menu com prompts que variam consoante o contexto:
   - Sem anexos: só "Explicar o fluxo do Revisor".
   - Com anexos: "Auditar minha contestação" + "Explicar o fluxo".
   - Com mensagens (conversa iniciada): também "Preparar roteiros de audiência" e "Usar base de teses (@bancodetese)".

3. **Componentes**  
   - `components/prompt-selector.tsx`: dropdown com prompts contextuais.  
   - `components/suggested-actions.tsx`: mantido para referência ou uso futuro (ex.: grid opcional após anexos); não é renderizado na tela inicial.

**Sugestões adicionais de melhoria:**

- **Checklist "Antes de executar":** Mini-checklist acima ou abaixo do input (PI ✓/✗, Contestação ✓/✗) quando o chat está vazio ou sem resposta do agente, atualizada em tempo real ao marcar tipos nos anexos.
- **Validação pré-envio:** Avisar ou bloquear envio da primeira mensagem de auditoria se não houver pelo menos um anexo marcado como PI e um como Contestação.
- **Indicador de etapa:** Banner no chat indicando "FASE A", "Aguardando confirmação (GATE 0.5)" ou "FASE B", conforme o estado da conversa.
- **Botões CONFIRMAR/CORRIGIR:** Quando a resposta contiver o resumo do GATE 0.5, mostrar botões que enviam "CONFIRMAR" ou "CORRIGIR" em vez de o utilizador digitar.

---

## Hierarquia de prioridade

1. **Alto:** Validação pré-envio (PI + Contestação identificados) e feedback inline; checklist "Antes de executar" visível quando aplicável.
2. **Médio:** Indicador de etapa (FASE A / FASE B) e botões CONFIRMAR/CORRIGIR no chat.
3. **Médio:** Reforçar rótulos PI/Contestação (dica abaixo do input, destaque para anexos sem tipo).
4. **Baixo:** Template bancodetese, badge "Base: N itens", refinamentos de artefatos, fluxo "Preparar auditoria" em passos.
