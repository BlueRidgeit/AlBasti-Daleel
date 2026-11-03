import { env, hasAzureSearchConfig } from "@/lib/env";
import {
  checkItemAccess,
  isPermissionTrimmingEnabled,
  NO_TOKEN_NOTICE,
  type Viewer,
} from "@/lib/permission-trim";

const SEARCH_API_VERSION = "2025-09-01";
const DRIVE_CACHE_TTL_MS = 10 * 60 * 1000;

export type LibraryEntry = { label: string; count: number };
export type LibraryListResult = {
  libraries: LibraryEntry[];
  notice?: string;
  // True when the list was limited to the libraries this user can open.
  permissionTrimmed?: boolean;
};

type FacetResponse = {
  "@search.facets"?: { library?: { value?: string; count?: number }[] };
  value?: { driveId?: string }[];
};

const searchIndex = async (body: Record<string, unknown>) => {
  const endpoint = env.azureSearchEndpoint!.replace(/\/$/, "");
  const response = await fetch(
    `${endpoint}/indexes/${env.azureSearchIndexName}/docs/search?api-version=${SEARCH_API_VERSION}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": env.azureSearchApiKey! },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Azure Search request failed (${response.status})`);
  }
  return (await response.json()) as FacetResponse;
};

// label -> driveId, remembered for a while because it almost never changes.
const driveCache = new Map<string, { driveId?: string; at: number }>();

const driveIdForLibrary = async (label: string): Promise<string | undefined> => {
  const cached = driveCache.get(label);
  if (cached && Date.now() - cached.at < DRIVE_CACHE_TTL_MS) {
    return cached.driveId;
  }
  const data = await searchIndex({
    search: "*",
    top: 1,
    select: "driveId",
    filter: `library eq '${label.replace(/'/g, "''")}'`,
  });
  const driveId = data.value?.[0]?.driveId?.trim() || undefined;
  driveCache.set(label, { driveId, at: Date.now() });
  return driveId;
};

export const clearLibraryCachesForTests = () => driveCache.clear();

// Lists the document libraries that currently have content in the index, with per-library
// counts, so the search-filter UI can render checkboxes. Derived from the index itself
// (a facet query), so it stays in sync without depending on the indexer's storage.
//
// With SharePoint permission trimming on, only libraries the signed-in user can open in
// SharePoint are listed (others, and their counts, are hidden).
export async function listLibraries(viewer?: Viewer): Promise<LibraryListResult> {
  if (!hasAzureSearchConfig) {
    return { libraries: [] };
  }

  const data = await searchIndex({
    search: "*",
    top: 0,
    facets: ["library,count:100,sort:value"],
  });

  const libraries = (data["@search.facets"]?.library ?? [])
    .filter(
      (facet): facet is { value: string; count?: number } =>
        typeof facet.value === "string" && facet.value.trim().length > 0,
    )
    .map((facet) => ({ label: facet.value, count: facet.count ?? 0 }));

  if (!isPermissionTrimmingEnabled()) {
    return { libraries };
  }
  if (!viewer?.graphAccessToken) {
    return { libraries: [], notice: NO_TOKEN_NOTICE, permissionTrimmed: true };
  }

  const driveIds = await Promise.all(
    libraries.map((library) => driveIdForLibrary(library.label).catch(() => undefined)),
  );
  const checkable = libraries
    .map((library, index) => ({ library, driveId: driveIds[index] }))
    .filter((entry): entry is { library: LibraryEntry; driveId: string } =>
      Boolean(entry.driveId),
    );

  // "root" is Graph's alias for the library's top folder. A library is listed only if the user can
  // see at least one item directly in it.
  const verdicts = await checkItemAccess(
    checkable.map((entry) => ({ driveId: entry.driveId, itemId: "root", mode: "contents" as const })),
    viewer,
  );

  return {
    libraries: checkable
      .filter((_, index) => verdicts[index] === "allowed")
      .map((entry) => entry.library),
    permissionTrimmed: true,
  };
}
