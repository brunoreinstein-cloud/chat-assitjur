import { describe, expect, it } from "vitest";
import {
  DOC_TYPE_ORDER,
  escapeXmlAttr,
  findLastPageMarker,
  getDocumentPartExtractionHint,
  getDocumentPartLabel,
  PAGE_REF_RULE,
  PI_TAIL_CHARS,
  truncateDocumentText,
  wrapKnowledgeDocument,
} from "@/lib/ai/chat/utils";

describe("chat/utils", () => {
  describe("escapeXmlAttr", () => {
    it("escapes ampersand", () => {
      expect(escapeXmlAttr("a & b")).toBe("a &amp; b");
    });

    it("escapes less than", () => {
      expect(escapeXmlAttr("a < b")).toBe("a &lt; b");
    });

    it("escapes double quotes", () => {
      expect(escapeXmlAttr('a "b" c')).toBe("a &quot;b&quot; c");
    });

    it("escapes single quotes", () => {
      expect(escapeXmlAttr("a 'b' c")).toBe("a &apos;b&apos; c");
    });

    it("handles multiple escapes", () => {
      expect(escapeXmlAttr('a & "b" < c')).toBe("a &amp; &quot;b&quot; &lt; c");
    });

    it("returns empty string unchanged", () => {
      expect(escapeXmlAttr("")).toBe("");
    });
  });

  describe("wrapKnowledgeDocument", () => {
    it("wraps content with CDATA", () => {
      const result = wrapKnowledgeDocument("id1", "Title", "Content here");
      expect(result).toContain('id="id1"');
      expect(result).toContain('title="Title"');
      expect(result).toContain("<![CDATA[Content here]]>");
    });

    it("escapes title with special characters", () => {
      const result = wrapKnowledgeDocument(
        "id1",
        'Title "with" <special>',
        "Content"
      );
      expect(result).toContain("&quot;with&quot;");
      expect(result).toContain("&lt;special>");
    });

    it("handles empty content", () => {
      const result = wrapKnowledgeDocument("id1", "Title", "");
      expect(result).not.toContain("<![CDATA[");
      expect(result).toContain("</document>");
    });

    it("escapes CDATA end markers in content", () => {
      const result = wrapKnowledgeDocument("id1", "Title", "text ]]> more");
      expect(result).toContain("]]>]]><![CDATA[>");
    });
  });

  describe("findLastPageMarker", () => {
    it("returns maxPos when no markers found", () => {
      const result = findLastPageMarker("plain text without markers", 100);
      expect(result).toBe(100);
    });

    it("finds last marker before maxPos", () => {
      const text = "start [Pag. 1] middle [Pag. 2] end";
      // text.length = 34, both markers are before maxPos
      // The function returns the last marker's index
      const result = findLastPageMarker(text, text.length);
      // Last marker [Pag. 2] is at index 22, which is > 34*0.8=27.2? No, 22 < 27.2
      // So fallback to maxPos
      expect(result).toBe(text.length);
    });

    it("returns marker position when close enough to maxPos", () => {
      // The function only returns marker position if it's > maxPos * 0.8
      const text = `${"A".repeat(90)}[Pag. 1]${"B".repeat(10)}`;
      // text.length = 108, marker at 90
      // maxPos = 100, 90 > 100*0.8=80, so returns 90
      const result = findLastPageMarker(text, 100);
      expect(result).toBe(90);
    });

    it("does not go beyond maxPos", () => {
      const text = "[Pag. 1] short [Pag. 2] after";
      const result = findLastPageMarker(text, 10);
      // Only [Pag. 1] at 0 is before maxPos=10. 0 < 10*0.8=8, so fallback to maxPos
      expect(result).toBe(10);
    });

    it("handles markers with varying spacing", () => {
      const text = "[Pag.  123] content";
      const result = findLastPageMarker(text, text.length);
      // [Pag.  123] matches regex \[Pag\.\s*\d+\], found at 0
      // 0 < text.length * 0.8, so returns text.length (fallback)
      expect(result).toBe(text.length);
    });
  });

  describe("truncateDocumentText", () => {
    it("returns text unchanged if under maxChars", () => {
      const text = "Short text";
      expect(truncateDocumentText(text, 100, undefined)).toBe(text);
    });

    it("truncates long text with notice", () => {
      const text = "A".repeat(200);
      const result = truncateDocumentText(text, 100, undefined);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result).toContain("[... texto truncado");
    });

    it("preserves PI tail for petição inicial", () => {
      const text = `${"A".repeat(50_000)}OAB/SP tail content`;
      const result = truncateDocumentText(text, 20_000, "pi");
      expect(result).toContain("[... texto truncado");
      // Should have content from the end
      expect(result.endsWith("OAB/SP tail content")).toBe(true);
    });
  });

  describe("getDocumentPartLabel", () => {
    it("returns 'Petição Inicial' for pi", () => {
      expect(getDocumentPartLabel("pi")).toBe("Petição Inicial");
    });

    it("returns 'Contestação' for contestacao", () => {
      expect(getDocumentPartLabel("contestacao")).toBe("Contestação");
    });

    it("returns 'Documento' for undefined", () => {
      expect(getDocumentPartLabel(undefined)).toBe("Documento");
    });

    it("returns 'Documento' for unknown type", () => {
      expect(getDocumentPartLabel("other")).toBe("Documento");
    });
  });

  describe("getDocumentPartExtractionHint", () => {
    it("includes PAGE_REF_RULE for all types", () => {
      expect(getDocumentPartExtractionHint("pi")).toContain(PAGE_REF_RULE);
      expect(getDocumentPartExtractionHint("contestacao")).toContain(
        PAGE_REF_RULE
      );
      expect(getDocumentPartExtractionHint(undefined)).toBe(PAGE_REF_RULE);
    });

    it("includes extraction hints for pi", () => {
      const hint = getDocumentPartExtractionHint("pi");
      expect(hint).toContain("número do processo");
      expect(hint).toContain("OAB");
    });

    it("includes extraction hints for contestacao", () => {
      const hint = getDocumentPartExtractionHint("contestacao");
      expect(hint).toContain("dados do contrato");
    });
  });

  describe("constants", () => {
    it("PI_TAIL_CHARS is 8000", () => {
      expect(PI_TAIL_CHARS).toBe(8000);
    });

    it("DOC_TYPE_ORDER puts pi first", () => {
      expect(DOC_TYPE_ORDER.pi).toBe(0);
      expect(DOC_TYPE_ORDER.contestacao).toBe(1);
      expect(DOC_TYPE_ORDER[""]).toBe(2);
    });
  });
});
