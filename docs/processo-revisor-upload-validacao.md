# Processo do Revisor de Defesas — Upload, Validação e Execução em Sequência

Documentação do fluxo que o advogado segue ao usar o Revisor: **subir todos os arquivos → validar se há informações necessárias → executar os prompts em sequência**.

---

## 1. Visão geral do processo

```text
┌──────────────────┐    ┌─────────────────────┐    ┌────────────────────────────┐
│ 1. UPLOAD         │ →  │ 2. VALIDAÇÃO         │ →  │ 3. EXECUÇÃO EM SEQUÊNCIA    │
│ Advogado anexa    │    │ Garantir PI +        │    │ GATE-1 → FASE A → GATE 0.5  │
│ PI, Contestação  │    │ Contestação presentes│    │ → FASE B → ENTREGA          │
│ (e opcionais)     │    │ e identificadas      │    │ (prompts orientam o agente) │
└──────────────────┘    └─────────────────────┘    └────────────────────────────┘
```

- **Upload:** O advogado anexa ficheiros (PDF, DOC, DOCX, imagens) no input do chat e, para cada documento com texto extraído, pode marcar o tipo: **Petição Inicial** ou **Contestação**.
- **Validação:** Para o fluxo do Revisor rodar em sequência sem parar no meio, é necessário que **(A) Petição Inicial** e **(B) Contestação** estejam presentes e, idealmente, identificados (rótulos PI/Contestação).
- **Execução:** O agente segue as instruções em `lib/ai/agent-revisor-defesas.ts`: valida GATE-1 (A+B), executa FASE A (extração/mapeamento), exibe resumo para GATE 0.5, aguarda CONFIRMAR/CORRIGIR, depois FASE B (geração dos 3 DOCX) e ENTREGA.

---

## 2. Entradas necessárias para rodar os prompts em sequência

### Obrigatórias (GATE-1)

| Entrada | Descrição | Como o advogado entrega |
| ------- | --------- | ----------------------- |
| **(A) Petição Inicial** | Texto da peça inicial do reclamante | Upload de PDF/DOC/DOCX (ou colar texto) + marcar tipo "Petição Inicial" |
| **(B) Contestação** | Texto da contestação do reclamado | Upload de PDF/DOC/DOCX (ou colar texto) + marcar tipo "Contestação" |

Se **falta (A) ou (B)**, o agente **para** e pede ao usuário que envie o que falta. Não avança para FASE A nem gera os 3 DOCX.

### Opcionais

| Entrada | Descrição | Uso |
| ------- | --------- | --- |
| **(C) Documentos do reclamante** | Provas/anexos da parte reclamante | Contexto adicional |
| **(D) Documentos do reclamado** | Provas/anexos do reclamado | Contexto adicional |
| **(E) @bancodetese** | Base de conhecimento com teses/precedentes | Quadro de teses no Doc 1 (Avaliação) |

---

## 3. Onde ocorre a validação hoje

- **No agente (LLM):** As instruções do Revisor exigem GATE-1: "Obrigatórios: (A) Petição Inicial e (B) Contestação → se faltar, PARAR." O modelo interpreta as partes da mensagem (texto com rótulos `[Petição Inicial: ...]` e `[Contestação: ...]` após normalização no `route.ts`) e decide se pode seguir ou se deve solicitar o que falta.
- **No backend (`route.ts`):** As partes do tipo `document` são ordenadas (PI antes de Contestação) e convertidas em texto com rótulo. Não há bloqueio HTTP por “falta de PI ou Contestação”; o fluxo sempre segue e o LLM devolve mensagem pedindo os documentos.
- **No frontend:** Não há validação pré-envio que impeça o envio quando falta PI ou Contestação. O advogado pode enviar só um arquivo ou nenhum rótulo; o agente então responde pedindo o que falta.

Consequência: o advogado **pode** enviar a mensagem sem ter tudo e só então descobrir que falta algo, gerando uma troca de mensagens extra. Simplificar o processo implica **validar antes de enviar** (ver secção 6).

---

## 4. Sequência de execução dos prompts (fluxo do agente)

A ordem é definida nas instruções do agente; não há máquina de estados no código, apenas o LLM seguindo o texto.

| Ordem | Etapa | O que acontece |
| ----- | ----- | --------------- |
| 1 | **GATE-1** | Verificar se (A) PI e (B) Contestação estão presentes. Se não, **PARAR** e pedir ao usuário. |
| 2 | **FASE A** | Extrair dados do processo, mapear pedidos, impugnações, teses. **Não** gerar os 3 DOCX. |
| 3 | **GATE 0.5** | Exibir no chat um resumo delimitado por `--- GATE_0.5_RESUMO ---` … `--- /GATE_0.5_RESUMO ---` e **aguardar** o usuário: CONFIRMAR ou CORRIGIR. |
| 4 | **FASE B** | Após CONFIRMAR, gerar os três documentos (Avaliação, Roteiro Advogado, Roteiro Preposto) via ferramenta `createDocument`. |
| 5 | **ENTREGA** | Entregar referências aos documentos e reforçar ressalvas (revisão humana obrigatória no Doc 1). |

Para “rodar os prompts em sequência” sem interrupção, o advogado deve já ter enviado **PI + Contestação** (e opcionalmente C, D, E) e, quando o agente mostrar o resumo do GATE 0.5, responder **CONFIRMAR** (ou CORRIGIR com edição) para disparar a FASE B.

---

## 5. Checklist “Antes de executar” (para o advogado)

Antes de enviar a primeira mensagem para auditar a contestação:

1. [ ] **Petição Inicial** anexada e, se possível, marcada como "Petição Inicial" no seletor.
2. [ ] **Contestação** anexada e marcada como "Contestação" no seletor.
3. [ ] (Opcional) Documentos adicionais (reclamante/reclamado) anexados se necessário.
4. [ ] (Opcional) Base de conhecimento com @bancodetese selecionada no header, se quiser quadro de teses no Doc 1.

Se 1 e 2 estiverem ok, o agente tende a passar do GATE-1 direto para a FASE A e depois para o GATE 0.5, sem pedir documentos em mensagens adicionais.

---

## 6. Melhorias sugeridas (simplificar o processo)

Para que “subir todos os arquivos → validar → rodar em sequência” seja mais claro e menos sujeito a idas e voltas:

1. **Validação pré-envio na UI**  
   Antes de enviar, verificar se existe pelo menos um anexo (ou parte de texto) identificado como **Petição Inicial** e pelo menos um como **Contestação**. Se faltar, exibir mensagem clara (ex.: “Para auditar a contestação, anexe e identifique a Petição Inicial e a Contestação”) e opcionalmente desabilitar ou avisar ao clicar em enviar.

2. **Indicador de etapa no chat**  
   Mostrar em que fase o agente está (ex.: “FASE A — Extração e mapeamento” / “Aguardando sua confirmação para gerar os 3 DOCX” / “FASE B — Gerando documentos”), para o advogado saber quando deve CONFIRMAR ou apenas aguardar.

3. **Botões CONFIRMAR / CORRIGIR**  
   Quando a resposta do modelo contiver o bloco `--- GATE_0.5_RESUMO ---` … `--- /GATE_0.5_RESUMO ---`, o frontend pode exibir botões "CONFIRMAR" e "CORRIGIR" que enviam a mensagem correspondente, em vez de o advogado ter de digitar.

4. **Fluxo “upload único” (futuro)**  
   Opção de tela ou passo a passo: “Envie todos os arquivos desta causa” (PI, Contestação, opcionais), com validação em tempo real (ex.: ícones ✓ ao lado de “Petição Inicial” e “Contestação” quando preenchidos), e um único botão “Auditar contestação” que só fica ativo quando PI + Contestação estiverem satisfeitos.

Detalhes de UX/UI e priorização estão em `docs/ux-ui-revisor-defesas.md`.

---

## 7. Velocidade do upload

O tempo total de upload depende do tamanho do ficheiro, da rede e do processamento no servidor (extração de texto em PDF/DOC/DOCX). Seguem as otimizações aplicadas e dicas para o utilizador.

### O que já está otimizado

- **Upload e extração em paralelo (ficheiros &lt; 4,5 MB):** No `POST /api/files/upload`, o envio do ficheiro para o storage (Supabase ou Vercel Blob) e a extração de texto (PDF/DOC/DOCX) correm em paralelo. O tempo total é o **máximo** dos dois, e não a soma, o que reduz a latência sentida especialmente em documentos grandes.
- **Upload direto para ficheiros &gt; 4,5 MB:** O browser envia o ficheiro diretamente para o Vercel Blob (sem passar pelo body da função serverless), evitando o limite de 4,5 MB e reduzindo carga no servidor. O processamento (extração e persistência em Supabase) ocorre depois, em `/api/files/process`.
- **Múltiplos ficheiros:** Vários anexos (ex.: colar várias imagens) são enviados em paralelo (`Promise.all`), não em sequência.
- **PDFs de tamanho enorme (até 100 MB):** As rotas de upload e de processamento estão preparadas para PDFs muito grandes:
  - **Tempo de execução:** `maxDuration = 300` (5 min) nas rotas `/api/files/upload` e `/api/files/process`, para permitir extração de PDFs com muitas páginas ou OCR (na Vercel Pro o limite pode ser até 800 s).
  - **Descarregamento do Blob:** O fetch ao Vercel Blob em `/api/files/process` usa um timeout de 3 minutos (`BLOB_FETCH_TIMEOUT_MS`), para que ficheiros grandes não falhem por timeout durante a transferência.
  - **OCR (PDFs digitalizados):** Até 50 páginas são processadas por OCR (antes 15); o texto extraído é truncado a ~600k caracteres para manter a resposta utilizável.
  - **Texto extraído:** Limite de caracteres aumentado para ~600k por documento (PI ou Contestação), suficiente para peças muito longas.
  - **Requisito:** Para PDFs &gt; 4,5 MB é obrigatório ter `BLOB_READ_WRITE_TOKEN` configurado (upload direto). O tamanho máximo aceite é 100 MB.

### Como o utilizador pode “acelerar”

- **Ficheiros &lt; 4,5 MB:** Já beneficiam do paralelismo upload + extração; não é necessário alterar nada.
- **Ficheiros grandes:** Garantir que `BLOB_READ_WRITE_TOKEN` está configurado para usar upload direto; caso contrário o body pode falhar (413) ou o upload ser rejeitado.
- **Reduzir tamanho quando possível:** PDFs com muitas páginas ou imagens pesadas aumentam o tempo de envio e de extração. Comprimir ou reduzir resolução (em imagens) antes de anexar pode ajudar.
- **Rede:** Uploads em redes lentas ou instáveis demoram mais; o tempo é dominado pelo envio dos bytes. Em redes rápidas, o paralelismo no servidor é o que mais reduz o tempo até a resposta.

### Possíveis melhorias futuras

- **Streaming no processamento de ficheiros grandes:** Em `/api/files/process`, o servidor faz `fetch(blobUrl)` e depois `arrayBuffer()`, o que carrega o ficheiro todo em memória (até 100 MB). Para ficheiros ainda maiores, poderia avaliar streaming ou processamento em background (ex.: Trigger.dev) para evitar timeout e pico de memória.
- **Compressão no cliente:** Para imagens (JPEG/PNG), compressão no browser antes do envio reduz tamanho e tempo de upload; exigiria uma biblioteca de compressão e decisão de qualidade.

---

## 8. Resolução de problemas — Upload

Se o upload falhar, a interface mostra uma mensagem de erro (toast). Causas comuns:

| Sintoma | Causa provável | O que fazer |
| ------- | -------------- | ----------- |
| «Não autorizado» | Sessão inexistente ou expirada | Inicie sessão e tente novamente. |
| «O arquivo deve ter no máximo 100 MB» | Ficheiro demasiado grande (validação no servidor) | Use um ficheiro &lt; 100 MB ou divida o conteúdo. |
| «Ficheiro demasiado grande...» (413) | Body do request &gt; 4,5 MB (limite Vercel) | Ficheiros &gt; 4,5 MB usam **upload direto** cliente → Vercel Blob (automático se `BLOB_READ_WRITE_TOKEN` estiver configurado). Caso contrário, use um ficheiro &lt; 4,5 MB. |
| «Tipos aceitos: JPEG, PNG, PDF, DOC ou DOCX» | Tipo de ficheiro não suportado (ou MIME incorreto) | Envie apenas JPEG, PNG, PDF, DOC ou DOCX. O servidor aceita também por extensão quando o browser envia tipo vazio (ex.: em produção). |
| «Falha ao enviar o ficheiro para o Storage» / «Bucket not found» | Supabase Storage não configurado ou bucket em falta | Defina `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` e crie o bucket (ex.: `chat-files`) em Supabase Dashboard → Storage, ou execute `pnpm run supabase:config-push`. |
| «Configure Supabase Storage... ou BLOB_READ_WRITE_TOKEN» | Nem Supabase nem Vercel Blob configurados | Configure Supabase (ver acima) ou defina `BLOB_READ_WRITE_TOKEN` para usar Vercel Blob. |
| Botão de anexos desativado | O chat está a enviar ou a receber resposta | Aguarde o estado «pronto» (resposta do modelo terminada) para anexar. |

**Ficheiros maiores que 4,5 MB:** o cliente detecta o tamanho e, quando o ficheiro excede 4,5 MB, usa **upload direto** para Vercel Blob (o ficheiro vai do browser para o Blob sem passar pelo servidor). Em seguida o servidor processa o ficheiro no Blob (extração de texto, classificação PI/Contestação) e persiste uma cópia no Supabase. **Requisito:** definir `BLOB_READ_WRITE_TOKEN` no projeto (Vercel → Storage → Blob store → a variável é criada ao ligar o store ao projeto). Se não estiver configurado, a interface mostra: «Upload de ficheiros grandes não está configurado… Use um ficheiro com menos de 4,5 MB.» Rotas: `GET /api/files/upload-token` (verifica disponibilidade), `POST /api/files/upload-token` (gera token) e `POST /api/files/process` (processa após upload). Ver [Vercel – Upload directly to the source](https://vercel.com/guides/how-to-bypass-vercel-body-size-limit-serverless-functions#upload-directly-to-the-source).

**Em produção (Word não envia):** alguns browsers ou ambientes enviam ficheiros .doc/.docx com tipo MIME vazio ou `application/octet-stream`. O servidor passou a aceitar estes ficheiros pela extensão do nome (`.doc`, `.docx`) e a inferir o tipo para extração e storage. Se continuar a falhar, verifique o tamanho (≤ 4,5 MB se não usar upload direto).

**Por que continua a dar erro em produção?** A mensagem «Upload de ficheiros grandes não está configurado» significa que a variável `BLOB_READ_WRITE_TOKEN` **não está disponível** na função serverless em runtime. Confirme: (1) **Vercel** → **Settings** → **Environment Variables**: existe `BLOB_READ_WRITE_TOKEN` (nome exato, sem repetir `_READ_WRITE_TOKEN`) com **Production** assinalado? (2) O Blob store está **ligado a este projeto** (Storage → store → Add to project)? (3) Depois de adicionar ou alterar a variável, fez **Redeploy** do deployment de Production? (As env vars são injetadas no deploy; sem redeploy a função não vê a variável.) Para confirmar em produção se o token está definido, abra no browser: `https://seu-dominio.vercel.app/api/files/blob-status` — se devolver `blobConfigured: false`, a variável não está a chegar à função.

**Erro ao clicar CONFIRMAR (FASE B) em produção:** ao confirmar o resumo do GATE 0.5, o agente gera os 3 DOCX (FASE B). Se aparecer «Ocorreu um erro ao gerar os documentos»: (1) **Vercel** → **Deployments** → o deployment em causa → **Functions** → logs da função `/api/chat`: procure por `[chat] onError (produção):` para ver a mensagem e stack do erro. (2) Causas comuns: **modelos em falta** — os ficheiros `lib/ai/modelos/*.txt` devem ser incluídos no deploy (o projeto usa `outputFileTracingIncludes` em `next.config.ts` para o route `/api/chat`); **base de dados** — `POSTGRES_URL` definida para Production e migrações aplicadas; **IA** — `AI_GATEWAY_API_KEY` (ou provider configurado) válida; **timeout** — a rota tem `maxDuration = 120`; se a geração dos 3 documentos demorar mais, considere aumentar o plano ou otimizar. Depois de corrigir variáveis ou configuração, faça **Redeploy** de Production.

**Em desenvolvimento:** se o servidor devolver um campo `detail` no erro, a mensagem do toast inclui esse pormenor para facilitar o debug.

**Alternativa quando o PDF não é processado:** se o upload concluir mas o texto do PDF não for extraído, aparece o aviso «Texto não extraído. Cole o texto na caixa de mensagem.» Nesse caso, cole o texto da Petição Inicial e da Contestação diretamente na caixa de mensagem e envie.

---

## 9. Referências

- Instruções do agente: `lib/ai/agent-revisor-defesas.ts`
- Fluxo e API do chat: `docs/PROJETO-REVISOR-DEFESAS.md`
- UX/UI e sugestões: `docs/ux-ui-revisor-defesas.md`
- Checklist desenvolvimento: `.agents/skills/revisor-defesas-context/SKILL.md`
- API de upload: `app/(chat)/api/files/upload/route.ts`
- Upload direto (ficheiros &gt; 4,5 MB): `app/(chat)/api/files/upload-token/route.ts`, `app/(chat)/api/files/process/route.ts`
- Diagnóstico em produção: `GET /api/files/blob-status` (indica se `BLOB_READ_WRITE_TOKEN` está definido)
