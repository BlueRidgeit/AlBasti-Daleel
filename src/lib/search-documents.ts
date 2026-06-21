import { env, hasAzureSearchConfig } from "@/lib/env";

const SEARCH_API_VERSION = "2025-09-01";

type AzureSearchCaption = {
  text?: string;
};

type AzureSearchHit = {
  "@search.score"?: number;
  "@search.rerankerScore"?: number;
  "@search.captions"?: AzureSearchCaption[];
  id?: string;
  title?: string;
  fileName?: string;
  documentId?: string;
  itemId?: string;
  sharepointItemId?: string;
  library?: string;
  driveId?: string;
  url?: string;
  folderUrl?: string;
  fileType?: string;
  lastModified?: string;
  content?: string;
};

type AzureSearchResponse = {
  value?: AzureSearchHit[];
};

export type FileTypeCategory =
  | "word"
  | "pdf"
  | "text"
  | "excel"
  | "powerpoint"
  | "image"
  | "other";

export type SearchDocumentMatch = {
  itemId: string;
  chunkId: string;
  title: string;
  library?: string;
  driveId?: string;
  url?: string;
  folderUrl?: string;
  fileType?: FileTypeCategory;
  lastModified?: string;
  snippet: string;
  score: number;
};

export type SearchDocumentsResult = {
  configured: boolean;
  query: string;
  totalMatches: number;
  documents: SearchDocumentMatch[];
};

type SearchDocumentsOptions = {
  top?: number;
  libraries?: string[];
};

const normalizeEndpoint = (endpoint: string) => endpoint.replace(/\/$/, "");

// Build an OData filter that restricts results to the selected document libraries.
// Uses "|" as the value delimiter because library labels contain spaces, and the default
// search.in delimiters (space and comma) would split multi-word labels like "Albasti Books".
const buildLibraryFilter = (libraries?: string[]) => {
  const values = (libraries ?? []).map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) {
    return undefined;
  }
  const escaped = values.map((value) => value.replace(/'/g, "''")).join("|");
  return `search.in(library, '${escaped}', '|')`;
};

const getSnippet = (hit: AzureSearchHit) => {
  const caption = hit["@search.captions"]?.find((entry) => entry.text)?.text;
  const content = hit.content?.replace(/\s+/g, " ").trim();
  const value = caption ?? content ?? "No preview available.";
  return value.length > 360 ? `${value.slice(0, 357)}...` : value;
};

const extractItemIdFromChunkId = (chunkId: string) => {
  const separatorIndex = chunkId.indexOf("-");
  return separatorIndex === -1 ? chunkId : chunkId.slice(0, separatorIndex);
};

// The index has no file-type or folder field, so we derive both from the URL.
const FILE_TYPE_BY_EXT: Record<string, FileTypeCategory> = {
  doc: "word", docx: "word", rtf: "word", odt: "word",
  pdf: "pdf",
  txt: "text", md: "text", csv: "text",
  xls: "excel", xlsx: "excel", xlsm: "excel", xlsb: "excel", ods: "excel",
  ppt: "powerpoint", pptx: "powerpoint", odp: "powerpoint",
  jpg: "image", jpeg: "image", png: "image", gif: "image",
  bmp: "image", tif: "image", tiff: "image", webp: "image", heic: "image",
};

const fileTypeFromExt = (ext?: string): FileTypeCategory =>
  (ext ? FILE_TYPE_BY_EXT[ext] : undefined) ?? "other";

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// Returns the file's extension, the file type category, and the parent folder
// URL. SharePoint "open in Office" links embed the real name in `?file=NAME.ext`
// (and have no folder path); direct links carry the file as the last path segment.
const parseFileUrl = (
  url?: string,
): { fileType: FileTypeCategory; folderUrl?: string } => {
  if (!url) return { fileType: "other" };
  const fileParam = url.match(/[?&]file=([^&]+)/i);
  if (fileParam) {
    const ext = safeDecode(fileParam[1]).split(".").pop()?.toLowerCase();
    return { fileType: fileTypeFromExt(ext) };
  }
  const noQuery = url.split(/[?#]/)[0];
  const lastSlash = noQuery.lastIndexOf("/");
  if (lastSlash === -1) return { fileType: "other" };
  const segment = safeDecode(noQuery.slice(lastSlash + 1));
  const ext = segment.includes(".") ? segment.split(".").pop()?.toLowerCase() : undefined;
  return { fileType: fileTypeFromExt(ext), folderUrl: noQuery.slice(0, lastSlash) };
};

const normalizeReference = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const resolveCanonicalItemId = (hit: AzureSearchHit) =>
  hit.documentId?.trim() ||
  hit.itemId?.trim() ||
  hit.sharepointItemId?.trim() ||
  (hit.id ? extractItemIdFromChunkId(hit.id) : undefined);

const resolveDisplayTitle = (hit: AzureSearchHit) =>
  hit.title?.trim() || hit.fileName?.trim() || resolveCanonicalItemId(hit) || "Untitled document";

async function runAzureSearch(body: Record<string, unknown>) {
  if (!hasAzureSearchConfig) {
    throw new Error(
      "Azure AI Search is not configured. Set AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY, and AZURE_SEARCH_INDEX_NAME.",
    );
  }

  const response = await fetch(
    `${normalizeEndpoint(env.azureSearchEndpoint!)}/indexes/${env.azureSearchIndexName}/docs/search?api-version=${SEARCH_API_VERSION}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": env.azureSearchApiKey!,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Azure Search request failed (${response.status}): ${details}`);
  }

  return (await response.json()) as AzureSearchResponse;
}

const EMBED_API_VERSION = "2024-02-15-preview";

// Embed the query text for hybrid (keyword + vector) search. Returns undefined when the
// embeddings deployment isn't configured or the call fails, so callers fall back to text-only.
async function embedQuery(text: string): Promise<number[] | undefined> {
  if (
    !env.azureOpenAIApiKey ||
    !env.azureOpenAIBaseUrl ||
    !env.azureOpenAIEmbeddingDeployment
  ) {
    return undefined;
  }

  try {
    const response = await fetch(
      `${env.azureOpenAIBaseUrl}/deployments/${env.azureOpenAIEmbeddingDeployment}/embeddings?api-version=${EMBED_API_VERSION}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": env.azureOpenAIApiKey,
        },
        body: JSON.stringify({ input: text }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as {
      data?: { embedding?: number[] }[];
    };
    const vector = data.data?.[0]?.embedding;
    return Array.isArray(vector) ? vector : undefined;
  } catch {
    return undefined;
  }
}

export async function searchDocuments(
  query: string,
  { top = 6, libraries }: SearchDocumentsOptions = {},
): Promise<SearchDocumentsResult> {
  if (!hasAzureSearchConfig) {
    return {
      configured: false,
      query,
      totalMatches: 0,
      documents: [],
    };
  }

  const trimmedQuery = query.trim();
  const useSemantic =
    Boolean(trimmedQuery) && Boolean(env.azureSearchSemanticConfiguration);
  const libraryFilter = buildLibraryFilter(libraries);
  const candidateCount = Math.min(Math.max(top * 3, 6), 30);

  // Hybrid retrieval: embed the query and add a vector query alongside the keyword search,
  // so matching is robust to spelling/spacing/synonyms (important for Arabic). The results
  // are fused (RRF) and, when configured, semantically reranked. Falls back to text-only
  // search if the embedding can't be produced.
  const queryVector = trimmedQuery ? await embedQuery(trimmedQuery) : undefined;

  const response = await runAzureSearch({
    search: trimmedQuery || "*",
    top: candidateCount,
    select: "id,title,url,lastModified,content,library,driveId,itemId,fileType,folderUrl",
    queryType: useSemantic ? "semantic" : "simple",
    ...(libraryFilter ? { filter: libraryFilter } : {}),
    ...(queryVector
      ? {
          vectorQueries: [
            {
              kind: "vector",
              vector: queryVector,
              fields: "embedding",
              k: candidateCount,
            },
          ],
        }
      : {}),
    ...(useSemantic
      ? {
          semanticConfiguration: env.azureSearchSemanticConfiguration,
          captions: "extractive",
        }
      : {}),
  });

  const deduped = new Map<string, SearchDocumentMatch>();

  for (const hit of response.value ?? []) {
    const itemId = resolveCanonicalItemId(hit);
    if (!hit.id || !itemId) {
      continue;
    }

    const score = hit["@search.rerankerScore"] ?? hit["@search.score"] ?? 0;
    const existing = deduped.get(itemId);

    if (existing && existing.score >= score) {
      continue;
    }

    const parsed = parseFileUrl(hit.url);
    deduped.set(itemId, {
      itemId,
      chunkId: hit.id,
      title: resolveDisplayTitle(hit),
      library: hit.library?.trim() || undefined,
      driveId: hit.driveId?.trim() || undefined,
      url: hit.url,
      folderUrl: hit.folderUrl?.trim() || parsed.folderUrl,
      fileType: (hit.fileType?.trim() as FileTypeCategory) || parsed.fileType,
      lastModified: hit.lastModified,
      snippet: getSnippet(hit),
      score,
    });
  }

  const documents = [...deduped.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, top);

  return {
    configured: true,
    query,
    totalMatches: documents.length,
    documents,
  };
}

export type ReadDocumentFallbackResult = {
  itemId: string;
  title?: string;
  url?: string;
  lastModified?: string;
  strategy: "indexed-retrieval-fallback";
  excerpts: string[];
  caveats: string[];
};

export type IndexedDocumentReference = {
  itemId?: string;
  driveId?: string;
  title?: string;
  url?: string;
  lastModified?: string;
};

export async function resolveIndexedDocumentReference(
  reference: string,
  question?: string,
): Promise<IndexedDocumentReference | undefined> {
  if (!hasAzureSearchConfig) {
    return undefined;
  }

  const trimmedReference = reference.trim();
  if (!trimmedReference) {
    return undefined;
  }

  const useSemantic =
    Boolean(question?.trim()) && Boolean(env.azureSearchSemanticConfiguration);

  const response = await runAzureSearch({
    search: trimmedReference,
    top: 25,
    queryType: useSemantic ? "semantic" : "simple",
    ...(useSemantic
      ? {
          semanticConfiguration: env.azureSearchSemanticConfiguration,
          captions: "extractive",
        }
      : {}),
  }).catch(() => undefined);

  if (!response?.value?.length) {
    return undefined;
  }

  const normalizedReference = normalizeReference(trimmedReference);
  const exactMatch = response.value.find((hit) => {
    const candidates = [
      hit.title,
      hit.fileName,
      hit.documentId,
      hit.itemId,
      hit.sharepointItemId,
      resolveCanonicalItemId(hit),
      hit.url,
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizeReference);

    return candidates.includes(normalizedReference);
  });

  const bestMatch = exactMatch ?? response.value[0];
  const itemId = resolveCanonicalItemId(bestMatch);

  return {
    itemId,
    driveId: bestMatch.driveId?.trim() || undefined,
    title: resolveDisplayTitle(bestMatch),
    url: bestMatch.url,
    lastModified: bestMatch.lastModified,
  };
}

export async function readIndexedDocument(
  itemId: string,
  question?: string,
): Promise<ReadDocumentFallbackResult> {
  if (!hasAzureSearchConfig) {
    throw new Error(
      "Azure AI Search is not configured, so indexed document fallback is unavailable.",
    );
  }

  const trimmedQuestion = question?.trim();
  const useSemantic =
    Boolean(trimmedQuestion) && Boolean(env.azureSearchSemanticConfiguration);

  const response = await runAzureSearch({
    search: trimmedQuestion || "*",
    top: 50,
    select: "id,title,url,lastModified,content",
    queryType: useSemantic ? "semantic" : "simple",
    ...(useSemantic
      ? {
          semanticConfiguration: env.azureSearchSemanticConfiguration,
          captions: "extractive",
        }
      : {}),
  });

  const hits = (response.value ?? []).filter((hit) => {
    const resolvedItemId = resolveCanonicalItemId(hit);
    if (!hit.id || !resolvedItemId) {
      return false;
    }

    return resolvedItemId === itemId;
  });
  const first = hits[0];

  return {
    itemId,
    title: first ? resolveDisplayTitle(first) : undefined,
    url: first?.url,
    lastModified: first?.lastModified,
    strategy: "indexed-retrieval-fallback",
    excerpts: hits.slice(0, 3).map(getSnippet),
    caveats: [
      "This answer used indexed chunks instead of reopening the original SharePoint file live.",
      "Chunk order is not preserved in the current search index, so this fallback is best for question-focused retrieval rather than full-document reconstruction.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Advanced "Query Builder" search (deterministic keyword matching, no AI).
// Mirrors the lawyers' legacy desktop tool: ALL / ANY / EXACT / WITHOUT / PART.
// ---------------------------------------------------------------------------

export type AdvancedSearchInput = {
  allWords?: string;
  anyWords?: string;
  exactPhrase?: string;
  withoutWords?: string;
  partWords?: string;
  libraries?: string[];
  fileTypes?: FileTypeCategory[];
  top?: number;
};

// Escape Lucene query-syntax metacharacters in a user-supplied term.
const escapeLuceneTerm = (term: string) =>
  term.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");

// Strip wrapping quotes / brackets / box punctuation so a name written as
// «اسم» / (اسم) / [اسم] / "اسم" / ﴾اسم﴿ matches the bare token. The Arabic
// analyzer already drops these inside documents, so the fix is query-side.
const WRAP_PUNCT = /^[\s"'«»“”‘’()[\]{}<>﴾﴿،,.;:!؟?‘’“”]+|[\s"'«»“”‘’()[\]{}<>﴾﴿،,.;:!؟?‘’“”]+$/g;
const stripWrappingPunctuation = (token: string) => token.replace(WRAP_PUNCT, "");

const tokenizeWords = (value?: string) =>
  (value ?? "")
    .split(/\s+/)
    .map((token) => stripWrappingPunctuation(token.trim()))
    .filter(Boolean);

// Build a single Azure AI Search full-Lucene query from the five criteria.
function buildLuceneQuery(input: AdvancedSearchInput): string {
  const clauses: string[] = [];

  // ALL of the words -> every token required.
  for (const token of tokenizeWords(input.allWords)) {
    clauses.push(`+${escapeLuceneTerm(token)}`);
  }

  // ANY of the words -> at least one of the group required.
  const anyTokens = tokenizeWords(input.anyWords).map(escapeLuceneTerm);
  if (anyTokens.length === 1) {
    clauses.push(`+${anyTokens[0]}`);
  } else if (anyTokens.length > 1) {
    clauses.push(`+(${anyTokens.join(" OR ")})`);
  }

  // EXACT PHRASE -> required quoted phrase (drop any wrapping quotes/brackets).
  const phrase = stripWrappingPunctuation((input.exactPhrase ?? "").trim());
  if (phrase) {
    clauses.push(`+"${phrase.replace(/(["\\])/g, "\\$1")}"`);
  }

  // PART of the words -> required prefix match (token*).
  for (const token of tokenizeWords(input.partWords)) {
    clauses.push(`+${escapeLuceneTerm(token)}*`);
  }

  // WITHOUT the words -> prohibited.
  for (const token of tokenizeWords(input.withoutWords)) {
    clauses.push(`-${escapeLuceneTerm(token)}`);
  }

  return clauses.join(" ");
}

export async function searchDocumentsAdvanced(
  input: AdvancedSearchInput,
): Promise<SearchDocumentsResult> {
  if (!hasAzureSearchConfig) {
    return { configured: false, query: "", totalMatches: 0, documents: [] };
  }

  const query = buildLuceneQuery(input);
  if (!query.trim()) {
    return { configured: true, query: "", totalMatches: 0, documents: [] };
  }

  const displayTop = Math.min(Math.max(input.top ?? 30, 1), 50);
  const wantTypes = (input.fileTypes ?? []).filter(Boolean);
  const filteringTypes = wantTypes.length > 0;
  // The index has no file-type field, so type filtering is done in-app on the
  // URL-derived type. Pull a larger candidate pool first so rare types surface.
  const fetchTop = filteringTypes ? 1000 : displayTop;
  const libraryFilter = buildLibraryFilter(input.libraries);

  const response = await runAzureSearch({
    search: query,
    queryType: "full",
    searchFields: "content,contentAr,title",
    top: fetchTop,
    select: "id,title,url,lastModified,content,library,driveId,itemId,fileType,folderUrl",
    ...(libraryFilter ? { filter: libraryFilter } : {}),
  });

  const deduped = new Map<string, SearchDocumentMatch>();
  for (const hit of response.value ?? []) {
    const itemId = resolveCanonicalItemId(hit);
    if (!hit.id || !itemId) {
      continue;
    }

    const score = hit["@search.score"] ?? 0;
    const existing = deduped.get(itemId);
    if (existing && existing.score >= score) {
      continue;
    }

    // Prefer the indexed fields (populated by the indexer / backfill); fall back to
    // deriving from the URL for any chunk not yet carrying them.
    const parsed = parseFileUrl(hit.url);
    const fileType = (hit.fileType?.trim() as FileTypeCategory) || parsed.fileType;
    const folderUrl = hit.folderUrl?.trim() || parsed.folderUrl;
    deduped.set(itemId, {
      itemId,
      chunkId: hit.id,
      title: resolveDisplayTitle(hit),
      library: hit.library?.trim() || undefined,
      driveId: hit.driveId?.trim() || undefined,
      url: hit.url,
      folderUrl,
      fileType,
      lastModified: hit.lastModified,
      snippet: getSnippet(hit),
      score,
    });
  }

  const typeSet = new Set<FileTypeCategory>(wantTypes);
  const documents = [...deduped.values()]
    .filter((doc) => !filteringTypes || typeSet.has(doc.fileType ?? "other"))
    .sort((left, right) => right.score - left.score)
    .slice(0, displayTop);

  return { configured: true, query, totalMatches: documents.length, documents };
}
