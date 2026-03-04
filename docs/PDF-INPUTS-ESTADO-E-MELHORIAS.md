# PDF no chat: estado atual e melhorias (OpenRouter + Anthropic Files API)

Resumo de como os PDFs são tratados hoje no projeto e como podemos evoluir usando **OpenRouter PDF Inputs** (URL/base64 + plugins) ou **Anthropic Files API** (quando o modelo for Claude). A **secção 4** reúne alternativas de OCR, arquitetura e modelos para análise futura.

---

## 1. Estado atual no projeto

### 1.1 Fluxo dos PDFs hoje

1. **Upload**  
   O utilizador anexa um PDF (ou DOC/DOCX, etc.) no `MultimodalInput`. O ficheiro vai para:
   - `/api/files/upload` (ficheiros até ~4,5 MB no body), ou
   - Cliente → Vercel Blob (ficheiros grandes) → `/api/files/process` (servidor descarrega do Blob e processa).

2. **Extração no servidor**  
   Em `app/(chat)/api/files/upload/route.ts`:
   - **PDF com texto:** `unpdf` (mergePages) ou fallback página a página.
   - **PDF digitalizado (só imagens):** OCR com Tesseract (até N páginas, configurável).
   - O resultado é `extractedText` (e opcionalmente `extractionFailed`).

3. **Envio ao chat**  
   O cliente não envia o PDF em bruto ao chat. Envia **partes do tipo `document`** no body do `POST /api/chat`:
   - `type: "document"`
   - `name`, `text` (texto extraído), `documentType` (pi | contestacao)

4. **Normalização para o modelo**  
   Em `app/(chat)/api/chat/route.ts`, `normalizeMessageParts()`:
   - Converte todas as partes `document` em partes **`text`**.
   - Formato: `[Petição Inicial | Contestação | Documento: nome]\n\n{texto truncado}`.
   - Aplica `MAX_CHARS_PER_DOCUMENT` (35k) e `MAX_TOTAL_DOC_CHARS` (100k).

5. **Modelo**  
   O LLM recebe apenas **texto**. Nunca recebe o ficheiro PDF nem uma URL do PDF. O provider é o **Vercel AI Gateway** (`lib/ai/providers.ts`), que pode estar configurado para OpenRouter (ou outro) no dashboard.

### 1.2 Consequências

- **Vantagens:** Controlo total sobre extração, truncagem e custo; funciona com qualquer modelo atrás do gateway.
- **Limitações:**
  - PDFs digitalizados dependem do OCR no servidor (Tesseract); se falhar ou for fraco, o utilizador é convidado a “colar o texto”.
  - Não se aproveita parsing/OCR avançado do lado do provider (ex.: Mistral OCR no OpenRouter).
  - O schema do chat (`app/(chat)/api/chat/schema.ts`) só aceita `file` para `image/jpeg` e `image/png` (com `url`); não há parte `file` para PDF.

---

## 2. O que a documentação OpenRouter permite

Conforme [OpenRouter – PDF Inputs](https://openrouter.ai/docs/guides/overview/multimodal/pdfs):

- Enviar PDFs por **URL pública** ou **base64 (data URL)** nas mensagens.
- Tipo de conteúdo: `type: 'file'`, `file: { filename, fileData: url | data_url }`.
- **Plugins** para escolher o motor de parsing:
  - `pdf-text`: PDFs com texto bem estruturado (grátis).
  - `mistral-ocr`: digitalizados / com imagens (pago por página).
  - `native`: quando o modelo suporta ficheiros nativamente (cobrado como input tokens).
- Possibilidade de **reutilizar anotações** da resposta para não re-parsear o mesmo PDF em follow-ups (poupa custo e tempo).

Para usar isto, as chamadas teriam de ir no formato da API OpenRouter (ou o gateway ter de o suportar e encaminhar).

---

### 2.5 Anthropic Files API (quando usar Claude)

A [Anthropic Files API](https://docs.anthropic.com/en/docs/build-with-claude/files-api) (beta) oferece **upload uma vez, usar muitas vezes** para modelos Claude.

**Como funciona:**

- **Upload:** `POST https://api.anthropic.com/v1/files` com headers:
  - `anthropic-version: 2023-06-01`
  - `anthropic-beta: files-api-2025-04-14`
  - Resposta: `{ id, type: "file", filename, mime_type, size_bytes, created_at, downloadable }`.
- **Uso em mensagens:** Referenciar o ficheiro pelo `file_id` em vez de reenviar o conteúdo:
  - **PDF / texto:** bloco `document`: `{ type: "document", source: { type: "file", file_id: "file_xxx" }, title?, context?, citations?: { enabled: true } }`.
  - **Imagem:** bloco `image`: `{ type: "image", source: { type: "file", file_id: "file_xxx" } }`.
- **Tipos suportados:** PDF (`application/pdf`) e texto (`text/plain`) → `document`; JPEG/PNG/GIF/WebP → `image`. Outros formatos (CSV, DOCX, etc.) devem ser convertidos para texto e enviados no corpo da mensagem.
- **Limites:** 500 MB por ficheiro; 100 GB totais por organização. Operações de ficheiro (upload, list, get, delete, download) são **gratuitas**; o conteúdo usado em Messages é cobrado como input tokens. Download só para ficheiros criados por skills ou code execution, não para ficheiros enviados pelo utilizador.
- **Disponibilidade:** Suportado em modelos que aceitam o tipo de ficheiro (ex.: PDF em Claude 3.5+; imagens em Claude 3+). **Não** suportado em Amazon Bedrock nem Google Vertex AI. O Vercel AI Gateway pode não expor este beta — usar cliente/SDK Anthropic direto para pedidos com `file_id` se necessário.
- **Erros comuns:** 404 (file não encontrado), 400 (tipo inválido, excede contexto, nome inválido), 413 (ficheiro > 500 MB), 403 (limite de armazenamento). Rate limit na beta: ~100 pedidos/minuto.

Vantagens para o nosso fluxo quando o modelo for Claude: evita reupload em cada mensagem, permite citações nativas em PDF (`citations: { enabled: true }`) e parsing nativo do Claude para PDF. Requer integração específica para Anthropic (header beta e formato de conteúdo com `file_id`).

---

## 3. Como melhorar

### 3.1 Manter o fluxo atual e melhorá-lo (sem OpenRouter PDF)

- **OCR:** Revisar limite de páginas e qualidade do Tesseract; considerar pré-processamento de imagem (contraste, binarização) para melhorar OCR em digitalizados.
- **Feedback:** Quando `extractionFailed` ou texto vazio, a mensagem ao utilizador (“cole o texto”) já existe; pode ser afinada na UI (ex.: botão “Tentar novamente” ou “Enviar PDF ao modelo”, se avançarmos para 3.2).
- **Custo:** Manter truncagem (35k/100k) e documentar em `docs/OTIMIZACAO-CUSTO-TOKENS-LLM.md` que todo o custo de PDF é texto já extraído (sem parsing no provider).

### 3.2 Caminho “OpenRouter PDF” (envio do ficheiro ao modelo)

Requer que o chat use **OpenRouter** (via AI Gateway ou SDK) e que o AI SDK suporte partes do tipo `file` com `application/pdf` (o que a documentação do SDK indica para `FilePart`).

Passos possíveis:

1. **Gateway / provider**  
   Confirmar no Vercel AI Gateway se o destino é OpenRouter e se o mapeamento de mensagens suporta `file` com PDF (URL ou base64). Se o gateway não encaminhar o formato OpenRouter (ex.: `plugins`), pode ser necessário chamar a API OpenRouter diretamente para pedidos que incluam PDF como ficheiro.

2. **Schema e tipos**  
   - Alargar o schema do chat para aceitar uma parte opcional do tipo “file” para PDF:
     - `mediaType: 'application/pdf'`
     - `url` (URL pública do Blob/Storage) ou um campo para base64/data URL.
   - Manter as partes `document` (texto extraído) para compatibilidade e para quando o modelo não for OpenRouter.

3. **Lógica no `route.ts`**  
   - Se o modelo for OpenRouter **e** a mensagem tiver anexo PDF (por URL ou por id de arquivo já em Blob/Storage):
     - Construir uma parte `file` no formato esperado pelo OpenRouter (e pelo AI SDK, se suportado).
     - Opcional: enviar `plugins: [{ id: 'file-parser', pdf: { engine: 'pdf-text' | 'mistral-ocr' } }]` se a chamada for direta à API OpenRouter.
   - Caso contrário (modelo não OpenRouter ou sem PDF): manter o fluxo atual (partes `document` → `normalizeMessageParts` → texto).

4. **URL do PDF**  
   Os ficheiros já estão em Vercel Blob ou Supabase Storage. Se forem **públicos**, podemos enviar a URL diretamente (OpenRouter suporta). Se forem privados, seria necessário base64 (ou signed URL, se OpenRouter suportar).

5. **Reutilização de anotações**  
   Se OpenRouter devolver `annotations` na resposta, guardá-las (ex.: por `archivoId` ou hash do ficheiro) e reenviá-las em follow-ups do mesmo chat para evitar re-parse (custos e latência).

### 3.3 Híbrido (recomendado a médio prazo)

- **Por defeito:** Continuar a usar extração no servidor + partes `document` → texto (como hoje). Garante comportamento estável e previsível em custos para todos os modelos.
- **Opção “Enviar PDF ao modelo”:** Quando o utilizador escolher explicitamente (ou quando a extração falhar e o modelo for OpenRouter), enviar o PDF como `file` (URL ou base64) nesse pedido e, se possível, usar `mistral-ocr` para digitalizados.
- **Configuração:** Variável de ambiente ou flag por agente (ex.: `USE_OPENROUTER_PDF_FOR_ATTACHMENTS=true`) para ativar o caminho OpenRouter PDF sem mudar o comportamento por defeito.

### 3.4 Caminho “Anthropic Files API” (apenas quando modelo = Claude)

Quando o modelo selecionado for Anthropic (ex.: Claude 3.5+ / 4.x) e quisermos enviar o PDF ao modelo sem extração no servidor:

1. **Upload para Anthropic:** Após o utilizador anexar o PDF (ou após guardar no Blob/Storage), chamar `POST /v1/files` da API Anthropic (com header `anthropic-beta: files-api-2025-04-14`) e guardar o `file_id` (ex.: associado ao anexo na mensagem ou ao chat).
2. **Mensagens:** Em vez de partes `document` com texto extraído, enviar bloco `document` com `source: { type: "file", file_id }`. Opcional: `citations: { enabled: true }`.
3. **Gateway vs direto:** Se o AI Gateway da Vercel não suportar o beta da Files API, usar o cliente/sdk Anthropic em chamadas diretas para pedidos que incluam ficheiros por `file_id`.
4. **Fallback:** Se o modelo não for Anthropic, manter o fluxo atual (extração + partes `document` com texto).

---

## 4. Análise futura: OCR, arquitetura e modelos

Secção para apoio a decisões futuras: alternativas ao Tesseract, formas de o PDF chegar ao LLM e quem processa o documento. Não substitui a secção 3 (melhorias imediatas/OpenRouter/Anthropic).

### 4.1 Alternativas de OCR/Extração (substituindo ou complementando Tesseract)

| Alternativa | Descrição | Custo / Notas |
|-------------|-----------|----------------|
| **Google Document AI** | Melhor custo-benefício para documentos jurídicos em português. Entende layout, tabelas, modelos pré-treinados para documentos estruturados. API REST, integra no route handler sem mudar arquitetura. | ~\$0,001/página (OCR básico), ~\$0,01 (form parsing). 30 páginas ≈ centavos. |
| **Azure AI Document Intelligence** (antigo Form Recognizer) | Mesma proposta que o Document AI. Tier gratuito: 500 páginas/mês. Útil para validação e primeiros clientes sem custo. | Modelo `prebuilt-read` extrai texto com alta fidelidade posicional. |
| **Marker** (Datalab, open source) | Converte PDF para Markdown preservando estrutura (títulos, listas, tabelas). Para jurídico é valioso: o LLM recebe texto já estruturado. Roda no servidor, sem custo de API. | Exige mais CPU/memória que o Tesseract. |
| **LlamaParse** (LlamaIndex) | Parsing inteligente de PDFs com contexto semântico. Free tier: 1000 páginas/dia. Qualidade superior ao unpdf em documentos complexos (cabeçalhos, rodapés, numeração). | Bom para reduzir “poluição” do texto extraído. |

### 4.2 Alternativas de arquitetura (como o PDF chega ao LLM)

- **Chunking semântico em vez de truncagem linear**  
  Em vez de cortar nos primeiros 35k caracteres, dividir o documento em seções lógicas (qualificação das partes, dos fatos, do direito, dos pedidos) e enviar apenas as seções relevantes por pergunta. Exige um passo de classificação de seções (ex.: LLM barato como Haiku); o ganho de qualidade é grande.

- **RAG sobre o documento**  
  Fazer embedding das seções do PDF e guardar no Supabase (pgvector). Na pergunta do utilizador, buscar os chunks mais relevantes e enviar só esses ao modelo. Para documentos longos (100+ páginas) é a abordagem que escala sem estourar contexto ou custo. Desvantagens: latência adicional e complexidade.

- **Cache de extração no Supabase**  
  Guardar o texto extraído (e opcionalmente chunks/embeddings) associado ao **hash do ficheiro**. Se o mesmo PDF for referenciado em várias conversas, evita reprocessamento. Confirmar se hoje a extração já é reaproveitada entre conversas; se não, este cache é prioritário.

### 4.3 Alternativas de modelo (quem processa o PDF)

- **Gemini 2.5 via OpenRouter**  
  Contexto de 1M tokens, aceita PDFs nativamente. Para “analisar documento jurídico inteiro” simplifica: envia-se o PDF e o modelo trata de tudo. Custo por token competitivo. Desvantagem: dependência do Gemini para este caso de uso.

- **Claude com janela de contexto grande**  
  Uma contestação típica cabe no contexto sem truncagem. A extração server-side continua a ser o caminho, mas sem necessidade de cortar.

- **Modelo local para pré-processamento**  
  Usar modelo pequeno (Phi-3, Qwen2) via Ollama para: classificar seções, extrair entidades jurídicas (partes, valores, prazos), gerar “resumo estruturado” antes de enviar ao modelo principal. Reduz tokens no modelo caro e pode melhorar a qualidade da resposta.

### 4.4 Sequência pragmática recomendada

Considerando o Ofício em construção e a necessidade de entregar valor rápido:

1. **Agora**  
   Trocar o Tesseract por **Google Document AI** ou **LlamaParse** para extração. Ganho de qualidade imediato, custo marginal, mudança cirúrgica (só o route handler de upload). Guardar o texto extraído no Supabase vinculado ao hash do ficheiro.

2. **Próximo ciclo**  
   Implementar **chunking semântico** dos documentos jurídicos: identificar seções padrão (qualificação, fatos, direito, pedidos, documentos) e permitir que o chat referencie seções específicas. Melhora UX e reduz custo de tokens.

3. **Quando escalar**  
   **RAG com pgvector** no Supabase. Quando clientes subirem processos inteiros (dezenas de documentos por caso), a busca vetorial passa a ser necessária para performance e custo.

A rota **OpenRouter PDF nativa** (secção 3.2) pode ficar como opção futura, não como prioridade: adiciona dependência de provider e não resolve o problema de fundo (qualidade da extração e inteligência no que é enviado ao modelo).

---

## 5. Comparação com o cookbook AI SDK “Chat with PDFs”

O exemplo [Chat with PDFs](https://ai-sdk.dev/cookbook/next/chat-with-pdf) do AI SDK mostra um fluxo mais simples, focado em modelos que entendem PDF nativamente.

### 5.1 O que o cookbook faz

- **Cliente:** Converte ficheiros (incl. PDF) em data URLs com `FileReader.readAsDataURL()` e envia nas mensagens como partes `type: 'file'` com `filename`, `mediaType`, `url` (data URL).
- **Servidor:** Usa `convertToModelMessages(messages)` diretamente, sem extração nem normalização. O modelo recebe o PDF como anexo (o provider precisa suportar PDF, ex.: Claude, Gemini).
- **Requisito:** Provider com suporte nativo a PDF (ex.: Anthropic Claude, Google Gemini 2.0).

### 5.2 Vantagens do cookbook para nós

| Aspecto | Cookbook | Nosso projeto atual |
|--------|----------|----------------------|
| **Complexidade** | Cliente lê ficheiro → data URL → envia; servidor só chama `convertToModelMessages`. | Upload → extração (unpdf/OCR) → armazenamento → partes `document` → `normalizeMessageParts` → texto truncado. |
| **PDFs digitalizados** | Depende do modelo (ex.: visão do Claude). Sem OCR nosso. | OCR com Tesseract no servidor; pode falhar ou ser fraco. |
| **Custo de extração** | Zero no nosso servidor. | CPU/memória (unpdf, Tesseract), tempo de upload/process. |
| **Qualidade do “texto”** | O modelo interpreta o PDF diretamente (layout, tabelas, imagens). | Só texto extraído; truncagem 35k/100k; perda de estrutura. |
| **Compatibilidade** | Apenas com modelos que suportam PDF. | Qualquer modelo (só texto). |

### 5.3 O que podemos adoptar do cookbook

1. **Opção “enviar PDF ao modelo” (modo nativo)**  
   Quando o modelo selecionado suportar PDF (ex.: Claude via AI Gateway):
   - No cliente: para anexos PDF já em Blob/Storage, enviar também (ou em vez de) uma parte `file` com `mediaType: 'application/pdf'` e `url` (URL pública ou data URL).
   - No servidor: alargar o schema para aceitar `file` com `application/pdf`; em vez de converter esse PDF em `document` → texto, deixar a parte `file` passar para `convertToModelMessages` (e não a transformar em texto em `normalizeMessageParts`).
   - Referência de implementação: [Chat with PDFs](https://ai-sdk.dev/cookbook/next/chat-with-pdf) (conversão para data URL no cliente; no nosso caso podemos usar URL do Blob se o provider aceitar).

2. **Fallback mantido**  
   Se o modelo não suportar PDF ou se a extração for preferida (ex.: controlo de custo, truncagem), manter o fluxo actual: extração → partes `document` → `normalizeMessageParts` → texto.

3. **Híbrido (recomendado)**  
   - Por defeito: fluxo actual (texto extraído, truncagem, qualquer modelo).
   - Opção na UI ou por agente: “Usar PDF nativo quando o modelo suportar” — nesse caso enviar parte `file` com PDF (URL ou data URL) e não substituir por texto quando o provider for compatível.

### 5.4 Alterações técnicas sugeridas (inspiradas no cookbook)

- **Schema** (`app/(chat)/api/chat/schema.ts`): alargar `filePartSchema` para aceitar `mediaType: 'application/pdf'` além de `image/jpeg` e `image/png`.
- **Cliente** (`components/multimodal-input.tsx`): em `buildAttachmentParts`, para anexos PDF com `url` (ex.: Blob público), incluir opcionalmente uma parte `file` com `application/pdf` quando a opção “PDF nativo” estiver activa; caso contrário manter só `document` com texto extraído.
- **Servidor** (`app/(chat)/api/chat/route.ts`): em `normalizeMessageParts`, não converter em texto as partes `file` cujo `mediaType` seja `application/pdf` (deixá-las passar para `convertToModelMessages`). Garantir que `isPartValidForModel` aceite `file` com `application/pdf`.
- **Provider:** Confirmar no AI Gateway / provider que o modelo escolhido recebe e processa partes file com PDF (ex.: Anthropic, Google). Se o gateway não encaminhar PDF, o caminho “PDF nativo” só funcionará com chamada directa ao provider que suportar.

---

## 6. Referências

- Estado atual do chat: `app/(chat)/api/chat/route.ts` (`normalizeMessageParts`, uso de `convertToModelMessages`).
- Schema do chat: `app/(chat)/api/chat/schema.ts` (partes `text`, `file` só imagens, `document`).
- Upload e extração: `app/(chat)/api/files/upload/route.ts` (unpdf, OCR, classificação PI/Contestação).
- OpenRouter PDF: https://openrouter.ai/docs/guides/overview/multimodal/pdfs
- Anthropic Files API: https://docs.anthropic.com/en/docs/build-with-claude/files-api (beta; header `anthropic-beta: files-api-2025-04-14`; tipos de bloco `document`/`image`, limites, erros e download descritos na doc).
- Custo e limites: `docs/OTIMIZACAO-CUSTO-TOKENS-LLM.md`
- AI SDK cookbook “Chat with PDFs”: https://ai-sdk.dev/cookbook/next/chat-with-pdf (envio de PDF como parte `file` com data URL; uso directo de `convertToModelMessages`).
