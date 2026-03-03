"use client";

import { motion } from "framer-motion";
import { BookOpenIcon, FileTextIcon, MessageCircleIcon } from "lucide-react";
import {
  AGENT_ID_REVISOR_DEFESAS,
  getAgentConfig,
  NO_AGENT_SELECTED,
} from "@/lib/ai/agents-registry-metadata";

interface GreetingProps {
  /** Id do agente selecionado; vazio = nenhum agente (mostra CTA para escolher). */
  agentId?: string;
  /** Abre a sidebar da base de conhecimento (ex.: "Consultar Base de Teses") */
  onOpenKnowledge?: () => void;
  /** Foca a barra de digitação para começar a analisar */
  onFocusInput?: () => void;
}

export const Greeting = ({
  agentId = NO_AGENT_SELECTED,
  onOpenKnowledge,
  onFocusInput,
}: GreetingProps) => {
  const hasAgent = agentId && agentId !== NO_AGENT_SELECTED;
  const config = hasAgent ? getAgentConfig(agentId) : null;
  const isRevisor = agentId === AGENT_ID_REVISOR_DEFESAS;

  return (
    <div
      className="mx-auto flex size-full max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center md:gap-8 md:px-8"
      key="overview"
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="flex size-16 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground md:size-20"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.4 }}
      >
        <MessageCircleIcon aria-hidden className="size-8 md:size-10" />
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="font-semibold text-2xl text-foreground md:text-3xl"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
      >
        {hasAgent && config ? config.label : "Escolha um agente para começar"}
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg text-base text-muted-foreground md:text-lg"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
      >
        {hasAgent && config?.description
          ? config.description
          : "Selecione um agente na barra acima (Revisor de Defesas, Redator de Contestações ou AssistJur.IA Master) para iniciar a conversa."}
      </motion.div>

      {hasAgent && (onFocusInput != null || onOpenKnowledge != null) && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
          exit={{ opacity: 0, y: 10 }}
          initial={{ opacity: 0, y: 10 }}
          transition={{ delay: 0.65 }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {onFocusInput != null && isRevisor && (
              <button
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={onFocusInput}
                type="button"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileTextIcon aria-hidden className="size-5" />
                </span>
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    Analisar nova Contestação
                  </span>
                  <p className="mt-0.5 text-muted-foreground text-sm">
                    Anexe a Petição Inicial e a Contestação para começar
                  </p>
                </div>
              </button>
            )}
            {onOpenKnowledge != null && isRevisor && (
              <button
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={onOpenKnowledge}
                type="button"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpenIcon aria-hidden className="size-5" />
                </span>
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    Consultar Base de Teses
                  </span>
                  <p className="mt-0.5 text-muted-foreground text-sm">
                    Use teses e precedentes guardados no chat
                  </p>
                </div>
              </button>
            )}
          </div>
        </motion.div>
      )}

      {isRevisor && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 max-w-xl text-muted-foreground text-sm"
          exit={{ opacity: 0, y: 10 }}
          initial={{ opacity: 0, y: 10 }}
          transition={{ delay: 0.7 }}
        >
          Para começar: envie a <strong>Petição Inicial</strong> e a{" "}
          <strong>Contestação</strong> (cole o texto ou anexe PDF/DOC/DOCX).
          Opcional: base de teses (@bancodetese).
        </motion.div>
      )}
    </div>
  );
};
