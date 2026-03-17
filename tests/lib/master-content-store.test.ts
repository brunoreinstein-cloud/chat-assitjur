/**
 * Testes unitários para o master-content-store.
 * Verifica armazenamento e recuperação de documentos gerados pelo Master agent.
 */
import { afterEach, describe, expect, it } from "vitest";

// Importar funções a testar
import {
  getMasterDoc,
  getMasterDocs,
  storeMasterDoc,
} from "@/lib/master-content-store";

// Limpar store entre testes (o módulo mantém Map em memória)
afterEach(() => {
  // O store não expõe clearAll, mas cada teste usa IDs únicos
});

describe("storeMasterDoc / getMasterDoc", () => {
  it("armazena e recupera documento por ID", () => {
    const id = "test-id-1";
    storeMasterDoc(id, "Relatório Teste", "## Conteúdo\nTexto aqui.");
    const doc = getMasterDoc(id);
    expect(doc).toBeDefined();
    expect(doc?.title).toBe("Relatório Teste");
    expect(doc?.content).toBe("## Conteúdo\nTexto aqui.");
  });

  it("retorna undefined para ID inexistente", () => {
    const doc = getMasterDoc("id-que-nao-existe-xyz");
    expect(doc).toBeUndefined();
  });

  it("sobrescreve documento com mesmo ID", () => {
    const id = "test-id-overwrite";
    storeMasterDoc(id, "Título Original", "Conteúdo original");
    storeMasterDoc(id, "Título Novo", "Conteúdo novo");
    const doc = getMasterDoc(id);
    expect(doc?.title).toBe("Título Novo");
    expect(doc?.content).toBe("Conteúdo novo");
  });

  it("armazena documento com conteúdo vazio sem erros", () => {
    const id = "test-id-empty";
    storeMasterDoc(id, "Título Vazio", "");
    const doc = getMasterDoc(id);
    expect(doc?.content).toBe("");
  });

  it("armazena documento com conteúdo muito longo (>10K chars)", () => {
    const id = "test-id-large";
    const longContent = "## Secção\n".repeat(2000); // ~20K chars
    storeMasterDoc(id, "Relatório Completo", longContent);
    const doc = getMasterDoc(id);
    expect(doc?.content.length).toBe(longContent.length);
  });
});

describe("getMasterDocs (batch)", () => {
  it("recupera múltiplos documentos por IDs", () => {
    storeMasterDoc("batch-1", "Doc 1", "Conteúdo 1");
    storeMasterDoc("batch-2", "Doc 2", "Conteúdo 2");
    storeMasterDoc("batch-3", "Doc 3", "Conteúdo 3");

    const docs = getMasterDocs(["batch-1", "batch-3"]);
    expect(docs).toHaveLength(2);
    expect(docs[0].title).toBe("Doc 1");
    expect(docs[1].title).toBe("Doc 3");
  });

  it("ignora IDs inexistentes silenciosamente", () => {
    storeMasterDoc("exists-1", "Existe", "Conteúdo");
    const docs = getMasterDocs(["exists-1", "nao-existe-abc"]);
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe("exists-1");
  });

  it("retorna array vazio para lista vazia", () => {
    const docs = getMasterDocs([]);
    expect(docs).toHaveLength(0);
  });

  it("inclui o id no resultado", () => {
    storeMasterDoc("id-check", "Com ID", "Conteúdo");
    const docs = getMasterDocs(["id-check"]);
    expect(docs[0].id).toBe("id-check");
  });
});
