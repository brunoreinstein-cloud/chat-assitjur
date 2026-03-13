"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface DbFallbackContextValue {
  dbFallbackUsed: boolean;
  setDbFallbackUsed: (value: boolean) => void;
}

const DbFallbackContext = createContext<DbFallbackContextValue | null>(null);

export function DbFallbackProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [dbFallbackUsed, setDbFallbackUsed] = useState(false);
  const value = useMemo(
    () => ({
      dbFallbackUsed,
      setDbFallbackUsed,
    }),
    [dbFallbackUsed]
  );
  return (
    <DbFallbackContext.Provider value={value}>
      {children}
    </DbFallbackContext.Provider>
  );
}

export function useDbFallback() {
  const ctx = useContext(DbFallbackContext);
  if (!ctx) {
    return {
      dbFallbackUsed: false,
      setDbFallbackUsed: (_: boolean) => {
        // No-op when outside provider; state is not persisted.
      },
    };
  }
  return ctx;
}
