"use client";

/**
 * Dicas no empty state quando o agente Redator de Contestações está selecionado.
 * Explica os dois modos (Modelo e @bancodetese) e o que enviar.
 */
export function RedatorContestacaoHint() {
  return (
    <section
      aria-label="Como usar o Redator de Contestações"
      className="mx-auto w-full max-w-2xl rounded-lg border border-border bg-muted/30 px-4 py-3"
      data-testid="redator-contestacao-hint"
    >
      <h3 className="mb-2 font-medium text-foreground text-sm">
        Redator de Contestações — como começar
      </h3>
      <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
        <li>
          <strong className="text-foreground">Modo Modelo:</strong> envie a
          Petição Inicial e um modelo/template de contestação (DOCX). O agente
          replica o modelo e adapta ao caso.
        </li>
        <li>
          <strong className="text-foreground">Modo @bancodetese:</strong> selecione
          os documentos na <strong className="text-foreground">Base de conhecimento</strong>{" "}
          (sidebar) e envie a Petição Inicial; o agente usa essa base como banco de teses.
          Pode também referenciar <code className="rounded bg-muted px-1 text-xs">@bancodetese</code> na
          mensagem. Não é necessário anexar de novo — o agente valida primeiro o que está no contexto.
        </li>
      </ul>
      <p className="mt-2 text-muted-foreground text-xs">
        Em ambos os modos o agente valida os documentos, aplica gates de
        qualidade e entrega minuta com campos pendentes destacados. Após o mapa
        preliminar, confirme com &quot;CONFIRMAR&quot; para prosseguir à redação.
      </p>
    </section>
  );
}
