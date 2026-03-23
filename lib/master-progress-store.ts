"use client";

import { useEffect, useState } from "react";

/**
 * Loja de progresso para geração dos docs Master.
 * Módulo simples pub-sub sem Context API, evitando wrapping de providers.
 *
 * completedCount : quantos docs já foram gerados.
 * totalCount     : total de docs a gerar (disponível desde data-mdocStart).
 * startedAt      : timestamp de início da geração (para elapsed time / ETA).
 */

type CountListener = (n: number) => void;
type TitlesListener = (titles: string[]) => void;

const countListeners = new Set<CountListener>();
const totalListeners = new Set<CountListener>();
const titlesListeners = new Set<TitlesListener>();

let currentCount = 0;
let currentTotal = 0;
let currentStartedAt = 0; // Date.now() quando data-mdocStart chegou
let currentTitles: string[] = [];

export function setMasterCompletedCount(n: number): void {
  currentCount = n;
  for (const fn of countListeners) {
    fn(n);
  }
}

export function setMasterTotalCount(total: number): void {
  currentTotal = total;
  currentStartedAt = Date.now();
  for (const fn of totalListeners) {
    fn(total);
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
  currentTotal = 0;
  for (const fn of totalListeners) {
    fn(0);
  }
  currentStartedAt = 0;
  setMasterCompletedCount(0);
}

/** Timestamp de início da geração (0 se ainda não começou). */
export function getMasterStartedAt(): number {
  return currentStartedAt;
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

export function useMasterTotalCount(): number {
  const [total, setTotal] = useState(currentTotal);
  useEffect(() => {
    setTotal(currentTotal);
    totalListeners.add(setTotal);
    return () => {
      totalListeners.delete(setTotal);
    };
  }, []);
  return total;
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
