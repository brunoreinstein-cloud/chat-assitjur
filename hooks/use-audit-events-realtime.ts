"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditEvent } from "@/lib/db/schema";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface UseAuditEventsRealtimeResult {
  events: AuditEvent[];
  isConnected: boolean;
  /** Força refetch dos eventos iniciais. */
  refetch: () => void;
}

/**
 * Hook que combina fetch inicial + Supabase Realtime para audit events de um processo.
 *
 * 1. Carrega eventos iniciais via API route (server-side, com auth)
 * 2. Subscreve a postgres_changes INSERT na tabela AuditEvent filtrado por processoId
 * 3. Prepend de novos eventos em tempo real
 * 4. Cleanup automático no unmount
 */
export function useAuditEventsRealtime(
  processoId: string | null
): UseAuditEventsRealtimeResult {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<ReturnType<
    NonNullable<ReturnType<typeof getSupabaseBrowserClient>>["channel"]
  > | null>(null);

  const fetchInitialEvents = useCallback(async () => {
    if (!processoId) {
      return;
    }

    try {
      const res = await fetch(`/api/processos/${processoId}/audit-events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch {
      // Silently fail — events will populate via Realtime
    }
  }, [processoId]);

  useEffect(() => {
    if (!processoId) {
      setEvents([]);
      setIsConnected(false);
      return;
    }

    // Fetch inicial
    fetchInitialEvents();

    // Subscribe Realtime
    const client = getSupabaseBrowserClient();
    if (!client) {
      return;
    }

    const channel = client
      .channel(`audit-events:${processoId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "AuditEvent",
          filter: `processoId=eq.${processoId}`,
        },
        (payload) => {
          const newEvent = payload.new as AuditEvent;
          setEvents((prev) => [newEvent, ...prev]);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        client.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [processoId, fetchInitialEvents]);

  return { events, isConnected, refetch: fetchInitialEvents };
}
