"use client";

import { useEffect, useState } from "react";

/**
 * Loja de progresso para geração dos 2 docs AutuorIA.
 * Módulo simples pub-sub sem Context API.
 * completedCount: quantos docs já foram gerados (0–2).
 * startedAt: timestamp (ms) do início da geração — usado para timer e ETA.
 */

type Listener = (completedCount: number) => void;

const listeners = new Set<Listener>();
let currentCount = 0;
let currentStartedAt = 0;

export function setAutuoriaCompletedCount(n: number): void {
  currentCount = n;
  for (const fn of listeners) {
    fn(n);
  }
}

/** Regista o timestamp de início da geração (chamado quando data-autuoriaStart chega). */
export function setAutuoriaStarted(): void {
  currentStartedAt = Date.now();
}

/** Devolve o timestamp (ms) de início da geração, ou 0 se ainda não iniciou. */
export function getAutuoriaStartedAt(): number {
  return currentStartedAt;
}

export function resetAutuoriaProgress(): void {
  setAutuoriaCompletedCount(0);
  currentStartedAt = 0;
}

export function useAutuoriaCompletedCount(): number {
  const [count, setCount] = useState(currentCount);
  useEffect(() => {
    setCount(currentCount);
    listeners.add(setCount);
    return () => {
      listeners.delete(setCount);
    };
  }, []);
  return count;
}
