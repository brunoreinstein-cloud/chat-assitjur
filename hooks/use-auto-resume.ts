"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useEffect } from "react";
import { useDataStream } from "@/components/data-stream-provider";
import type { ChatMessage } from "@/lib/types";

export interface UseAutoResumeParams {
  autoResume: boolean;
  initialMessages: ChatMessage[];
  resumeStream: UseChatHelpers<ChatMessage>["resumeStream"];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}

export function useAutoResume({
  autoResume,
  initialMessages,
  resumeStream,
  setMessages,
}: UseAutoResumeParams) {
  const { dataStream } = useDataStream();

  useEffect(() => {
    if (!autoResume) {
      return;
    }

    const mostRecentMessage = initialMessages.at(-1);

    if (mostRecentMessage?.role !== "user") {
      return;
    }

    // Defer so useChat internal state (request/stream refs) is ready; avoids
    // "Cannot read properties of undefined (reading 'state')" in makeRequest/resumeStream.
    const id = setTimeout(() => {
      try {
        Promise.resolve(resumeStream()).catch(() => {
          // No stream to resume or SDK not ready; ignore.
        });
      } catch {
        // Sync throw (e.g. undefined.state); ignore.
      }
    }, 0);

    return () => clearTimeout(id);
    // we intentionally run this once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume, initialMessages.at, resumeStream]);

  useEffect(() => {
    if (!dataStream) {
      return;
    }
    if (dataStream.length === 0) {
      return;
    }

    const dataPart = dataStream[0];

    if (dataPart.type === "data-appendMessage") {
      const message = JSON.parse(
        typeof dataPart.data === "string"
          ? dataPart.data
          : String(dataPart.data)
      );
      setMessages([...initialMessages, message]);
    }
  }, [dataStream, initialMessages, setMessages]);
}
