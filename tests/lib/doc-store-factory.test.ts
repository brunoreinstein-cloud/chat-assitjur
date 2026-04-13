/**
 * Testes unitários para o doc-store-factory.
 * Verifica criação de stores, FIFO eviction e maxSize.
 */
import { describe, expect, it } from "vitest";
import { createDocStore } from "@/lib/stores/doc-store-factory";

describe("createDocStore", () => {
  it("armazena e recupera documento", () => {
    const store = createDocStore();
    store.storeDoc("id-1", "Título", "Conteúdo");
    expect(store.getDoc("id-1")).toEqual({
      title: "Título",
      content: "Conteúdo",
    });
  });

  it("retorna undefined para ID inexistente", () => {
    const store = createDocStore();
    expect(store.getDoc("nao-existe")).toBeUndefined();
  });

  it("sobrescreve documento com mesmo ID", () => {
    const store = createDocStore();
    store.storeDoc("id-1", "Original", "V1");
    store.storeDoc("id-1", "Atualizado", "V2");
    expect(store.getDoc("id-1")?.title).toBe("Atualizado");
  });

  it("getDocs retorna múltiplos documentos", () => {
    const store = createDocStore();
    store.storeDoc("a", "A", "CA");
    store.storeDoc("b", "B", "CB");
    store.storeDoc("c", "C", "CC");
    const docs = store.getDocs(["a", "c"]);
    expect(docs).toHaveLength(2);
    expect(docs[0].id).toBe("a");
    expect(docs[1].id).toBe("c");
  });

  it("getDocs ignora IDs inexistentes", () => {
    const store = createDocStore();
    store.storeDoc("x", "X", "CX");
    const docs = store.getDocs(["x", "nope"]);
    expect(docs).toHaveLength(1);
  });
});

describe("FIFO eviction com maxSize", () => {
  it("evicta o entry mais antigo quando excede maxSize", () => {
    const store = createDocStore(3);
    store.storeDoc("1", "T1", "C1");
    store.storeDoc("2", "T2", "C2");
    store.storeDoc("3", "T3", "C3");
    // Store cheio (3 entries). Inserir 4º deve evictar o 1º.
    store.storeDoc("4", "T4", "C4");
    expect(store.getDoc("1")).toBeUndefined();
    expect(store.getDoc("2")).toBeDefined();
    expect(store.getDoc("3")).toBeDefined();
    expect(store.getDoc("4")).toBeDefined();
  });

  it("atualização de entry existente não causa eviction", () => {
    const store = createDocStore(3);
    store.storeDoc("a", "A", "CA");
    store.storeDoc("b", "B", "CB");
    store.storeDoc("c", "C", "CC");
    // Atualizar 'a' (já existe) — não deve evictar ninguém
    store.storeDoc("a", "A2", "CA2");
    expect(store.getDoc("a")?.title).toBe("A2");
    expect(store.getDoc("b")).toBeDefined();
    expect(store.getDoc("c")).toBeDefined();
  });

  it("eviction em sequência mantém apenas os mais recentes", () => {
    const store = createDocStore(2);
    store.storeDoc("1", "T1", "C1");
    store.storeDoc("2", "T2", "C2");
    store.storeDoc("3", "T3", "C3"); // evicta 1
    store.storeDoc("4", "T4", "C4"); // evicta 2
    expect(store.getDoc("1")).toBeUndefined();
    expect(store.getDoc("2")).toBeUndefined();
    expect(store.getDoc("3")).toBeDefined();
    expect(store.getDoc("4")).toBeDefined();
  });

  it("maxSize=1 mantém apenas o último doc", () => {
    const store = createDocStore(1);
    store.storeDoc("a", "A", "CA");
    store.storeDoc("b", "B", "CB");
    expect(store.getDoc("a")).toBeUndefined();
    expect(store.getDoc("b")).toBeDefined();
  });
});
