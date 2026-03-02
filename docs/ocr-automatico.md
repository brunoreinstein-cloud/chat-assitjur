# OCR Automático

**Transforme qualquer documento escaneado em texto pesquisável e editável**, com suporte a português e inglês.

---

## O que é

O **OCR automático** extrai texto de:

- **PDFs digitalizados** — quando o PDF não tem camada de texto (só imagens), o sistema renderiza cada página e aplica OCR (até 50 páginas por documento).
- **Imagens JPEG e PNG** — fotos ou digitalizações de páginas (petições, contratos, recibos) são processadas por OCR e o texto resultante é usado no chat e na base de conhecimento.

O texto extraído é usado como conteúdo da parte `document` no chat (Revisor de Defesas, Análise de contratos) e, na base de conhecimento, como conteúdo pesquisável (incluindo RAG quando ativo).

---

## Onde se aplica

| Fluxo | Comportamento |
|-------|----------------|
| **Upload no chat** | JPEG/PNG e PDF escaneado → extração por OCR → texto enviado ao agente como parte do contexto. |
| **Base de conhecimento (from-files)** | JPEG/PNG → OCR → texto guardado no documento; opcionalmente chunking e embeddings para RAG. |
| **Processamento pós-upload (Blob)** | `/api/files/process` aplica a mesma extração (incluindo OCR) para ficheiros enviados via upload direto. |

---

## Detalhes técnicos

- **Motor:** Tesseract.js (idiomas: português e inglês).
- **PDF escaneado:** unpdf renderiza cada página como imagem; Tesseract processa cada uma; limite de 50 páginas; truncagem a ~600k caracteres.
- **Imagens:** buffer JPEG/PNG enviado diretamente ao Tesseract; modo de segmentação automático (PSM AUTO).
- **Rotas:** `app/(chat)/api/files/upload/route.ts` (upload + extração em paralelo), `app/(chat)/api/files/process/route.ts` (processamento após upload direto), `runExtractionAndClassification` partilhado com `app/(chat)/api/knowledge/from-files/route.ts`.

---

## Mensagem de produto (copy)

> **OCR Automático**  
> Transforme qualquer documento escaneado em texto pesquisável e editável com precisão líder da indústria.

*(Para precisão ainda superior em cenários enterprise, pode-se integrar no futuro um serviço cloud como Google Document AI, Azure Document Intelligence ou AWS Textract; a API de extração já está centralizada em `runExtractionAndClassification`.)*
