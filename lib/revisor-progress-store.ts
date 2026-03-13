"use client";

import { useEffect, useState } from "react";

/**
 * Loja de progresso para geração dos 3 docs Revisor.
 * Módulo simples pub-sub sem Context API, evitando wrapping de providers.
 * completedCount: quantos docs já foram gerados (0–3).
 */

type Listener = (completedCount: number) => void;

const listeners = new Set<Listener>();
let currentCount = 0;

export function setRevisorCompletedCount(n: number): void {
  currentCount = n;
  for (const fn of listeners) {
    fn(n);
  }
}

export function resetRevisorProgress(): void {
  setRevisorCompletedCount(0);
}

export function useRevisorCompletedCount(): number {
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
