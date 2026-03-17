"use client";

import { useEffect, useState } from "react";

/**
 * Loja de progresso para geração dos docs Master.
 * Módulo simples pub-sub sem Context API, evitando wrapping de providers.
 * completedCount: quantos docs já foram gerados.
 * Padrão idêntico ao revisor-progress-store.ts.
 */

type CountListener = (completedCount: number) => void;
type TitlesListener = (titles: string[]) => void;

const countListeners = new Set<CountListener>();
const titlesListeners = new Set<TitlesListener>();
let currentCount = 0;
let currentTitles: string[] = [];

export function setMasterCompletedCount(n: number): void {
  currentCount = n;
  for (const fn of countListeners) {
    fn(n);
  }
}

export function setMasterDocTitle(index: number, title: string): void {
  const next = [...currentTitles];
  next[index] = title;
  currentTitles = next;
  for (const fn of titlesListeners) {
    fn(currentTitles);
  }
}

export function resetMasterProgress(): void {
  currentTitles = [];
  for (const fn of titlesListeners) {
    fn([]);
  }
  setMasterCompletedCount(0);
}

export function useMasterCompletedCount(): number {
  const [count, setCount] = useState(currentCount);
  useEffect(() => {
    setCount(currentCount);
    countListeners.add(setCount);
    return () => {
      countListeners.delete(setCount);
    };
  }, []);
  return count;
}

export function useMasterDocTitles(): string[] {
  const [titles, setTitles] = useState(currentTitles);
  useEffect(() => {
    setTitles(currentTitles);
    titlesListeners.add(setTitles);
    return () => {
      titlesListeners.delete(setTitles);
    };
  }, []);
  return titles;
}
