"use client";

import { useEffect, useState } from "react";

/**
 * Loja de progresso para geração dos docs Master.
 * Módulo simples pub-sub sem Context API, evitando wrapping de providers.
 * completedCount: quantos docs já foram gerados.
 * Padrão idêntico ao revisor-progress-store.ts.
 */

type Listener = (completedCount: number) => void;

const listeners = new Set<Listener>();
let currentCount = 0;

export function setMasterCompletedCount(n: number): void {
  currentCount = n;
  for (const fn of listeners) {
    fn(n);
  }
}

export function resetMasterProgress(): void {
  setMasterCompletedCount(0);
}

export function useMasterCompletedCount(): number {
  const [count, setCount] = useState(currentCount);
  useEffect(() => {
    setCount(currentCount); // sync on mount
    listeners.add(setCount);
    return () => {
      listeners.delete(setCount);
    };
  }, []);
  return count;
}
