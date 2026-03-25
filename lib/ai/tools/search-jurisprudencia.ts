/**
 * Tool searchJurisprudencia — Busca semântica na base de jurisprudência do utilizador.
 *
 * Pesquisa acórdãos, súmulas, OJs e teses doutrinárias indexados na Knowledge Base
 * via pgvector (similaridade cossenoidal). Usa allUserDocs=true para cobrir todos os
 * documentos do utilizador sem necessidade de seleção manual.
 *
 * Sprint 7 (ASSISTJUR-PRD-ALINHAMENTO.md §4.2 tarefa 3).
 * Registrar em agentes com useSearchJurisprudenciaTool=true (Master, Revisor).
 */

import { tool } from "ai";
import { z } from "zod";
import { retrieveKnowledgeContext } from "@/lib/rag";

/** Limite padrão de chunks devolvidos (overFetch 2× internamente → reranking). */
const DEFAULT_LIMIT = 8;

export function createSearchJurisprudenciaTool(opts: { userId: string }) {
  const { userId } = opts;

  return tool({
    description:
      "Busca jurisprudência, súmulas, OJs, acórdãos e teses doutrinárias na base de conhecimento do escritório. " +
      "Use quando precisar de fundamentos jurídicos específicos para sustentar teses na análise ou elaboração de peças. " +
      "Exemplos: 'Súmula 437 TST jornada', 'acórdão horas extras bancário', 'OJ 82 SDI-1 aviso prévio', " +
      "'tese dispensa discriminatória Súmula 443', 'CLT art. 461 equiparação salarial'. " +
      "Retorna os excertos mais relevantes com título do documento-fonte e similaridade.",
    inputSchema: z.object({
      query: z
        .string()
        .min(3)
        .max(300)
        .describe(
          "Expressão de busca jurídica (ex.: 'Súmula 437 TST horas extras', 'dano moral dispensa discriminatória')"
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(DEFAULT_LIMIT)
        .describe(
          `Número máximo de excertos a devolver (padrão: ${DEFAULT_LIMIT})`
        ),
    }),
    execute: async ({ query, limit }) => {
      try {
        const chunks = await retrieveKnowledgeContext({
          userId,
          documentIds: [],
          queryText: query,
          limit: limit ?? DEFAULT_LIMIT,
          allUserDocs: true,
          overFetch: true,
          minSimilarity: 0.2,
        });

        if (chunks.length === 0) {
          return {
            found: false,
            total: 0,
            message:
              "Nenhum resultado encontrado na base de conhecimento para esta query. " +
              "Verifique se há documentos jurídicos indexados (acórdãos, súmulas, OJs) ou reformule a busca.",
            results: [],
          };
        }

        return {
          found: true,
          total: chunks.length,
          message: `Encontrados ${chunks.length} excerto(s) relevante(s) para "${query}".`,
          results: chunks.map((c) => ({
            fonte: c.title,
            documentId: c.knowledgeDocumentId,
            similaridade: c.similarity !== undefined ? Math.round(c.similarity * 100) / 100 : null,
            excerto: c.text.slice(0, 2000),
          })),
        };
      } catch {
        return {
          found: false,
          total: 0,
          message:
            "Erro ao consultar a base de conhecimento. A busca por jurisprudência não está disponível no momento.",
          results: [],
        };
      }
    },
  });
}
