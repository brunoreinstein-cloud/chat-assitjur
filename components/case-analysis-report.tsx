"use client";

import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BriefcaseIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDotIcon,
  ClipboardListIcon,
  DownloadIcon,
  FileTextIcon,
  InfoIcon,
  ListChecksIcon,
  ScaleIcon,
  UserIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  RISCO_CLASSES,
  RISCO_DOT,
  RISCO_LABEL,
} from "@/lib/constants/processo";
import type {
  Alerta,
  DocumentoStatus,
  NivelRisco,
  Pedido,
  ProximoPasso,
  RelatorioAnalise,
  TipoAlerta,
} from "@/lib/legal/case-analysis.types";

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  // Aceita YYYY-MM-DD ou string livre
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return iso;
}

// ---------------------------------------------------------------------------
// Subcomponente: cabeçalho de secção colapsável
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  badge,
  open,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  title: string;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
      onClick={onToggle}
      type="button"
    >
      <Icon className="size-4 shrink-0 text-primary" />
      <span className="flex-1 font-semibold text-sm">{title}</span>
      {badge}
      <ChevronDownIcon
        className={cn(
          "ml-1 size-3.5 text-muted-foreground transition-transform shrink-0",
          open && "rotate-180"
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente: row de campo label + valor
// ---------------------------------------------------------------------------

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1 text-sm border-b border-border/20 last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-xs break-words">{value ?? "—"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// M1 — Identificação
// ---------------------------------------------------------------------------

function ModuloIdentificacao({ data }: { data: RelatorioAnalise }) {
  const { identificacao: id } = data;
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b border-border/40">
      <SectionHeader
        badge={
          id.numeroProcesso ? (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {id.numeroProcesso}
            </span>
          ) : undefined
        }
        icon={ScaleIcon}
        onToggle={() => setOpen((v) => !v)}
        open={open}
        title="M1 — Identificação do Processo"
      />
      {open && (
        <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
              Reclamante
            </p>
            <FieldRow label="Nome" value={id.reclamante.nome} />
            <FieldRow label="CPF/CNPJ" value={id.reclamante.cpfCnpj} />
            <FieldRow label="Localidade" value={id.reclamante.localidade} />
            {id.advogadoReclamante && (
              <>
                <FieldRow
                  label="Advogado"
                  value={id.advogadoReclamante.nome}
                />
                <FieldRow label="OAB" value={id.advogadoReclamante.oab} />
              </>
            )}
          </div>
          <div>
            <p className="mb-1 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
              Reclamada
            </p>
            <FieldRow label="Nome" value={id.reclamada.nome} />
            <FieldRow label="CPF/CNPJ" value={id.reclamada.cpfCnpj} />
            <FieldRow label="Localidade" value={id.reclamada.localidade} />
            {id.advogadoReclamada && (
              <>
                <FieldRow
                  label="Advogado"
                  value={id.advogadoReclamada.nome}
                />
                <FieldRow label="OAB" value={id.advogadoReclamada.oab} />
              </>
            )}
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
              Processo
            </p>
            <FieldRow label="Vara" value={id.vara} />
            <FieldRow label="Comarca" value={id.comarca} />
            <FieldRow
              label="Ajuizamento"
              value={formatDate(id.dataAjuizamento)}
            />
            <FieldRow
              label="Audiência"
              value={formatDate(id.dataAudiencia)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// M2 — Dados do Contrato
// ---------------------------------------------------------------------------

function ModuloContrato({ data }: { data: RelatorioAnalise }) {
  const { contrato: c } = data;
  const [open, setOpen] = useState(true);
  const [showEventos, setShowEventos] = useState(false);

  return (
    <div className="border-b border-border/40">
      <SectionHeader
        icon={BriefcaseIcon}
        onToggle={() => setOpen((v) => !v)}
        open={open}
        title="M2 — Dados do Contrato"
      />
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid gap-0 sm:grid-cols-2">
            <div>
              <p className="mb-1 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
                Contrato
              </p>
              <FieldRow label="Admissão" value={formatDate(c.admissao)} />
              <FieldRow label="Término" value={formatDate(c.termino)} />
              <FieldRow label="Rescisão" value={c.modalidadeRescisao} />
            </div>
            <div>
              <p className="mb-1 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
                Cargo & Salário
              </p>
              <FieldRow label="Cargo CTPS" value={c.cargoCtps} />
              <FieldRow label="Cargo real" value={c.cargoReal} />
              <FieldRow
                label="Salário inicial"
                value={formatCurrency(c.salarioInicial)}
              />
              <FieldRow
                label="Salário final"
                value={formatCurrency(c.salarioFinal)}
              />
            </div>
          </div>

          {c.jornadaAlegada && (
            <div>
              <p className="mb-1 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
                Jornada Alegada
              </p>
              <FieldRow label="Escala" value={c.jornadaAlegada.escala} />
              {c.jornadaAlegada.horarios.length > 0 && (
                <FieldRow
                  label="Horários"
                  value={c.jornadaAlegada.horarios.join(" | ")}
                />
              )}
              {c.jornadaAlegada.observacoes && (
                <FieldRow
                  label="Observações"
                  value={c.jornadaAlegada.observacoes}
                />
              )}
            </div>
          )}

          {c.eventosCronologicos.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowEventos((v) => !v)}
                type="button"
              >
                <ChevronDownIcon
                  className={cn(
                    "size-3 transition-transform",
                    showEventos && "rotate-180"
                  )}
                />
                Cronologia ({c.eventosCronologicos.length} eventos)
              </button>
              {showEventos && (
                <ol className="mt-2 space-y-1 border-l-2 border-primary/20 pl-3">
                  {c.eventosCronologicos.map((ev, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list
                    <li className="relative" key={i}>
                      <span className="absolute -left-4 top-0.5 size-2 rounded-full bg-primary/30" />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatDate(ev.data)}
                      </span>{" "}
                      <span className="text-[11px]">{ev.descricao}</span>
                      {ev.pagReferencia && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({ev.pagReferencia})
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// M3 — Mapa de Pedidos
// ---------------------------------------------------------------------------

function RiscoBadge({ risco }: { risco: NivelRisco | null }) {
  if (!risco) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold",
        RISCO_CLASSES[risco]
      )}
    >
      <span className={cn("size-1.5 rounded-full", RISCO_DOT[risco])} />
      {RISCO_LABEL[risco]}
    </span>
  );
}

function ModuloPedidos({ data }: { data: RelatorioAnalise }) {
  const { pedidos, valorTotalPleiteado } = data;
  const [open, setOpen] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const badge = (
    <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
      {pedidos.length} pedidos · {formatCurrency(valorTotalPleiteado)}
    </span>
  );

  return (
    <div className="border-b border-border/40">
      <SectionHeader
        badge={badge}
        icon={ClipboardListIcon}
        onToggle={() => setOpen((v) => !v)}
        open={open}
        title="M3 — Mapa de Pedidos"
      />
      {open && (
        <div className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/40 text-left text-muted-foreground">
                  <th className="pb-1.5 pr-2 font-medium w-6">#</th>
                  <th className="pb-1.5 pr-2 font-medium">Verba</th>
                  <th className="pb-1.5 pr-2 font-medium text-right">
                    Valor
                  </th>
                  <th className="pb-1.5 font-medium">Risco</th>
                  <th className="pb-1.5 w-6" />
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p, i) => (
                  <>
                    <tr
                      className={cn(
                        "border-b border-border/20 hover:bg-muted/20 cursor-pointer transition-colors",
                        expandedIdx === i && "bg-muted/20"
                      )}
                      // biome-ignore lint/suspicious/noArrayIndexKey: static list
                      key={i}
                      onClick={() =>
                        setExpandedIdx(expandedIdx === i ? null : i)
                      }
                    >
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {p.numero}
                      </td>
                      <td className="py-1.5 pr-2 font-medium">{p.verba}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">
                        {formatCurrency(p.valorPleiteado)}
                      </td>
                      <td className="py-1.5">
                        <RiscoBadge risco={p.risco} />
                      </td>
                      <td className="py-1.5 text-muted-foreground">
                        <ChevronDownIcon
                          className={cn(
                            "size-3 transition-transform",
                            expandedIdx === i && "rotate-180"
                          )}
                        />
                      </td>
                    </tr>
                    {expandedIdx === i && (
                      <tr
                        className="bg-muted/10"
                        // biome-ignore lint/suspicious/noArrayIndexKey: static list
                        key={`${i}-detail`}
                      >
                        <td className="pb-2 pl-4" colSpan={5}>
                          <div className="space-y-1 pt-1">
                            {p.fundamentoLegal && (
                              <p className="text-[10px]">
                                <span className="text-muted-foreground">
                                  Fundamento:{" "}
                                </span>
                                {p.fundamentoLegal}
                              </p>
                            )}
                            {p.provas.length > 0 && (
                              <p className="text-[10px]">
                                <span className="text-muted-foreground">
                                  Provas:{" "}
                                </span>
                                {p.provas.join(", ")}
                              </p>
                            )}
                            {p.observacoes && (
                              <p className="text-[10px] italic text-muted-foreground">
                                {p.observacoes}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              {valorTotalPleiteado !== null && (
                <tfoot>
                  <tr className="border-t-2 border-border/60">
                    <td className="pt-1.5 text-muted-foreground" colSpan={2}>
                      <span className="font-semibold">Total pleiteado</span>
                    </td>
                    <td className="pt-1.5 text-right font-bold font-mono">
                      {formatCurrency(valorTotalPleiteado)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// M4 — Alertas
// ---------------------------------------------------------------------------

const ALERTA_CONFIG: Record<
  TipoAlerta,
  {
    icon: React.ComponentType<{ className?: string; size?: number }>;
    classes: string;
    label: string;
  }
> = {
  critico: {
    icon: XCircleIcon,
    classes: "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400",
    label: "Crítico",
  },
  atencao: {
    icon: AlertTriangleIcon,
    classes:
      "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400",
    label: "Atenção",
  },
  informativo: {
    icon: InfoIcon,
    classes:
      "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400",
    label: "Info",
  },
};

function AlertaCard({ alerta }: { alerta: Alerta }) {
  const cfg = ALERTA_CONFIG[alerta.tipo];
  const Icon = cfg.icon;
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 flex gap-2",
        cfg.classes
      )}
    >
      <Icon className="size-3.5 mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[10px] uppercase tracking-wider">
            {cfg.label}
          </span>
          <span className="text-[10px] opacity-60">{alerta.modulo}</span>
        </div>
        <p className="text-[11px]">{alerta.mensagem}</p>
        {alerta.acao && (
          <p className="text-[10px] opacity-75 italic">→ {alerta.acao}</p>
        )}
      </div>
    </div>
  );
}

function ModuloAlertas({ data }: { data: RelatorioAnalise }) {
  const { alertas } = data;
  const [open, setOpen] = useState(true);
  const criticos = alertas.filter((a) => a.tipo === "critico").length;

  const badge =
    criticos > 0 ? (
      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
        {criticos} crítico{criticos > 1 ? "s" : ""}
      </span>
    ) : alertas.length > 0 ? (
      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
        {alertas.length}
      </span>
    ) : (
      <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">
        Sem alertas
      </span>
    );

  return (
    <div className="border-b border-border/40">
      <SectionHeader
        badge={badge}
        icon={AlertCircleIcon}
        onToggle={() => setOpen((v) => !v)}
        open={open}
        title="M4 — Alertas e Pontos de Atenção"
      />
      {open && (
        <div className="space-y-2 px-4 pb-4">
          {alertas.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nenhum alerta identificado.
            </p>
          ) : (
            alertas.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list
              <AlertaCard alerta={a} key={i} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// M5 — Documentos
// ---------------------------------------------------------------------------

const DOC_STATUS_CONFIG: Record<
  DocumentoStatus["status"],
  { icon: React.ComponentType<{ className?: string }>; classes: string }
> = {
  disponivel: {
    icon: CheckCircle2Icon,
    classes: "text-green-600 dark:text-green-400",
  },
  parcial: {
    icon: AlertTriangleIcon,
    classes: "text-amber-600 dark:text-amber-400",
  },
  ausente: { icon: XCircleIcon, classes: "text-red-600 dark:text-red-400" },
};

function ModuloDocumentos({ data }: { data: RelatorioAnalise }) {
  const { documentos } = data;
  const [open, setOpen] = useState(false);
  const ausentes = documentos.filter((d) => d.status === "ausente").length;

  const badge =
    ausentes > 0 ? (
      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
        {ausentes} em falta
      </span>
    ) : (
      <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">
        Completo
      </span>
    );

  return (
    <div className="border-b border-border/40">
      <SectionHeader
        badge={badge}
        icon={FileTextIcon}
        onToggle={() => setOpen((v) => !v)}
        open={open}
        title="M5 — Documentos"
      />
      {open && (
        <div className="px-4 pb-4 space-y-1">
          {documentos.map((doc, i) => {
            const cfg = DOC_STATUS_CONFIG[doc.status];
            const Icon = cfg.icon;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list
              <div className="flex items-start gap-2 py-1 border-b border-border/20 last:border-0" key={i}>
                <Icon className={cn("size-3.5 mt-0.5 shrink-0", cfg.classes)} />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium">{doc.nome}</span>
                  {doc.paginas && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {doc.paginas}
                    </span>
                  )}
                  {doc.observacoes && (
                    <p className="text-[10px] text-muted-foreground">
                      {doc.observacoes}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// M6 — Próximos Passos
// ---------------------------------------------------------------------------

const RESPONSAVEL_LABEL: Record<ProximoPasso["responsavel"], string> = {
  advogado: "Advogado",
  ia: "IA",
  sistema: "Sistema",
};

const PRIORIDADE_CLASSES: Record<
  ProximoPasso["prioridade"],
  string
> = {
  alta: "text-red-600 dark:text-red-400",
  media: "text-amber-600 dark:text-amber-400",
  baixa: "text-muted-foreground",
};

function ModuloProximosPassos({ data }: { data: RelatorioAnalise }) {
  const { proximosPassos } = data;
  const [open, setOpen] = useState(true);
  const pendentes = proximosPassos.filter((p) => !p.concluido).length;

  const badge = (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
      {pendentes} pendente{pendentes !== 1 ? "s" : ""}
    </span>
  );

  return (
    <div>
      <SectionHeader
        badge={badge}
        icon={ListChecksIcon}
        onToggle={() => setOpen((v) => !v)}
        open={open}
        title="M6 — Próximos Passos"
      />
      {open && (
        <div className="px-4 pb-4 space-y-1.5">
          {proximosPassos.map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list
            <div
              className={cn(
                "flex items-start gap-2 py-1.5 px-2 rounded-lg border border-border/20",
                p.concluido && "opacity-50"
              )}
              key={i}
            >
              <CircleDotIcon
                className={cn(
                  "size-3.5 mt-0.5 shrink-0",
                  p.concluido
                    ? "text-green-500"
                    : PRIORIDADE_CLASSES[p.prioridade]
                )}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-[11px]",
                    p.concluido && "line-through"
                  )}
                >
                  {p.descricao}
                </p>
              </div>
              <span className="shrink-0 rounded px-1 py-0.5 bg-muted text-[9px] text-muted-foreground font-medium">
                {RESPONSAVEL_LABEL[p.responsavel]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function CaseAnalysisReport({
  data,
  onExportDocx,
}: {
  data: RelatorioAnalise;
  /** Callback para exportar o relatório como .docx (opcional). */
  onExportDocx?: () => void;
}) {
  const { identificacao: id } = data;
  const nomeProcesso =
    id.numeroProcesso ??
    `${id.reclamante.nome} × ${id.reclamada.nome}`;

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm">
      {/* Header geral */}
      <div className="flex items-center gap-2.5 border-b border-border/40 bg-muted/30 px-4 py-3">
        <UserIcon className="size-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">
            Relatório de Análise — {nomeProcesso}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Gerado em{" "}
            {new Date(data.geradoEm).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        {onExportDocx && (
          <button
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted/50 transition-colors shrink-0"
            onClick={onExportDocx}
            title="Exportar como Word (.docx)"
            type="button"
          >
            <DownloadIcon className="size-3.5" />
            .docx
          </button>
        )}
      </div>

      {/* Módulos */}
      <ModuloIdentificacao data={data} />
      <ModuloContrato data={data} />
      <ModuloPedidos data={data} />
      <ModuloAlertas data={data} />
      <ModuloDocumentos data={data} />
      <ModuloProximosPassos data={data} />
    </div>
  );
}
