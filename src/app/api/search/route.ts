import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import {
  searchDocumentsAdvanced,
  type FileTypeCategory,
} from "@/lib/search-documents";

const FILE_TYPE_VALUES: FileTypeCategory[] = [
  "word",
  "pdf",
  "text",
  "excel",
  "powerpoint",
  "image",
];

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => undefined)) as
    | {
        allWords?: string;
        anyWords?: string;
        exactPhrase?: string;
        withoutWords?: string;
        partWords?: string;
        libraries?: string[];
        fileTypes?: string[];
      }
    | undefined;

  if (!body || typeof body !== "object") {
    return Response.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const fileTypes = Array.isArray(body.fileTypes)
    ? body.fileTypes.filter((value): value is FileTypeCategory =>
        FILE_TYPE_VALUES.includes(value as FileTypeCategory),
      )
    : undefined;

  try {
    const result = await searchDocumentsAdvanced({
      allWords: body.allWords,
      anyWords: body.anyWords,
      exactPhrase: body.exactPhrase,
      withoutWords: body.withoutWords,
      partWords: body.partWords,
      libraries: Array.isArray(body.libraries) ? body.libraries : undefined,
      fileTypes,
    });

    return Response.json(result);
  } catch (error) {
    console.error("Advanced search failed", error);
    return Response.json({ error: "Search failed." }, { status: 500 });
  }
}
