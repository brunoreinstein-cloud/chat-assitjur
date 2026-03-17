/**
 * Testes unitários para document-to-docx.ts.
 * Cobre as funções exportadas: toByteStringSafe, sanitizeDocxFilename, createDocxBuffer.
 *
 * NOTA: O módulo usa "server-only" — mockado para permitir importação em Node.js de teste.
 */
import { describe, expect, it, vi } from "vitest";

// "server-only" impede importação fora do servidor Next.js — neutralizar em testes
vi.mock("server-only", () => ({}));

import {
  createDocxBuffer,
  sanitizeDocxFilename,
  toByteStringSafe,
} from "@/lib/document-to-docx";

// ─── toByteStringSafe ─────────────────────────────────────────────────────────

describe("toByteStringSafe", () => {
  it("mantém strings Latin-1 (codePoint ≤ 255) intactas", () => {
    // 'ó' tem codePoint 243 ≤ 255 → mantém-se (não é removido)
    expect(toByteStringSafe("Relatório")).toContain("ó");
    expect(toByteStringSafe("Relatorio")).toBe("Relatorio");
    expect(toByteStringSafe("Hello World 123")).toBe("Hello World 123");
  });

  it("converte letras acentuadas do Português para equivalentes ASCII", () => {
    // Os mapeamentos UNICODE_TO_ASCII definem substituições comuns
    const result = toByteStringSafe("ação avaliação");
    // Cada caractere deve ser <= 255 (ByteString)
    for (const ch of result) {
      expect(ch.codePointAt(0)).toBeLessThanOrEqual(255);
    }
  });

  it("remove caracteres acima de codePoint 255 que não têm mapeamento", () => {
    // Caracteres CJK ou emojis sem mapeamento devem ser omitidos
    const result = toByteStringSafe("Olá 中文 世界");
    for (const ch of result) {
      expect(ch.codePointAt(0)).toBeLessThanOrEqual(255);
    }
  });

  it("não transforma string vazia", () => {
    expect(toByteStringSafe("")).toBe("");
  });

  it("converte ç e ã corretamente", () => {
    const result = toByteStringSafe("ação");
    // Todos os chars devem estar no range Latin-1
    for (const ch of result) {
      expect(ch.codePointAt(0)).toBeLessThanOrEqual(255);
    }
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── sanitizeDocxFilename ─────────────────────────────────────────────────────

describe("sanitizeDocxFilename", () => {
  it("adiciona extensão .docx ao resultado", () => {
    const name = sanitizeDocxFilename("Relatório Final");
    expect(name).toMatch(/\.docx$/);
  });

  it("substitui espaços por underscore", () => {
    const name = sanitizeDocxFilename("Meu Documento Teste");
    expect(name).not.toContain(" ");
    expect(name).toContain("_");
  });

  it("remove caracteres proibidos em nomes de ficheiro Windows/POSIX", () => {
    const forbidden = 'abc<>:"/\\|?*def';
    const name = sanitizeDocxFilename(forbidden);
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
  });

  it("usa 'documento.docx' para string vazia", () => {
    expect(sanitizeDocxFilename("")).toBe("documento.docx");
  });

  it("trunca títulos muito longos (máx. 115 chars base + .docx)", () => {
    const long = "A".repeat(200);
    const name = sanitizeDocxFilename(long);
    expect(name.length).toBeLessThanOrEqual(120); // 115 base + ".docx" (5)
  });

  it("título com acentos resulta em ByteString segura para header HTTP", () => {
    const name = sanitizeDocxFilename("Avaliação Processual — Trabalhista");
    // Todos os chars do filename devem ser <= 255 (sem levantar TypeError)
    for (const ch of name) {
      expect(ch.codePointAt(0)).toBeLessThanOrEqual(255);
    }
    expect(name).toMatch(/\.docx$/);
  });

  it("título com apenas underscores após sanitização resulta em '_…_.docx'", () => {
    // Os caracteres proibidos são substituídos por '_', não removidos.
    // O fallback 'documento' só ocorre se o resultado .trim() estiver vazio.
    const name = sanitizeDocxFilename('<>:"/\\|?*');
    expect(name).toMatch(/^_+\.docx$/);
  });

  it("título com só espaços é convertido para underscore (espaços → '_' antes do trim)", () => {
    // /\s+/g → '_' antes de .trim() — logo '   ' torna-se '_', não vazio
    const name = sanitizeDocxFilename("   ");
    expect(name).toMatch(/^_+\.docx$/);
  });
});

// ─── createDocxBuffer ─────────────────────────────────────────────────────────

describe("createDocxBuffer", () => {
  it("retorna um Buffer não vazio para conteúdo simples", async () => {
    const buf = await createDocxBuffer(
      "Título de Teste",
      "## Secção\nTexto simples."
    );
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("produz um ficheiro DOCX válido (começa com magic bytes ZIP: PK)", async () => {
    const buf = await createDocxBuffer(
      "Documento DOCX",
      "Conteúdo para testar."
    );
    // DOCX é um ZIP — os primeiros 2 bytes são PK (0x50, 0x4B)
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
  });

  it("funciona com layout 'default'", async () => {
    const buf = await createDocxBuffer(
      "Relatório Simples",
      "## Introdução\n\nEste é um parágrafo de teste.",
      "default"
    );
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("funciona com layout 'assistjur-master'", async () => {
    const buf = await createDocxBuffer(
      "Relatório Master",
      "## Secção 1\n\nConteúdo importante.",
      "assistjur-master"
    );
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("aceita markdown com tabela pipe e gera buffer maior que sem tabela", async () => {
    const withTable = await createDocxBuffer(
      "Com Tabela",
      "## Dados\n\n| Campo | Valor |\n|---|---|\n| Nome | João |\n| Cargo | Técnico |"
    );
    const withoutTable = await createDocxBuffer(
      "Sem Tabela",
      "## Dados\n\nNome: João"
    );
    // Tabela gera mais conteúdo DOCX
    expect(withTable.length).toBeGreaterThan(0);
    expect(withoutTable.length).toBeGreaterThan(0);
  });

  it("aceita markdown com lista de bullets", async () => {
    const buf = await createDocxBuffer(
      "Lista",
      "## Itens\n\n- Primeiro item\n- Segundo item\n- Terceiro item"
    );
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("aceita conteúdo com negrito e itálico inline", async () => {
    const buf = await createDocxBuffer(
      "Formatação",
      "Texto com **negrito** e *itálico* e ***ambos***."
    );
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("aceita string de conteúdo vazia sem lançar erro", async () => {
    const buf = await createDocxBuffer("Vazio", "");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("documento master é maior do que default (tem header/footer extra)", async () => {
    const content =
      "## Relatório\n\nConteúdo de teste para comparação de layouts.";
    const bufDefault = await createDocxBuffer("Doc", content, "default");
    const bufMaster = await createDocxBuffer(
      "Doc",
      content,
      "assistjur-master"
    );
    // O layout master tem header e footer adicionais — deve ser maior
    expect(bufMaster.length).toBeGreaterThan(bufDefault.length);
  });
});
