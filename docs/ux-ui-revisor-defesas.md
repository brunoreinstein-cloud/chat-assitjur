# UX/UI — Agente Revisor de Defesas Trabalhistas

Sugestões de especialista para alinhar a interface ao fluxo do Revisor (GATE-1 → FASE A → GATE 0.5 → FASE B → ENTREGA).

---

## Implementado

- **Greeting:** Título "Revisor de Defesas Trabalhistas", descrição do papel e instrução "Para começar" (PI + Contestação).
- **Suggested actions:** Quatro ações contextuais (auditar contestação, explicar fluxo, roteiros, @bancodetese).
- **Placeholder do input:** "Cole o texto da Petição Inicial e da Contestação, ou descreva o caso e anexe documentos..."
- **Dialog "Instruções do agente":** Texto explicando que o padrão é o Revisor; placeholder para sobrescrita.
- **Dialog "Base de conhecimento":** Menção a @bancodetese e uso para teses/precedentes.
- **Sidebar:** Nome "Revisor de Defesas" em vez de "Chatbot".
- **Metadata:** Título e descrição da aplicação focados no Revisor.
- **Remoção:** Botão "Deploy with Vercel" do header.

---

## Sugestões adicionais (futuro)

### Documentos (PI e Contestação)

- **Suporte a PDF (e opcionalmente DOCX):** Hoje o upload aceita só JPEG/PNG. Para o Revisor, permitir PDF (e DOCX) e extrair texto no backend (ex.: `pdf-parse`, `mammoth`) para injetar no contexto. Ajustar `api/files/upload` e o `<input type="file" accept="...">` no cliente.
- **Rótulos por tipo de documento:** Se houver múltiplos anexos, permitir marcar "Petição Inicial" vs "Contestação" (dropdown ou chips) para o agente montar o contexto na ordem correta.
- **Dica visual:** Abaixo do input, texto curto: "Anexe PDF da PI e da Contestação ou cole o texto abaixo."

### Fluxo e confirmação (GATE 0.5)

- **Indicador de etapa:** Quando o agente estiver na FASE A, exibir um pequeno banner ou badge no chat: "FASE A — Extração e mapeamento. Aguardando sua confirmação para gerar os 3 DOCX." Após CONFIRMAR, "FASE B — Gerando documentos."
- **Botões de confirmação:** Se o modelo devolver um bloco estruturado "Resumo para GATE 0.5", o front pode exibir botões "CONFIRMAR" e "CORRIGIR" que enviam essa resposta como mensagem do usuário (ex.: "CONFIRMAR" ou "CORRIGIR: [edição]").

### Acessibilidade e clareza

- **Tooltip no ícone de anexo:** "Anexar documentos (imagens; em breve: PDF)".
- **Título da página do chat:** Manter `<title>` como "Revisor de Defesas Trabalhistas" (já feito no layout raiz); em `/chat/[id]` pode acrescentar "Chat" ou o número do processo se vier no futuro.

### Base de conhecimento

- **Template "bancodetese":** Opção "Criar documento de teses" que pré-preenche título "Bancodetese" e um esqueleto (ex.: seções por tema) para o usuário preencher.
- **Badge no header:** Quando houver documentos da base selecionados, mostrar um badge discreto "Base: N itens" ao lado do ícone do livro.

### Entrega dos 3 DOCX

- **Destacando artefatos:** Se o agente usar `createDocument` para os 3 arquivos, garantir que os nomes sigam o padrão (AVALIACAO_DEFESA_..., ROTEIRO_ADVOGADO_..., ROTEIRO_PREPOSTO_...) e que o painel de artefatos deixe claro qual é qual (ícone ou label por tipo).
- **Ressalva visível:** No primeiro DOC (Avaliação), o aviso "Relatório gerado por IA. Revisão humana necessária e obrigatória." deve estar sempre visível no topo; o prompt já orienta isso.

---

## Hierarquia de prioridade

1. **Alto:** Suporte a PDF (e extração de texto) para PI e Contestação.
2. **Médio:** Indicador de etapa (FASE A / FASE B) e botões CONFIRMAR/CORRIGIR no chat.
3. **Médio:** Rótulos "Petição Inicial" / "Contestação" em anexos.
4. **Baixo:** Template bancodetese, badge "Base: N itens", refinamentos de artefatos.
