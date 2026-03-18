import { tool } from "ai";
import { z } from "zod";
import { searchInDocumentText } from "@/lib/ai/document-context";

/**
 * Factory para o tool `buscarNoProcesso`.
 *
 * Permite ao agente pesquisar no texto completo dos documentos anexados
 * (disponível em memória durante a sessão, mesmo após truncagem no contexto).
 *
 * Uso típico:
 *   buscarNoProcesso({ query: "SENTENÇA" })
 *   buscarNoProcesso({ query: "dano moral", documentName: "processo.pdf" })
 */
export function createSearchDocumentTool(opts: {
  documentTexts: Map<string, string>;
}) {
  const { documentTexts } = opts;

  return tool({
    description: `Pesquisa palavras-chave ou expressões no texto completo dos documentos anexados ao chat (processo judicial, PI, contestação, etc.).
Use quando precisar localizar secções específicas que possam não estar no excerto inicial do contexto, como:
- A sentença ou acórdão ("SENTENÇA", "DISPOSITIVO", "CONDENO")
- O laudo pericial ("LAUDO PERICIAL", "insalubridade", "horas extras")
- Cálculos de liquidação ("CONTA DE LIQUIDAÇÃO")
- Cláusulas contratuais, testemunhos, despachos específicos
- Qualquer pedido ou tese que não esteja visível no contexto atual

Devolve as páginas onde o termo foi encontrado, com contexto ao redor.`,
    inputSchema: z.object({
      query: z
        .string()
        .min(2)
        .max(200)
        .describe(
          "Palavra-chave ou expressão a pesquisar (ex.: 'SENTENÇA', 'dano moral', 'horas extras', 'DISPOSITIVO')"
        ),
      documentName: z
        .string()
        .optional()
        .describe(
          "Nome do documento a pesquisar (opcional). Se omitido, pesquisa em todos os documentos anexados."
        ),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(3)
        .describe("Número máximo de ocorrências a devolver (padrão: 3)"),
    }),
    execute: ({ query, documentName, maxResults }) => {
      if (documentTexts.size === 0) {
        return {
          found: false,
          message:
            "Nenhum documento com texto extraído está disponível nesta sessão.",
          results: [],
        };
      }

      // Decide which documents to search
      const docsToSearch: Array<{ name: string; text: string }> = [];
      if (documentName) {
        // Try exact match first, then partial match
        const exact = documentTexts.get(documentName);
        if (exact) {
          docsToSearch.push({ name: documentName, text: exact });
        } else {
          for (const [name, text] of documentTexts) {
            if (name.toLowerCase().includes(documentName.toLowerCase())) {
              docsToSearch.push({ name, text });
            }
          }
        }
        if (docsToSearch.length === 0) {
          const available = [...documentTexts.keys()].join(", ");
          return {
            found: false,
            message: `Documento "${documentName}" não encontrado. Documentos disponíveis: ${available}`,
            results: [],
          };
        }
      } else {
        for (const [name, text] of documentTexts) {
          docsToSearch.push({ name, text });
        }
      }

      const allResults: Array<{
        documentName: string;
        pageNum: number;
        snippet: string;
      }> = [];

      for (const doc of docsToSearch) {
        const hits = searchInDocumentText(doc.text, query, maxResults, 1);
        for (const hit of hits) {
          allResults.push({
            documentName: doc.name,
            pageNum: hit.pageNum,
            snippet: hit.snippet,
          });
          if (allResults.length >= maxResults) {
            break;
          }
        }
        if (allResults.length >= maxResults) {
          break;
        }
      }

      if (allResults.length === 0) {
        return {
          found: false,
          message: `Termo "${query}" não encontrado nos documentos pesquisados.`,
          results: [],
        };
      }

      return {
        found: true,
        totalFound: allResults.length,
        message: `Encontradas ${allResults.length} ocorrência(s) de "${query}".`,
        results: allResults.map((r) => ({
          document: r.documentName,
          page: r.pageNum > 0 ? `pg. ${r.pageNum}` : "posição não paginada",
          content: r.snippet.slice(0, 3000), // limit per result to avoid flooding context
        })),
      };
    },
  });
}
