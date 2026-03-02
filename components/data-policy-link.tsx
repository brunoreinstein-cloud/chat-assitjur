"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DATA_POLICY_NO_TRAINING } from "@/lib/ai/data-policy";

export function DataPolicyLink() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        className="text-muted-foreground text-xs underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        type="button"
      >
        Como usamos os seus dados
      </DialogTrigger>
      <DialogContent
        aria-describedby="data-policy-description"
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle id="data-policy-title">Dados e IA</DialogTitle>
          <DialogDescription id="data-policy-description">
            {DATA_POLICY_NO_TRAINING}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
