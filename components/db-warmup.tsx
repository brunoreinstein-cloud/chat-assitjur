"use client";

import { useEffect, useRef } from "react";

/**
 * Chama GET /api/health/db uma vez ao montar, em background.
 * Aquece a ligação à BD no processo serverless para que o primeiro
 * GET /api/credits ou POST /api/chat não pague o cold start.
 * Não renderiza nada. Ver docs/DB-TIMEOUT-TROUBLESHOOTING.md.
 */
export function DbWarmup() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) {
      return;
    }
    done.current = true;
    fetch("/api/health/db", {
      method: "GET",
      credentials: "omit",
    }).catch(() => {
      // Ignorar erros; o aquecimento é best-effort
    });
  }, []);

  return null;
}
