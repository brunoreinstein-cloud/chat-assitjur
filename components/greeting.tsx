"use client";

import { motion } from "framer-motion";
import { BookOpenIcon, FileTextIcon } from "lucide-react";

interface GreetingProps {
  /** Abre a sidebar da base de conhecimento (ex.: "Consultar Base de Teses") */
  onOpenKnowledge?: () => void;
  /** Foca a barra de digitação para começar a analisar */
  onFocusInput?: () => void;
}

export const Greeting = ({ onOpenKnowledge, onFocusInput }: GreetingProps) => {
  return (
    <div
      className="mx-auto mt-4 flex size-full max-w-3xl flex-col justify-center gap-6 px-4 md:mt-16 md:gap-8 md:px-8"
      key="overview"
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="font-semibold text-xl md:text-2xl"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
      >
        Revisor de Defesas Trabalhistas
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="text-lg text-zinc-500 md:text-xl"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
      >
        Audito contestações, aponto correções e preparo a equipe para audiência.
        Não redijo peças — apenas avalio e gero parecer, roteiro do advogado e
        roteiro do preposto.
      </motion.div>

      {(onFocusInput != null || onOpenKnowledge != null) && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-3 sm:grid-cols-2"
          exit={{ opacity: 0, y: 10 }}
          initial={{ opacity: 0, y: 10 }}
          transition={{ delay: 0.65 }}
        >
          {onFocusInput != null && (
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
          {onOpenKnowledge != null && (
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
        </motion.div>
      )}

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mt-2 text-muted-foreground text-sm"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.7 }}
      >
        Para começar: envie a <strong>Petição Inicial</strong> e a{" "}
        <strong>Contestação</strong> (cole o texto ou anexe PDF/DOC/DOCX; o tipo
        é identificado automaticamente). Opcional: documentos do
        reclamante/reclamada e base de teses (@bancodetese).
      </motion.div>
    </div>
  );
};
