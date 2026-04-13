"use client";

import { useEffect, useState } from "react";

/**
 * Loja de progresso para geração do documento do Redator (1 doc).
 * Módulo simples pub-sub sem Context API, mesmo padrão do Revisor.
 */

type Listener = (completedCount: number) => void;

const listeners = new Set<Listener>();
let currentCount = 0;
let currentStartedAt = 0;

export function setRedatorCompletedCount(n: number): void {
  currentCount = n;
  for (const fn of listeners) {
    fn(n);
  }
}

/** Regista o timestamp de início da geração (chamado quando data-redatorStart chega). */
export function setRedatorStarted(): void {
  currentStartedAt = Date.now();
}

/** Devolve o timestamp (ms) de início da geração, ou 0 se ainda não iniciou. */
export function getRedatorStartedAt(): number {
  return currentStartedAt;
}

export function resetRedatorProgress(): void {
  setRedatorCompletedCount(0);
  currentStartedAt = 0;
}

export function useRedatorCompletedCount(): number {
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
