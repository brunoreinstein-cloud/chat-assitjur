import { auth } from "@/app/(auth)/auth";
import type { ArtifactKind } from "@/components/artifact";
import { documentCache, docxCache } from "@/lib/cache/document-cache";
import {
  deleteDocumentsByIdAfterTimestamp,
  getDocumentsById,
  saveDocument,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter id is missing"
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  const userId = session.user.id;
  const cached = documentCache.get(userId, id);
  if (cached !== undefined) {
    return Response.json(cached, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=15",
      },
    });
  }

  const documents = await getDocumentsById({ id });

  const [document] = documents;

  if (!document) {
    // 404 pode ocorrer brevemente após a tool criar o documento (race com o commit na BD).
    // O cliente usa documentFetcher com retry (lib/utils.ts) para este caso.
    return new ChatbotError("not_found:document").toResponse();
  }

  if (document.userId !== userId) {
    return new ChatbotError("forbidden:document").toResponse();
  }

  documentCache.set(userId, id, documents);

  return Response.json(documents, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=15",
    },
  });
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter id is required."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  const {
    content,
    title,
    kind,
  }: { content: string; title: string; kind: ArtifactKind } =
    await request.json();

  const documents = await getDocumentsById({ id });

  if (documents.length > 0) {
    const [doc] = documents;

    if (doc.userId !== session.user.id) {
      return new ChatbotError("forbidden:document").toResponse();
    }
  }

  const userId = session.user.id;
  const document = await saveDocument({
    id,
    content,
    title,
    kind,
    userId,
  });

  documentCache.delete(userId, id);
  docxCache.delete(userId, id);

  return Response.json(document, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const timestamp = searchParams.get("timestamp");

  if (!id) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter id is required."
    ).toResponse();
  }

  if (!timestamp) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter timestamp is required."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  const documents = await getDocumentsById({ id });

  const [document] = documents;

  if (document.userId !== session.user.id) {
    return new ChatbotError("forbidden:document").toResponse();
  }

  const documentsDeleted = await deleteDocumentsByIdAfterTimestamp({
    id,
    timestamp: new Date(timestamp),
  });

  documentCache.delete(session.user.id, id);
  docxCache.delete(session.user.id, id);

  return Response.json(documentsDeleted, { status: 200 });
}
