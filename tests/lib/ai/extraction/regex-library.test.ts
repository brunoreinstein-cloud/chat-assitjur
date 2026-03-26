import { describe, expect, it } from "vitest";
import {
  CNJ_REGEX,
  CNPJ_REGEX,
  CPF_REGEX,
  DATA_BR_REGEX,
  formatCNPJ,
  formatCPF,
  ID_PJE_REGEX,
  MARCADORES,
  parseCNJ,
  parseDataBR,
  parseOAB,
  parseValorBRL,
  VALOR_BRL_REGEX,
  validateCNPJ,
  validateCPF,
} from "@/lib/ai/extraction/regex-library";

describe("regex-library", () => {
  describe("CNJ", () => {
    it("matches standard CNJ format", () => {
      expect(CNJ_REGEX.test("0001234-56.2024.5.01.0001")).toBe(true);
    });

    it("matches CNJ without separators", () => {
      expect(CNJ_REGEX.test("00012345620245010001")).toBe(true);
    });

    it("parses CNJ correctly", () => {
      const result = parseCNJ("0001234-56.2024.5.01.0001");
      expect(result.valid).toBe(true);
      expect(result.sequencial).toBe("0001234");
      expect(result.digitos).toBe("56");
      expect(result.ano).toBe("2024");
      expect(result.justica).toBe("5");
      expect(result.tribunal).toBe("01");
      expect(result.vara).toBe("0001");
      expect(result.formatted).toBe("0001234-56.2024.5.01.0001");
    });

    it("rejects invalid CNJ", () => {
      expect(parseCNJ("123-45.6789").valid).toBe(false);
      expect(parseCNJ("not a number").valid).toBe(false);
    });
  });

  describe("CPF", () => {
    it("matches CPF format", () => {
      expect(CPF_REGEX.test("529.982.247-25")).toBe(true);
      expect(CPF_REGEX.test("52998224725")).toBe(true);
    });

    it("validates correct CPF", () => {
      expect(validateCPF("529.982.247-25")).toBe(true);
    });

    it("rejects all-same-digit CPF", () => {
      expect(validateCPF("111.111.111-11")).toBe(false);
    });

    it("rejects invalid CPF", () => {
      expect(validateCPF("529.982.247-00")).toBe(false);
    });

    it("rejects short CPF", () => {
      expect(validateCPF("123")).toBe(false);
    });

    it("formats CPF correctly", () => {
      expect(formatCPF("52998224725")).toBe("529.982.247-25");
    });
  });

  describe("CNPJ", () => {
    it("matches CNPJ format", () => {
      expect(CNPJ_REGEX.test("11.222.333/0001-81")).toBe(true);
      expect(CNPJ_REGEX.test("11222333000181")).toBe(true);
    });

    it("validates correct CNPJ", () => {
      expect(validateCNPJ("11.222.333/0001-81")).toBe(true);
    });

    it("rejects all-same-digit CNPJ", () => {
      expect(validateCNPJ("11.111.111/1111-11")).toBe(false);
    });

    it("rejects invalid CNPJ", () => {
      expect(validateCNPJ("11.222.333/0001-00")).toBe(false);
    });

    it("formats CNPJ correctly", () => {
      expect(formatCNPJ("11222333000181")).toBe("11.222.333/0001-81");
    });
  });

  describe("OAB", () => {
    it("parses OAB/SP format", () => {
      const result = parseOAB("OAB/SP 123456");
      expect(result.valid).toBe(true);
      expect(result.uf).toBe("SP");
      expect(result.numero).toBe("123456");
    });

    it("parses OAB RJ format", () => {
      const result = parseOAB("OAB/RJ 98765");
      expect(result.valid).toBe(true);
      expect(result.uf).toBe("RJ");
    });

    it("rejects invalid OAB", () => {
      expect(parseOAB("no OAB here").valid).toBe(false);
    });
  });

  describe("Valor BRL", () => {
    it("matches R$ format", () => {
      expect(VALOR_BRL_REGEX.test("R$ 1.234,56")).toBe(true);
      expect(VALOR_BRL_REGEX.test("R$ 0,99")).toBe(true);
    });

    it("parses value correctly", () => {
      expect(parseValorBRL("R$ 1.234,56")).toBe(1234.56);
      expect(parseValorBRL("R$ 100,00")).toBe(100);
      expect(parseValorBRL("R$ 1.000.000,99")).toBe(1_000_000.99);
    });

    it("returns null for non-matching", () => {
      expect(parseValorBRL("USD 100")).toBeNull();
    });
  });

  describe("Data BR", () => {
    it("matches DD/MM/AAAA", () => {
      expect(DATA_BR_REGEX.test("15/03/2024")).toBe(true);
    });

    it("parses valid date", () => {
      const result = parseDataBR("15/03/2024");
      expect(result.valid).toBe(true);
      expect(result.date?.getDate()).toBe(15);
      expect(result.date?.getMonth()).toBe(2); // 0-indexed
      expect(result.date?.getFullYear()).toBe(2024);
    });

    it("rejects invalid month", () => {
      expect(parseDataBR("15/13/2024").valid).toBe(false);
    });

    it("rejects invalid day (Feb 30)", () => {
      expect(parseDataBR("30/02/2024").valid).toBe(false);
    });

    it("rejects non-date string", () => {
      expect(parseDataBR("not a date").valid).toBe(false);
    });
  });

  describe("ID PJe", () => {
    it("matches id=NNNNNNN format", () => {
      expect(ID_PJE_REGEX.test("id=1234567")).toBe(true);
      expect(ID_PJE_REGEX.test("Id 9876543")).toBe(true);
    });
  });

  describe("MARCADORES", () => {
    it("has 7 types", () => {
      expect(Object.keys(MARCADORES)).toHaveLength(7);
    });

    it("NAO_LOCALIZADO is ---", () => {
      expect(MARCADORES.NAO_LOCALIZADO).toBe("---");
    });

    it("has all required markers", () => {
      expect(MARCADORES.COMPROVADO).toContain("✓");
      expect(MARCADORES.NAO_ENCONTRADO).toContain("✗");
      expect(MARCADORES.VERIFICAR).toContain("[VERIFICAR]");
      expect(MARCADORES.PENDENTE).toContain("[PENDENTE]");
      expect(MARCADORES.DIVERGENCIA).toBe("DIVERGÊNCIA");
      expect(MARCADORES.ADVOGADO).toContain("[ADVOGADO]");
    });
  });
});
