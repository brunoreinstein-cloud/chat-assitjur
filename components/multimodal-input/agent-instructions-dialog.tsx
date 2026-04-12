"use client";

import { LoaderIcon, WandIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const AGENT_INSTRUCTIONS_MAX_LENGTH = 4000;

interface AgentInstructionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localInstructions: string;
  setLocalInstructions: (value: string) => void;
  isImproving: boolean;
  onImproveInstructions: (
    text: string,
    setResult: (value: string) => void
  ) => void;
}

export function AgentInstructionsDialog({
  open,
  onOpenChange,
  localInstructions,
  setLocalInstructions,
  isImproving,
  onImproveInstructions,
}: Readonly<AgentInstructionsDialogProps>) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Instruções do agente</DialogTitle>
          <DialogDescription>
            Por padrão o agente atua como Revisor de Defesas. Sobrescreva aqui
            apenas se quiser outro comportamento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="agent-instructions-composer">
              Sobrescrever orientações (opcional)
            </Label>
            <Button
              aria-label="Melhorar instruções com IA"
              disabled={isImproving}
              onClick={() =>
                onImproveInstructions(localInstructions, setLocalInstructions)
              }
              size="sm"
              type="button"
              variant="outline"
            >
              {isImproving ? (
                <LoaderIcon aria-hidden className="size-4 animate-spin" />
              ) : (
                <WandIcon aria-hidden className="size-4" />
              )}
              {isImproving ? "A melhorar…" : "Melhorar prompt"}
            </Button>
          </div>
          <Textarea
            autoComplete="off"
            id="agent-instructions-composer"
            maxLength={AGENT_INSTRUCTIONS_MAX_LENGTH}
            name="agent-instructions-composer"
            onChange={(e) => setLocalInstructions(e.target.value)}
            placeholder="Deixe em branco = Revisor de Defesas."
            rows={4}
            value={localInstructions}
          />
          <span className="text-muted-foreground text-xs">
            {localInstructions.length}/{AGENT_INSTRUCTIONS_MAX_LENGTH}{" "}
            caracteres
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
