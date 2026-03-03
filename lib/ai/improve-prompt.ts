import { generateText, Output } from "ai";
import { z } from "zod";
import { getTitleModel } from "@/lib/ai/providers";

export const IMPROVE_RESULT_SCHEMA = z.object({
  diagnosis: z
    .string()
    .describe(
      "Diagnóstico em 2-3 frases: o que faltava ou estava fraco no prompt original (clareza, estrutura, contexto, exemplos, formato de saída, persona, guardrails)."
    ),
  improvedPrompt: z
    .string()
    .describe(
      "Versão completa do prompt melhorado, pronta para uso. Mantém o idioma original e variáveis {{var}}. Usa XML tags quando apropriado."
    ),
  notes: z
    .string()
    .describe(
      "Lista breve (bullet ou numerada) do que foi alterado e por quê, em 3-6 itens."
    ),
});

export const IMPROVE_SYSTEM = `És um especialista em engenharia de prompts. Analisas e melhoras prompts com base nas melhores práticas consolidadas da Anthropic (Claude), OpenAI e Prompting Guide (DAIR.AI).

## Workflow

1. **Analisa** o prompt com um checklist mental:
   - Clareza: a tarefa está explícita? Há ambiguidade?
   - Estrutura: usa separadores/XML tags? Tem seções distintas?
   - Contexto: fornece background suficiente?
   - Exemplos: inclui few-shot quando a tarefa beneficia?
   - Formato de saída: define como a resposta deve ser?
   - Persona/papel: define quem o modelo deve ser?
   - Raciocínio: tarefas analíticas incentivam passo-a-passo?
   - Guardrails: define limites e o que NÃO fazer?

2. **Classifica** o tipo (extração, geração, análise/raciocínio, código, agentes, conversacional) para aplicar técnicas adequadas.

3. **Aplica** técnicas por prioridade: clareza e especificidade; estrutura com XML tags (instructions, context, examples, output_format, constraints); few-shot quando útil; chain-of-thought para análise; formato de saída explícito; persona e contexto; guardrails.

## Regras ao gerar o prompt melhorado

- Mantém o **idioma original** do prompt (português ou inglês).
- Preserva **todas as variáveis** no formato {{var}} ou \${var} do prompt original.
- Usa **XML tags** para estruturar seções quando fizer sentido (otimizado para Claude).
- Não inventes conteúdo que o utilizador não pediu; estrutura e clarifica o que já está lá.
- Para tarefas simples, evita over-engineering; para tarefas complexas, aplica decomposição e formato de saída.
- Instruções positivas preferidas a listas longas de "não faças".
- Ordem recomendada em contexto longo: documentos/contexto primeiro, query no final.

## Formato de resposta

Deves responder em JSON com exatamente três campos:
- diagnosis: 2-3 frases sobre o que faltava ou estava fraco no original.
- improvedPrompt: o prompt melhorado completo (texto pronto a copiar).
- notes: lista breve do que mudou e por quê (3-6 itens).`;

export const MAX_PROMPT_LENGTH = 4000;

export interface ImprovePromptResult {
  improvedPrompt: string;
  diagnosis: string;
  notes: string;
}

/**
 * Melhora um prompt com base em boas práticas de engenharia de prompts.
 * Usado pela API /api/prompt/improve e pela tool improvePrompt do chat.
 */
export async function improvePrompt(raw: string): Promise<ImprovePromptResult> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("O prompt não pode estar vazio.");
  }
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    throw new Error(
      `O prompt não pode exceder ${MAX_PROMPT_LENGTH} caracteres.`
    );
  }

  const { output } = await generateText({
    model: getTitleModel(),
    system: IMPROVE_SYSTEM,
    prompt: `Melhora o seguinte prompt do utilizador. Responde em JSON com os campos diagnosis, improvedPrompt e notes.\n\n<prompt_original>\n${trimmed}\n</prompt_original>`,
    maxOutputTokens: 4000,
    output: Output.object({
      schema: IMPROVE_RESULT_SCHEMA,
      name: "PromptImproveResult",
      description:
        "Resultado da melhoria: diagnóstico, prompt melhorado e notas de alteração",
    }),
  });

  const parsed = IMPROVE_RESULT_SCHEMA.safeParse(output);
  if (!parsed.success) {
    throw new Error("Resposta do modelo inválida. Tente novamente.");
  }

  const { diagnosis, improvedPrompt, notes } = parsed.data;
  return {
    improvedPrompt: improvedPrompt.trim(),
    diagnosis: diagnosis.trim(),
    notes: notes.trim(),
  };
}
