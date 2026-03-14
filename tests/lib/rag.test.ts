/**
 * Testes unitários para lib/ai/rag.ts (chunkText) e lib/rag/reranking.ts (rerankByDiversity).
 * Funções puras, sem dependências externas — não requerem mocks.
 */
import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/ai/rag";
import { rerankByDiversity } from "@/lib/rag/reranking";
import type { RetrievalChunk } from "@/lib/rag/types";

// ---------------------------------------------------------------------------
// chunkText
// ---------------------------------------------------------------------------

describe("chunkText", () => {
  it("devolve [] para string vazia", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("devolve [texto] quando o texto cabe num único chunk", () => {
    const text = "Texto curto.";
    expect(chunkText(text, 100, 10)).toEqual([text]);
  });

  it("divide texto longo em múltiplos chunks", () => {
    const word = "palavra ";
    const text = word.repeat(200); // ~1600 chars
    const chunks = chunkText(text, 200, 50);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("todos os chunks têm comprimento <= chunkSize + margem (quebra por palavra)", () => {
    const text = "ab ".repeat(300); // palavras curtas com espaço
    const chunkSize = 100;
    const chunks = chunkText(text, chunkSize, 20);
    for (const chunk of chunks) {
      // A quebra por espaço pode colocar o chunk ligeiramente abaixo do limite
      expect(chunk.length).toBeLessThanOrEqual(chunkSize + 5);
    }
  });

  it("o overlap faz com que tokens do final de um chunk apareçam no início do seguinte", () => {
    const text = "a ".repeat(300);
    const overlap = 40;
    const chunks = chunkText(text, 100, overlap);
    if (chunks.length >= 2) {
      const tailOfFirst = chunks[0].slice(-overlap).trim();
      const headOfSecond = chunks[1].slice(0, overlap + 10).trim();
      // Os dois devem partilhar algum conteúdo
      expect(headOfSecond.startsWith(tailOfFirst.split(" ")[0])).toBe(true);
    }
  });

  it("não produz chunks vazios", () => {
    const text = "  \n  conteúdo  \n\n  ";
    const chunks = chunkText(text, 50, 10);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rerankByDiversity
// ---------------------------------------------------------------------------

function makeChunk(
  id: string,
  docId: string,
  text: string
): RetrievalChunk {
  return { id, knowledgeDocumentId: docId, text, chunkIndex: 0, similarity: 1 };
}

describe("rerankByDiversity", () => {
  it("devolve [] para lista vazia", () => {
    expect(rerankByDiversity([])).toEqual([]);
  });

  it("limita chunks por documento (maxChunksPerDoc)", () => {
    const chunks = [
      makeChunk("1", "doc-a", "Texto A1 sobre rescisão contratual."),
      makeChunk("2", "doc-a", "Texto A2 sobre aviso prévio trabalhista."),
      makeChunk("3", "doc-a", "Texto A3 sobre FGTS multa rescisória."),
      makeChunk("4", "doc-a", "Texto A4 sobre verbas rescisórias adicionais."),
    ];
    const result = rerankByDiversity(chunks, { maxChunksPerDoc: 2 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("descarta chunks com overlap alto (Jaccard >= threshold)", () => {
    // Dois chunks quase idênticos do mesmo doc devem resultar em 1 selecionado
    const base =
      "rescisão contrato trabalho aviso prévio indenização compensatória";
    const chunks = [
      makeChunk("1", "doc-a", base),
      makeChunk("2", "doc-b", base + " adicional"),
    ];
    const result = rerankByDiversity(chunks, {
      maxChunksPerDoc: 5,
      textOverlapThreshold: 0.7,
    });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("1"); // primeiro chunk ganha (maior similaridade)
  });

  it("mantém chunks de documentos diferentes com conteúdo distinto", () => {
    const chunks = [
      makeChunk("1", "doc-a", "Rescisão sem justa causa aviso prévio FGTS."),
      makeChunk("2", "doc-b", "Adicional insalubridade periculosidade NR15."),
      makeChunk("3", "doc-c", "Horas extras banco de horas compensação."),
    ];
    const result = rerankByDiversity(chunks, { maxChunksPerDoc: 1 });
    expect(result.length).toBe(3);
  });

  it("stopwords PT não inflacionam similaridade entre chunks distintos", () => {
    // Dois chunks com muitas stopwords mas conteúdo semântico diferente
    const chunkA = makeChunk(
      "1",
      "doc-a",
      "o contrato de trabalho foi rescindido sem justa causa pelo empregador"
    );
    const chunkB = makeChunk(
      "2",
      "doc-b",
      "o acidente de trabalho ocorreu durante o horário de expediente na empresa"
    );
    // Com stopwords filtradas, a similaridade deve ser baixa → ambos selecionados
    const result = rerankByDiversity([chunkA, chunkB], {
      maxChunksPerDoc: 5,
      textOverlapThreshold: 0.5,
    });
    expect(result.length).toBe(2);
  });

  it("preserva a ordem original dos chunks selecionados", () => {
    const chunks = [
      makeChunk("1", "doc-a", "Artigo primeiro da consolidação das leis."),
      makeChunk("2", "doc-b", "Normas regulamentadoras segurança trabalho."),
      makeChunk("3", "doc-c", "Jurisprudência TST recurso de revista."),
    ];
    const result = rerankByDiversity(chunks);
    expect(result.map((c) => c.id)).toEqual(["1", "2", "3"]);
  });
});
