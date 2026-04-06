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
  url?: string;
  lastModified?: string;
  content?: string;
};

type AzureSearchResponse = {
  value?: AzureSearchHit[];
};

export type SearchDocumentMatch = {
  itemId: string;
  chunkId: string;
  title: string;
  url?: string;
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
};

const normalizeEndpoint = (endpoint: string) => endpoint.replace(/\/$/, "");

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

export async function searchDocuments(
  query: string,
  { top = 6 }: SearchDocumentsOptions = {},
): Promise<SearchDocumentsResult> {
  if (!hasAzureSearchConfig) {
    return {
      configured: false,
      query,
      totalMatches: 0,
      documents: [],
    };
  }

  const useSemantic =
    Boolean(query.trim()) && Boolean(env.azureSearchSemanticConfiguration);

  const response = await runAzureSearch({
    search: query.trim() || "*",
    top: Math.min(Math.max(top * 3, 6), 30),
    select: "id,title,url,lastModified,content",
    queryType: useSemantic ? "semantic" : "simple",
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

    deduped.set(itemId, {
      itemId,
      chunkId: hit.id,
      title: resolveDisplayTitle(hit),
      url: hit.url,
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
