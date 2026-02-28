"use client";

import { Button } from "@/components/ui/button";
import {
	GATE_05_RESUMO_END,
	GATE_05_RESUMO_START,
} from "@/lib/ai/agent-revisor-defesas";
import type { ChatMessage } from "@/lib/types";

function getAssistantMessageText(message: ChatMessage): string {
	if (message.role !== "assistant" || !message.parts) {
		return "";
	}
	return message.parts
		.map((p) => {
			const part = p as { type?: string; text?: string };
			return part.type === "text" && typeof part.text === "string"
				? part.text
				: "";
		})
		.join("");
}

function getUserMessageText(message: ChatMessage): string {
	if (message.role !== "user" || !message.parts) {
		return "";
	}
	const textPart = message.parts.find(
		(p) => (p as { type?: string }).type === "text",
	) as { text?: string } | undefined;
	return typeof textPart?.text === "string" ? textPart.text.trim() : "";
}

function findLastAssistantIndexWithGate05(messages: ChatMessage[]): number {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") {
			const text = getAssistantMessageText(messages[i]);
			if (
				text.includes(GATE_05_RESUMO_START) &&
				text.includes(GATE_05_RESUMO_END)
			) {
				return i;
			}
		}
	}
	return -1;
}

type RevisorPhaseBannerProps = {
	readonly messages: ChatMessage[];
	readonly status: string;
	readonly sendMessage: (msg: {
		role: "user";
		parts: Array<{ type: "text"; text: string }>;
	}) => void;
	readonly setInput: (value: string) => void;
	readonly inputRef: React.RefObject<HTMLTextAreaElement | null>;
	readonly isReadonly: boolean;
};

export function RevisorPhaseBanner({
	messages,
	status,
	sendMessage,
	setInput,
	inputRef,
	isReadonly,
}: RevisorPhaseBannerProps) {
	const idx = findLastAssistantIndexWithGate05(messages);
	if (idx === -1) {
		return null;
	}

	const afterMessages = messages.slice(idx + 1);
	const userRepliedToGate05 = afterMessages.some(
		(m) =>
			m.role === "user" &&
			(getUserMessageText(m) === "CONFIRMAR" ||
				getUserMessageText(m).startsWith("CORRIGIR:")),
	);

	const isStreaming = status === "streaming" || status === "submitted";
	const isError = status === "error";
	const lastMessage = messages.at(-1);
	const showFaseB =
		userRepliedToGate05 && (isStreaming || lastMessage?.role === "assistant");
	const showErroAposConfirmar = userRepliedToGate05 && isError;

	if (showErroAposConfirmar) {
		return (
			<output
				aria-live="polite"
				className="border-border bg-destructive/10 text-destructive mx-2 mb-1 block rounded-md border px-3 py-2 text-center text-sm md:mx-4"
			>
				Ocorreu um erro ao gerar os documentos. Pode tentar novamente ou usar
				CORRIGIR para ajustar o resumo.
			</output>
		);
	}

	if (showFaseB) {
		return (
			<output
				aria-live="polite"
				className="border-border bg-muted/50 text-muted-foreground mx-2 mb-1 block rounded-md border px-3 py-2 text-center text-sm md:mx-4"
			>
				FASE B — Gerando documentos.
			</output>
		);
	}

	if (userRepliedToGate05) {
		return null;
	}

	const handleConfirmar = () => {
		sendMessage({
			role: "user",
			parts: [{ type: "text", text: "CONFIRMAR" }],
		});
	};

	const handleCorrigir = () => {
		setInput("CORRIGIR: ");
		setTimeout(() => {
			inputRef.current?.focus();
		}, 0);
	};

	if (isReadonly) {
		return (
			<output
				aria-live="polite"
				className="border-border bg-muted/50 text-muted-foreground mx-2 mb-1 block rounded-md border px-3 py-2 text-center text-sm md:mx-4"
			>
				FASE A — Extração e mapeamento. Aguardando confirmação para gerar os 3
				DOCX.
			</output>
		);
	}

	return (
		<output
			aria-live="polite"
			className="border-border bg-muted/50 text-muted-foreground mx-2 mb-1 flex flex-col items-center gap-2 rounded-md border px-3 py-2 text-center text-sm md:mx-4 md:flex-row md:justify-center"
		>
			<span className="shrink-0">
				FASE A — Extração e mapeamento. Aguardando sua confirmação para gerar os
				3 DOCX.
			</span>
			<div className="flex gap-2">
				<Button
					onClick={handleConfirmar}
					size="sm"
					type="button"
					variant="default"
				>
					CONFIRMAR
				</Button>
				<Button
					onClick={handleCorrigir}
					size="sm"
					type="button"
					variant="outline"
				>
					CORRIGIR
				</Button>
			</div>
		</output>
	);
}
