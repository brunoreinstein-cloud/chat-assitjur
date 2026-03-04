/**
 * Testes unitários para funções puras em lib/utils.
 */
import { describe, expect, it } from "vitest";
import { generateUUID, isUUID, sanitizeText } from "@/lib/utils";

describe("isUUID", () => {
  it("retorna true para UUID válido minúsculo", () => {
    expect(isUUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")).toBe(true);
  });

  it("retorna true para UUID válido maiúsculo", () => {
    expect(isUUID("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11")).toBe(true);
  });

  it("retorna false para string vazia", () => {
    expect(isUUID("")).toBe(false);
  });

  it("retorna false para string que não é UUID", () => {
    expect(isUUID("not-a-uuid")).toBe(false);
    expect(isUUID("a0eebc99-9c0b-4ef8")).toBe(false);
  });
});

describe("generateUUID", () => {
  it("retorna string no formato UUID", () => {
    const uuid = generateUUID();
    expect(isUUID(uuid)).toBe(true);
  });

  it("gera valores diferentes em chamadas sucessivas", () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(a).not.toBe(b);
  });
});

describe("sanitizeText", () => {
  it("remove <has_function_call> do texto", () => {
    expect(sanitizeText("Hello <has_function_call> world")).toBe(
      "Hello  world"
    );
  });

  it("retorna igual se não contiver o marcador", () => {
    expect(sanitizeText("Hello world")).toBe("Hello world");
  });

  it("retorna string vazia para entrada vazia", () => {
    expect(sanitizeText("")).toBe("");
  });
});
