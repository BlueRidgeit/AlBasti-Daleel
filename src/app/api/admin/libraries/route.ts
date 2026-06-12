import { env, hasAzureSearchConfig } from "@/lib/env";
import {
  acquireGraphAppToken,
  getAuthenticatedUserFromRequest,
} from "@/lib/auth-server";

export const runtime = "nodejs";

const SEARCH_API_VERSION = "2025-09-01";
const GRAPH = "https://graph.microsoft.com/v1.0";

// Only Entra Global Administrators may list/enable libraries.
async function adminGate(request: Request): Promise<Response | null> {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!user.isGlobalAdmin) {
    return Response.json(
      { error: "Global Administrator role required." },
      { status: 403 },
    );
  }

  return null;
}

// Map of library label -> indexed chunk count (a facet on the search index).
async function getIndexedCounts(): Promise<Record<string, number>> {
  if (!hasAzureSearchConfig) {
    return {};
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
        body: JSON.stringify({ search: "*", top: 0, facets: ["library,count:100"] }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return {};
    }

    const data = (await response.json()) as {
      "@search.facets"?: { library?: { value?: string; count?: number }[] };
    };

    const counts: Record<string, number> = {};
    for (const facet of data["@search.facets"]?.library ?? []) {
      if (typeof facet.value === "string") {
        counts[facet.value] = facet.count ?? 0;
      }
    }
    return counts;
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const denied = await adminGate(request);
  if (denied) {
    return denied;
  }

  if (!env.sharePointSiteId) {
    return Response.json(
      { error: "SHAREPOINT_SITE_ID is not configured.", libraries: [] },
      { status: 500 },
    );
  }

  let token: string | undefined;
  try {
    token = await acquireGraphAppToken();
  } catch {
    return Response.json(
      { error: "Could not acquire a Microsoft Graph app token.", libraries: [] },
      { status: 500 },
    );
  }

  const response = await fetch(
    `${GRAPH}/sites/${env.sharePointSiteId}/drives?$select=id,name,webUrl`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  ).catch(() => undefined);

  if (!response?.ok) {
    return Response.json(
      { error: "Microsoft Graph drives request failed.", libraries: [] },
      { status: 502 },
    );
  }

  const drives =
    ((await response.json()) as {
      value?: { id?: string; name?: string; webUrl?: string }[];
    }).value ?? [];
  const counts = await getIndexedCounts();

  const libraries = drives
    .filter((drive) => drive.id && drive.name)
    .map((drive) => ({
      driveId: drive.id!,
      label: drive.name!,
      webUrl: drive.webUrl,
      indexed: (counts[drive.name!] ?? 0) > 0,
      count: counts[drive.name!] ?? 0,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return Response.json({ libraries });
}

export async function POST(request: Request) {
  const denied = await adminGate(request);
  if (denied) {
    return denied;
  }

  const body = (await request.json().catch(() => undefined)) as
    | { driveId?: string; label?: string }
    | undefined;
  const driveId = body?.driveId?.trim();
  const label = body?.label?.trim();

  if (!driveId || !label) {
    return Response.json(
      { error: "driveId and label are required." },
      { status: 400 },
    );
  }

  // Ask the indexer to register the library and ingest it (register + reindex).
  const url = `${env.indexerBaseUrl.replace(/\/$/, "")}/api/reindex?driveId=${encodeURIComponent(
    driveId,
  )}&library=${encodeURIComponent(label)}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: env.indexerFunctionKey
        ? { "x-functions-key": env.indexerFunctionKey }
        : {},
    });

    const text = await response.text();
    if (!response.ok) {
      return Response.json(
        { error: `Indexer reindex failed (${response.status}). ${text}` },
        { status: 502 },
      );
    }

    let indexer: unknown = text;
    try {
      indexer = JSON.parse(text);
    } catch {
      /* keep raw text */
    }

    return Response.json({ ok: true, library: label, indexer });
  } catch {
    return Response.json(
      { error: "Could not reach the indexer. Is it running or deployed?" },
      { status: 502 },
    );
  }
}

// Un-index a library: remove it from the crawl list and delete its indexed chunks.
export async function DELETE(request: Request) {
  const denied = await adminGate(request);
  if (denied) {
    return denied;
  }

  const body = (await request.json().catch(() => undefined)) as
    | { driveId?: string; label?: string }
    | undefined;
  const driveId = body?.driveId?.trim();
  const label = body?.label?.trim();

  if (!driveId) {
    return Response.json({ error: "driveId is required." }, { status: 400 });
  }

  const url = `${env.indexerBaseUrl.replace(/\/$/, "")}/api/reindex?driveId=${encodeURIComponent(
    driveId,
  )}&library=${encodeURIComponent(label ?? "")}&action=remove`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: env.indexerFunctionKey
        ? { "x-functions-key": env.indexerFunctionKey }
        : {},
    });

    const text = await response.text();
    if (!response.ok) {
      return Response.json(
        { error: `Indexer remove failed (${response.status}). ${text}` },
        { status: 502 },
      );
    }

    let indexer: unknown = text;
    try {
      indexer = JSON.parse(text);
    } catch {
      /* keep raw text */
    }

    return Response.json({ ok: true, indexer });
  } catch {
    return Response.json(
      { error: "Could not reach the indexer. Is it running or deployed?" },
      { status: 502 },
    );
  }
}
