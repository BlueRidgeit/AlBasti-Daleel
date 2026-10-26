import { enforceAccess } from "@/lib/route-guard";
import { env, hasAzureSearchConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_API_VERSION = "2025-09-01";

type LibraryFacet = {
  value?: string;
  count?: number;
};

type FacetResponse = {
  "@search.facets"?: {
    library?: LibraryFacet[];
  };
};

// Lists the document libraries that currently have content in the index, with per-library
// counts, so the search-filter UI can render checkboxes. Derived from the index itself
// (a facet query), so it stays in sync without depending on the indexer's storage.
export async function GET(request: Request) {
  const accessDenied = await enforceAccess(request);
  if (accessDenied) {
    return accessDenied;
  }

  if (!hasAzureSearchConfig) {
    return Response.json({ libraries: [] });
  }

  try {
    const endpoint = env.azureSearchEndpoint!.replace(/\/$/, "");
    const response = await fetch(
      `${endpoint}/indexes/${env.azureSearchIndexName}/docs/search?api-version=${SEARCH_API_VERSION}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": env.azureSearchApiKey!,
        },
        body: JSON.stringify({
          search: "*",
          top: 0,
          facets: ["library,count:100,sort:value"],
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.error("Library facet query failed", response.status);
      return Response.json({ libraries: [] });
    }

    const data = (await response.json()) as FacetResponse;
    const libraries = (data["@search.facets"]?.library ?? [])
      .filter(
        (facet): facet is { value: string; count?: number } =>
          typeof facet.value === "string" && facet.value.trim().length > 0,
      )
      .map((facet) => ({ label: facet.value, count: facet.count ?? 0 }));

    return Response.json({ libraries });
  } catch (error) {
    console.error("Failed to list libraries", error);
    return Response.json({ libraries: [] });
  }
}
