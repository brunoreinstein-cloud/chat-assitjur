# PDF no chat: estado atual e melhorias (OpenRouter + Anthropic Files API)

Resumo de como os PDFs são tratados hoje no projeto e como podemos evoluir usando **OpenRouter PDF Inputs** (URL/base64 + plugins) ou **Anthropic Files API** (quando o modelo for Claude).

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

## 4. Referências

- Estado atual do chat: `app/(chat)/api/chat/route.ts` (`normalizeMessageParts`, uso de `convertToModelMessages`).
- Schema do chat: `app/(chat)/api/chat/schema.ts` (partes `text`, `file` só imagens, `document`).
- Upload e extração: `app/(chat)/api/files/upload/route.ts` (unpdf, OCR, classificação PI/Contestação).
- OpenRouter PDF: https://openrouter.ai/docs/guides/overview/multimodal/pdfs
- Anthropic Files API: https://docs.anthropic.com/en/docs/build-with-claude/files-api (beta; header `anthropic-beta: files-api-2025-04-14`; tipos de bloco `document`/`image`, limites, erros e download descritos na doc).
- Custo e limites: `docs/OTIMIZACAO-CUSTO-TOKENS-LLM.md`
