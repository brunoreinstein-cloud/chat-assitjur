import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { generateRevisorDocumentContent } from "@/artifacts/text/server";
import { saveDocument } from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

const CHUNK_SIZE = 400;

type CreateRevisorDefesaDocumentsProps = {
	session: Session;
	dataStream: UIMessageStreamWriter<ChatMessage>;
};

/**
 * Ferramenta que gera os 3 DOCX do Revisor (Avaliação, Roteiro Advogado, Roteiro Preposto)
 * em paralelo e depois faz stream para o cliente na ordem. Reduz o tempo total em produção
 * de ~(T1+T2+T3) para ~max(T1,T2,T3) + tempo de envio.
 */
export const createRevisorDefesaDocuments = ({
	session,
	dataStream,
}: CreateRevisorDefesaDocumentsProps) =>
	tool({
		description:
			"Create the 3 Revisor documents (Avaliação, Roteiro Advogado, Roteiro Preposto) in one call. Use this in FASE B after the user CONFIRMs the GATE 0.5 summary. Pass the exact titles for each document.",
		inputSchema: z.object({
			avaliacaoTitle: z
				.string()
				.describe("Title for Doc 1: Avaliação / Parecer Executivo"),
			roteiroAdvogadoTitle: z
				.string()
				.describe("Title for Doc 2: Roteiro Advogado"),
			roteiroPrepostoTitle: z
				.string()
				.describe("Title for Doc 3: Roteiro Preposto"),
		}),
		execute: async ({
			avaliacaoTitle,
			roteiroAdvogadoTitle,
			roteiroPrepostoTitle,
		}) => {
			const titles = [
				avaliacaoTitle,
				roteiroAdvogadoTitle,
				roteiroPrepostoTitle,
			];
			const ids = [generateUUID(), generateUUID(), generateUUID()];
			const userId = session?.user?.id;

			// Inicia as 3 gerações em paralelo; cada doc é enviado ao cliente assim que fica pronto (na ordem),
			// reduzindo o tempo até o primeiro documento aparecer em produção.
			const contentPromises = titles.map((title) =>
				generateRevisorDocumentContent(title),
			);

			for (let i = 0; i < 3; i++) {
				const content = (await contentPromises[i]) ?? "";

				const id = ids[i];
				const title = titles[i];

				dataStream.write({
					type: "data-kind",
					data: "text",
					transient: true,
				});
				dataStream.write({
					type: "data-id",
					data: id,
					transient: true,
				});
				dataStream.write({
					type: "data-title",
					data: title,
					transient: true,
				});
				dataStream.write({
					type: "data-clear",
					data: null,
					transient: true,
				});

				for (let offset = 0; offset < content.length; offset += CHUNK_SIZE) {
					const chunk = content.slice(offset, offset + CHUNK_SIZE);
					dataStream.write({
						type: "data-textDelta",
						data: chunk,
						transient: true,
					});
				}

				dataStream.write({
					type: "data-finish",
					data: null,
					transient: true,
				});

				if (userId) {
					await saveDocument({
						id,
						title,
						content,
						kind: "text",
						userId,
					});
				}
			}

			return {
				ids,
				titles,
				content:
					"Os 3 documentos foram criados e estão visíveis: Avaliação, Roteiro Advogado, Roteiro Preposto.",
			};
		},
	});
