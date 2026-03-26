/**
 * Framework de avaliação automatizada por agente — Sprint 6 §14.5.2
 *
 * Define:
 * - EvalCase: caso de teste com input, critérios esperados
 * - EvalResult: resultado com score e detalhes
 * - EvalSuite: coleção de casos por agente
 * - runEvalSuite: runner que executa todos os casos
 *
 * Scoring: baseado em critérios determinísticos (sem LLM-as-judge na v1).
 * LLM-as-judge será adicionado na v2 quando tivermos budget de API para evals.
 */

// ─── Tipos ───────────────────────────────────────────────────────────

export interface EvalCriteria {
  /** Nome do critério (ex: "contém CNJ", "menciona prescrição") */
  name: string;
  /** Tipo de verificação */
  type:
    | "contains"
    | "not_contains"
    | "regex"
    | "min_length"
    | "max_length"
    | "custom";
  /** Valor esperado (string para contains/regex, number para length) */
  expected: string | number;
  /** Peso do critério no score final (0-1). Default: 1. */
  weight?: number;
  /** Função custom de verificação (para type: "custom") */
  customFn?: (output: string) => boolean;
}

export interface EvalCase {
  /** ID único do caso */
  id: string;
  /** Descrição do que está sendo testado */
  description: string;
  /** ID do agente alvo */
  agentId: string;
  /** Input (mensagem do utilizador) */
  input: string;
  /** Critérios de avaliação */
  criteria: EvalCriteria[];
  /** Tags para filtragem (ex: "prescrição", "dano-moral") */
  tags?: string[];
}

export interface EvalCriteriaResult {
  criteriaName: string;
  passed: boolean;
  weight: number;
  detail?: string;
}

export interface EvalResult {
  caseId: string;
  agentId: string;
  /** Score 0-100 (média ponderada dos critérios) */
  score: number;
  /** Todos os critérios passaram? */
  passed: boolean;
  /** Resultados individuais por critério */
  criteriaResults: EvalCriteriaResult[];
  /** Duração da avaliação (ms) */
  durationMs: number;
  /** Timestamp */
  evaluatedAt: string;
}

export interface EvalSuiteResult {
  agentId: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  /** Score médio (0-100) */
  averageScore: number;
  results: EvalResult[];
  /** Duração total (ms) */
  totalDurationMs: number;
}

// ─── Verificadores de critérios ──────────────────────────────────────

function evaluateCriteria(
  output: string,
  criteria: EvalCriteria
): EvalCriteriaResult {
  const weight = criteria.weight ?? 1;

  switch (criteria.type) {
    case "contains": {
      const expected = String(criteria.expected);
      const passed = output.toLowerCase().includes(expected.toLowerCase());
      return {
        criteriaName: criteria.name,
        passed,
        weight,
        detail: passed ? `Contém "${expected}"` : `Não contém "${expected}"`,
      };
    }

    case "not_contains": {
      const expected = String(criteria.expected);
      const passed = !output.toLowerCase().includes(expected.toLowerCase());
      return {
        criteriaName: criteria.name,
        passed,
        weight,
        detail: passed
          ? `Não contém "${expected}" (correto)`
          : `Contém "${expected}" (não deveria)`,
      };
    }

    case "regex": {
      const regex = new RegExp(String(criteria.expected), "i");
      const passed = regex.test(output);
      return {
        criteriaName: criteria.name,
        passed,
        weight,
        detail: passed
          ? `Match regex /${criteria.expected}/`
          : `Sem match para /${criteria.expected}/`,
      };
    }

    case "min_length": {
      const minLen = Number(criteria.expected);
      const passed = output.length >= minLen;
      return {
        criteriaName: criteria.name,
        passed,
        weight,
        detail: `${output.length} chars (min: ${minLen})`,
      };
    }

    case "max_length": {
      const maxLen = Number(criteria.expected);
      const passed = output.length <= maxLen;
      return {
        criteriaName: criteria.name,
        passed,
        weight,
        detail: `${output.length} chars (max: ${maxLen})`,
      };
    }

    case "custom": {
      if (!criteria.customFn) {
        return {
          criteriaName: criteria.name,
          passed: false,
          weight,
          detail: "Custom function não definida",
        };
      }
      const passed = criteria.customFn(output);
      return {
        criteriaName: criteria.name,
        passed,
        weight,
        detail: passed ? "Custom check OK" : "Custom check falhou",
      };
    }

    default:
      return {
        criteriaName: criteria.name,
        passed: false,
        weight,
        detail: `Tipo desconhecido: ${criteria.type}`,
      };
  }
}

// ─── Runner ──────────────────────────────────────────────────────────

/**
 * Avalia um output contra os critérios de um caso de teste.
 * Não chama LLM — avaliação determinística pura.
 */
export function evaluateCase(evalCase: EvalCase, output: string): EvalResult {
  const start = Date.now();
  const criteriaResults = evalCase.criteria.map((c) =>
    evaluateCriteria(output, c)
  );

  const totalWeight = criteriaResults.reduce((sum, r) => sum + r.weight, 0);
  const weightedScore =
    totalWeight > 0
      ? criteriaResults.reduce((sum, r) => sum + (r.passed ? r.weight : 0), 0) /
        totalWeight
      : 0;

  return {
    caseId: evalCase.id,
    agentId: evalCase.agentId,
    score: Math.round(weightedScore * 100),
    passed: criteriaResults.every((r) => r.passed),
    criteriaResults,
    durationMs: Date.now() - start,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Agrega resultados de uma suite de avaliação.
 */
export function aggregateSuiteResults(
  agentId: string,
  results: EvalResult[]
): EvalSuiteResult {
  const passedCases = results.filter((r) => r.passed).length;
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  return {
    agentId,
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    averageScore:
      results.length > 0 ? Math.round(totalScore / results.length) : 0,
    results,
    totalDurationMs: totalDuration,
  };
}

/**
 * Gera relatório markdown de uma suite de avaliação.
 */
export function formatSuiteReport(suite: EvalSuiteResult): string {
  const lines: string[] = [
    `## Eval Report: ${suite.agentId}`,
    "",
    "| Métrica | Valor |",
    "|---------|-------|",
    `| Total de casos | ${suite.totalCases} |`,
    `| Passaram | ${suite.passedCases} (${Math.round((suite.passedCases / Math.max(suite.totalCases, 1)) * 100)}%) |`,
    `| Falharam | ${suite.failedCases} |`,
    `| Score médio | ${suite.averageScore}/100 |`,
    `| Duração total | ${suite.totalDurationMs}ms |`,
    "",
  ];

  // Detalhe dos casos falhados
  const failed = suite.results.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push("### Casos falhados");
    for (const result of failed) {
      lines.push(`\n**${result.caseId}** (score: ${result.score}/100)`);
      for (const cr of result.criteriaResults) {
        const emoji = cr.passed ? "✅" : "❌";
        lines.push(`- ${emoji} ${cr.criteriaName}: ${cr.detail}`);
      }
    }
  }

  return lines.join("\n");
}
