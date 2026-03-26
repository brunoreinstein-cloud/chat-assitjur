"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

/**
 * Command Palette global (⌘K / Ctrl+K).
 *
 * Ações disponíveis:
 * - 14 módulos do Master (M01–M14)
 * - Seleção de agente
 * - Navegação rápida
 *
 * Usa cmdk (já instalado) via shadcn Command.
 */

// ─── Dados ───────────────────────────────────────────────────────────

interface PaletteItem {
  id: string;
  label: string;
  description: string;
  keywords: string;
  icon: string;
  action: string;
  group: string;
  badge?: string;
}

const MASTER_MODULES: PaletteItem[] = [
  {
    id: "M01",
    label: "/relatorio-processual",
    description: "Relatório processual genérico",
    keywords: "relatorio processual generico docx",
    icon: "📋",
    action: "/relatorio-processual",
    group: "Relatórios",
    badge: "DOCX",
  },
  {
    id: "M02",
    label: "/carta-prognostico",
    description: "Carta de prognóstico com risco",
    keywords: "carta prognostico risco avaliacao",
    icon: "📊",
    action: "/carta-prognostico",
    group: "Relatórios",
    badge: "DOCX",
  },
  {
    id: "M03",
    label: "/relatorio-master",
    description: "Relatório Master (20 secções)",
    keywords: "relatorio master completo 20 secoes",
    icon: "📑",
    action: "/relatorio-master",
    group: "Relatórios",
    badge: "DOCX",
  },
  {
    id: "M04",
    label: "/relatorio-dpsp",
    description: "Template DPSP (Drogaria São Paulo)",
    keywords: "dpsp drogaria sao paulo template",
    icon: "🏪",
    action: "/relatorio-dpsp",
    group: "Relatórios",
    badge: "DOCX",
  },
  {
    id: "M05",
    label: "/obf",
    description: "Formulário Obrigação de Fazer (GPA)",
    keywords: "obf obrigacao fazer gpa formulario reintegracao",
    icon: "📝",
    action: "/obf",
    group: "Formulários",
    badge: "Form",
  },
  {
    id: "M06",
    label: "/ficha-apolice",
    description: "Ficha de apólice de seguro",
    keywords: "ficha apolice seguro garantia",
    icon: "🛡️",
    action: "/ficha-apolice",
    group: "Formulários",
    badge: "DOCX",
  },
  {
    id: "M07",
    label: "/auditoria",
    description: "Auditoria corporativa",
    keywords: "auditoria corporativa empresa compliance",
    icon: "🔍",
    action: "/auditoria",
    group: "Avançados",
    badge: "DOCX+XLSX",
  },
  {
    id: "M08",
    label: "/cadastro-elaw",
    description: "Cadastro para upload no eLaw",
    keywords: "cadastro elaw upload sistema planilha",
    icon: "📤",
    action: "/cadastro-elaw",
    group: "Formulários",
    badge: "XLSX",
  },
  {
    id: "M09",
    label: "/encerramento",
    description: "Classificação de encerramento",
    keywords: "encerramento classificacao resultado fechamento",
    icon: "✅",
    action: "/encerramento",
    group: "Formulários",
    badge: "XLSX",
  },
  {
    id: "M10",
    label: "/aquisicao-creditos",
    description: "Due diligence para fundos",
    keywords: "aquisicao creditos cessao fundo securitizadora due diligence",
    icon: "💰",
    action: "/aquisicao-creditos",
    group: "Avançados",
    badge: "XLSX",
  },
  {
    id: "M11",
    label: "/analise-tst",
    description: "Análise estratégica TST",
    keywords: "tst recurso revista analise estrategica tribunal superior",
    icon: "⚖️",
    action: "/analise-tst",
    group: "Avançados",
    badge: "DOCX",
  },
  {
    id: "M12",
    label: "/modelo-br",
    description: "Modelo simplificado BR (~50 campos)",
    keywords: "modelo br simplificado 50 campos rapido",
    icon: "📄",
    action: "/modelo-br",
    group: "Relatórios",
    badge: "DOCX",
  },
  {
    id: "M13",
    label: "/completo",
    description: "Relatório completo A-P (~250 campos)",
    keywords: "completo master a-p 250 campos integral",
    icon: "📚",
    action: "/completo",
    group: "Avançados",
    badge: "DOCX",
  },
  {
    id: "M14",
    label: "/extracao-calculos",
    description: "Extração de cálculos de liquidação",
    keywords: "extracao calculos liquidacao valores json",
    icon: "🔢",
    action: "/extracao-calculos",
    group: "Avançados",
    badge: "JSON",
  },
];

const AGENTS: PaletteItem[] = [
  {
    id: "agent-revisor",
    label: "Revisor de Defesas",
    description: "Analisa PI + Contestação, gera parecer",
    keywords: "revisor defesas parecer analise contestacao",
    icon: "🔎",
    action: "agent:revisor-defesas",
    group: "Agentes",
  },
  {
    id: "agent-redator",
    label: "Redator de Contestações",
    description: "Redige contestação a partir da PI",
    keywords: "redator contestacao redacao peca",
    icon: "✍️",
    action: "agent:redator-contestacao",
    group: "Agentes",
  },
  {
    id: "agent-avaliador",
    label: "Avaliador",
    description: "Avalia qualidade de peças (score 0-100)",
    keywords: "avaliador qualidade score nota",
    icon: "📊",
    action: "agent:avaliador-contestacao",
    group: "Agentes",
  },
  {
    id: "agent-master",
    label: "AssistJur Master",
    description: "14 módulos: relatórios, cadastros, extrações",
    keywords: "master modulos relatorio cadastro extracao",
    icon: "🧠",
    action: "agent:assistjur-master",
    group: "Agentes",
  },
  {
    id: "agent-geral",
    label: "Assistente Geral",
    description: "Orientação sobre o produto",
    keywords: "assistente geral ajuda orientacao",
    icon: "💬",
    action: "agent:assistente-geral",
    group: "Agentes",
  },
];

const NAV_ITEMS: PaletteItem[] = [
  {
    id: "nav-new-chat",
    label: "Novo chat",
    description: "Iniciar conversa nova",
    keywords: "novo chat conversa iniciar",
    icon: "➕",
    action: "nav:/",
    group: "Navegação",
  },
  {
    id: "nav-processos",
    label: "Processos",
    description: "Painel de processos",
    keywords: "processos painel lista",
    icon: "📁",
    action: "nav:/processos",
    group: "Navegação",
  },
  {
    id: "nav-ajuda",
    label: "Ajuda",
    description: "Guia de funcionalidades",
    keywords: "ajuda help guia funcionalidades",
    icon: "❓",
    action: "command:/ajuda",
    group: "Navegação",
  },
];

const BADGE_COLORS: Record<string, string> = {
  DOCX: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  XLSX: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  "DOCX+XLSX":
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  JSON: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  Form: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
};

// ─── Componente ──────────────────────────────────────────────────────

interface CommandPaletteProps {
  /** Callback quando um módulo/comando é selecionado */
  onSelect: (action: string) => void;
}

export function CommandPalette({ onSelect }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  // Keyboard shortcut: ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (action: string) => {
      setOpen(false);
      onSelect(action);
    },
    [onSelect]
  );

  return (
    <CommandDialog onOpenChange={setOpen} open={open}>
      <CommandInput placeholder="Buscar módulo, agente ou ação..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Módulos Master">
          {MASTER_MODULES.map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() => handleSelect(item.action)}
              value={`${item.label} ${item.description} ${item.keywords}`}
            >
              <span className="mr-2">{item.icon}</span>
              <div className="flex flex-1 items-center gap-2">
                <span className="font-mono text-muted-foreground text-xs">
                  {item.label}
                </span>
                <span className="text-sm">{item.description}</span>
              </div>
              {item.badge && (
                <span
                  className={`ml-auto rounded px-1.5 py-0.5 font-medium text-[10px] ${BADGE_COLORS[item.badge] ?? ""}`}
                >
                  {item.badge}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Agentes">
          {AGENTS.map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() => handleSelect(item.action)}
              value={`${item.label} ${item.description} ${item.keywords}`}
            >
              <span className="mr-2">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
              <span className="ml-2 text-muted-foreground text-xs">
                {item.description}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navegação">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() => handleSelect(item.action)}
              value={`${item.label} ${item.description} ${item.keywords}`}
            >
              <span className="mr-2">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
