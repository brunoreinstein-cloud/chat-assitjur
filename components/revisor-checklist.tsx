"use client";

import { CheckIcon, XIcon } from "lucide-react";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";

type RevisorChecklistProps = {
	readonly attachments: Attachment[];
	readonly knowledgeDocumentIds?: string[];
	readonly messageCount: number;
};

/** Checklist "Antes de executar": PI, Contestação e Base. Só visível quando o chat está vazio. */
export function RevisorChecklist({
	attachments,
	knowledgeDocumentIds = [],
	messageCount,
}: RevisorChecklistProps) {
	if (messageCount > 0) {
		return null;
	}

	const hasPi = attachments.some(
		(a) => a.extractedText != null && a.documentType === "pi",
	);
	const hasContestacao = attachments.some(
		(a) => a.extractedText != null && a.documentType === "contestacao",
	);
	const hasBase = knowledgeDocumentIds.length > 0;

	return (
		<div
			aria-live="polite"
			className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs"
			data-testid="revisor-checklist"
		>
			<span className="flex items-center gap-1.5">
				{hasPi ? (
					<CheckIcon aria-hidden className="size-3.5 text-green-600" />
				) : (
					<XIcon aria-hidden className="size-3.5 text-muted-foreground/70" />
				)}
				<span>Petição Inicial</span>
			</span>
			<span className="flex items-center gap-1.5">
				{hasContestacao ? (
					<CheckIcon aria-hidden className="size-3.5 text-green-600" />
				) : (
					<XIcon aria-hidden className="size-3.5 text-muted-foreground/70" />
				)}
				<span>Contestação</span>
			</span>
			<span className="flex items-center gap-1.5">
				{hasBase ? (
					<CheckIcon aria-hidden className="size-3.5 text-green-600" />
				) : (
					<XIcon
						aria-hidden
						className={cn("size-3.5 text-muted-foreground/70")}
					/>
				)}
				<span>Base de conhecimento</span>
				{hasBase && (
					<span className="tabular-nums">({knowledgeDocumentIds.length})</span>
				)}
			</span>
		</div>
	);
}
