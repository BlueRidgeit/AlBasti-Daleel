import type { UIMessage } from "ai";

import {
  extractTextFromDocument,
  isSupportedDocument,
  pickRelevantSections,
} from "@/lib/document-extract";

type FilePart = {
  type: "file";
  mediaType?: string;
  filename?: string;
  url: string;
};

type UploadedDocument = {
  id: string;
  messageId: string;
  filename: string;
  mediaType?: string;
  url: string;
};

export type ReadUploadedDocumentResult = {
  documentId: string;
  title: string;
  strategy: "uploaded-chat-file";
  excerpts: string[];
  caveats: string[];
};

const isFilePart = (part: unknown): part is FilePart => {
  if (!part || typeof part !== "object") {
    return false;
  }

  const candidate = part as Partial<FilePart>;
  return candidate.type === "file" && typeof candidate.url === "string";
};

const toUploadedDocumentId = (messageId: string, index: number) =>
  `${messageId}:${index + 1}`;

const getMessageParts = (message: UIMessage) =>
  Array.isArray((message as UIMessage & { parts?: unknown[] }).parts)
    ? ((message as UIMessage & { parts?: unknown[] }).parts as unknown[])
    : [];

const decodeDataUrl = (url: string) => {
  const match = url.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);

  if (!match) {
    throw new Error("Unsupported attachment format.");
  }

  const [, mediaType = "application/octet-stream", isBase64, data] = match;
  const decoded = isBase64
    ? Buffer.from(data, "base64")
    : Buffer.from(decodeURIComponent(data), "utf-8");

  return {
    mediaType,
    buffer: decoded,
  };
};

const fetchRemoteFile = async (url: string) => {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Failed to fetch uploaded file from URL (${response.status}): ${details}`,
    );
  }

  return {
    mediaType:
      response.headers.get("content-type") ?? "application/octet-stream",
    buffer: Buffer.from(await response.arrayBuffer()),
  };
};

export const collectUploadedDocuments = (messages: UIMessage[]) => {
  const uploads: UploadedDocument[] = [];

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    const fileParts = getMessageParts(message)
      .filter(isFilePart)
      .filter((part) =>
        isSupportedDocument(part.filename ?? "attachment", part.mediaType),
      );

    fileParts.forEach((part, index) => {
      uploads.push({
        id: toUploadedDocumentId(message.id, index),
        messageId: message.id,
        filename: part.filename ?? `attachment-${index + 1}`,
        mediaType: part.mediaType,
        url: part.url,
      });
    });
  }

  return uploads;
};

export const sanitizeMessagesForModel = (
  messages: UIMessage[],
  uploads: UploadedDocument[],
) => {
  return messages.map((message) => {
    if (message.role !== "user") {
      return message;
    }

    const parts = getMessageParts(message);
    const textParts = parts.filter(
      (part) => !isFilePart(part),
    ) as UIMessage["parts"];
    const messageUploads = uploads.filter((upload) => upload.messageId === message.id);

    if (messageUploads.length === 0) {
      return {
        ...message,
        parts: textParts,
      };
    }

    const uploadNote = {
      type: "text" as const,
      text: `Uploaded document(s) available in this chat: ${messageUploads
        .map((upload) => `${upload.filename} [id: ${upload.id}]`)
        .join(", ")}. If the user asks about an uploaded document, use the read_uploaded_document tool.`,
    };

    return {
      ...message,
      parts: [...textParts, uploadNote],
    };
  });
};

const resolveUploadedDocument = (
  uploads: UploadedDocument[],
  documentId?: string,
  filename?: string,
) => {
  if (documentId?.trim()) {
    const exact = uploads.find((upload) => upload.id === documentId.trim());
    if (exact) {
      return exact;
    }
  }

  if (filename?.trim()) {
    const normalized = filename.trim().toLowerCase();
    const exact = uploads.find(
      (upload) => upload.filename.toLowerCase() === normalized,
    );

    if (exact) {
      return exact;
    }

    const partial = uploads.find((upload) =>
      upload.filename.toLowerCase().includes(normalized),
    );

    if (partial) {
      return partial;
    }
  }

  if (uploads.length === 1) {
    return uploads[0];
  }

  throw new Error(
    uploads.length === 0
      ? "No supported uploaded documents are available in this chat."
      : "Multiple uploaded documents are available. Please specify the filename.",
  );
};

export async function readUploadedDocument(
  messages: UIMessage[],
  {
    documentId,
    filename,
    question,
  }: {
    documentId?: string;
    filename?: string;
    question?: string;
  },
): Promise<ReadUploadedDocumentResult> {
  const uploads = collectUploadedDocuments(messages);
  const selected = resolveUploadedDocument(uploads, documentId, filename);
  const fileSource = selected.url.startsWith("data:")
    ? decodeDataUrl(selected.url)
    : await fetchRemoteFile(selected.url);

  const extractedText = await extractTextFromDocument(
    fileSource.buffer,
    selected.filename,
    selected.mediaType ?? fileSource.mediaType,
  );

  return {
    documentId: selected.id,
    title: selected.filename,
    strategy: "uploaded-chat-file",
    excerpts: pickRelevantSections(extractedText, question),
    caveats: [],
  };
}
