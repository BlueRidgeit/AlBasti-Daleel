// Opt-in SharePoint permission trimming.
//
// The search index is built by an app-only crawler, so it contains every document. When
// DALEEL_ENFORCE_SHAREPOINT_PERMISSIONS=true, each candidate result is checked against SharePoint
// with the signed-in user's own Microsoft Graph token (on-behalf-of) before it is shown or read.
// If the user cannot open the file in SharePoint, Daleel does not show its title, link or text.
//
// Fail closed: when a check cannot be completed (no token, Graph error, throttling) the document
// is left out. Nothing here runs unless the flag is on, so existing deployments are unaffected.

export type Viewer = {
  // Microsoft Graph access token for the signed-in user (from the OBO exchange).
  graphAccessToken?: string;
  // Entra object id of the user; only used as a cache key.
  userId?: string;
};

export type AccessVerdict = "allowed" | "denied" | "unknown";

export type PermissionConfig = {
  enabled: boolean;
  cacheSeconds: number;
  // Used when an indexed chunk has no driveId (single-library legacy index).
  defaultDriveId?: string;
};

const GRAPH_BATCH_URL = "https://graph.microsoft.com/v1.0/$batch";
const BATCH_SIZE = 20; // Microsoft Graph's $batch limit
const MAX_CHECKS = 200; // upper bound of items checked for one search
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_MAX_ENTRIES = 10000;

export const NO_TOKEN_NOTICE =
  "Your SharePoint permissions could not be checked, so no documents are shown. Sign out and sign in again, then retry.";
// Shown whenever nothing is left to show. It reads the same whether nothing matched or matches were
// hidden, so it never reveals that a file exists.
export const NO_ACCESSIBLE_RESULTS_NOTICE =
  "No documents matching this were found among the documents this user's SharePoint account can open. If they expect to find files here, they should ask their SharePoint administrator to check their access to the library.";
export const UNVERIFIED_NOTICE =
  "Some results could not be checked against your SharePoint permissions and were left out.";

let config: PermissionConfig | undefined;

// Read lazily from the environment so this module has no import-time dependencies.
const getConfig = (): PermissionConfig => {
  if (config) {
    return config;
  }
  const seconds = Number(process.env.DALEEL_PERMISSION_CACHE_SECONDS);
  return {
    enabled:
      process.env.DALEEL_ENFORCE_SHAREPOINT_PERMISSIONS?.trim().toLowerCase() === "true",
    cacheSeconds: Number.isFinite(seconds) && seconds >= 0 ? seconds : 300,
    defaultDriveId: process.env.SHAREPOINT_DRIVE_ID?.trim() || undefined,
  };
};

// Tests inject their own configuration; pass undefined to go back to the environment.
export const setPermissionConfigForTests = (value?: PermissionConfig) => {
  config = value;
  cache.clear();
};

export const isPermissionTrimmingEnabled = () => getConfig().enabled;

type CacheEntry = { allowed: boolean; at: number };
const cache = new Map<string, CacheEntry>();

const cacheKey = (viewer: Viewer, driveId: string, itemId: string) =>
  viewer.userId ? `${viewer.userId}|${driveId}|${itemId}` : undefined;

const readCache = (key: string | undefined, ttlSeconds: number) => {
  if (!key || ttlSeconds <= 0) {
    return undefined;
  }
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.at > ttlSeconds * 1000) {
    cache.delete(key);
    return undefined;
  }
  return entry.allowed;
};

const writeCache = (key: string | undefined, allowed: boolean, ttlSeconds: number) => {
  if (!key || ttlSeconds <= 0) {
    return;
  }
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Maps iterate in insertion order, so this drops the oldest entry.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(key, { allowed, at: Date.now() });
};

type BatchResponse = {
  responses?: { id?: string; status?: number }[];
};

const statusToVerdict = (status?: number): AccessVerdict => {
  if (status === 200) {
    return "allowed";
  }
  // SharePoint answers 403 (no access) or 404 (hidden from this user, or deleted).
  if (status === 403 || status === 404) {
    return "denied";
  }
  return "unknown"; // 401, 429, 5xx, no answer: cannot tell, so do not show.
};

export type ItemRef = { driveId: string; itemId: string };

// Ask SharePoint, as the user, whether each item can be opened. One call per 20 items.
export async function checkItemAccess(
  items: ItemRef[],
  viewer: Viewer,
): Promise<AccessVerdict[]> {
  const { cacheSeconds } = getConfig();
  const verdicts: AccessVerdict[] = items.map(() => "unknown");

  if (!viewer.graphAccessToken) {
    return verdicts;
  }

  const pending: { index: number; key?: string }[] = [];
  items.forEach((item, index) => {
    const key = cacheKey(viewer, item.driveId, item.itemId);
    const cached = readCache(key, cacheSeconds);
    if (cached === undefined) {
      pending.push({ index, key });
    } else {
      verdicts[index] = cached ? "allowed" : "denied";
    }
  });

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const group = pending.slice(start, start + BATCH_SIZE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(GRAPH_BATCH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${viewer.graphAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: group.map((entry, position) => ({
            id: String(position),
            method: "GET",
            url: `/drives/${encodeURIComponent(items[entry.index].driveId)}/items/${encodeURIComponent(items[entry.index].itemId)}?$select=id`,
          })),
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        continue; // whole batch unknown
      }

      const data = (await response.json()) as BatchResponse;
      for (const answer of data.responses ?? []) {
        const entry = group[Number(answer.id)];
        if (!entry) {
          continue;
        }
        const verdict = statusToVerdict(answer.status);
        verdicts[entry.index] = verdict;
        if (verdict !== "unknown") {
          writeCache(entry.key, verdict === "allowed", cacheSeconds);
        }
      }
    } catch (error) {
      console.error("SharePoint permission check failed", error);
    } finally {
      clearTimeout(timer);
    }
  }

  return verdicts;
}

type Candidate = { itemId: string; driveId?: string };

// Keep the first `limit` documents (already sorted best-first) the user may open.
// Works through the candidates in groups of 20 and stops as soon as it has enough.
export async function filterAccessibleDocuments<T extends Candidate>(
  sortedDocuments: T[],
  limit: number,
  viewer?: Viewer,
): Promise<{ documents: T[]; notice?: string }> {
  const { enabled, defaultDriveId } = getConfig();
  if (!enabled) {
    return { documents: sortedDocuments.slice(0, limit) };
  }
  if (!viewer?.graphAccessToken) {
    return { documents: [], notice: NO_TOKEN_NOTICE };
  }

  const accepted: T[] = [];
  let unverified = 0;
  let checked = 0;

  for (
    let start = 0;
    start < sortedDocuments.length && accepted.length < limit && checked < MAX_CHECKS;
    start += BATCH_SIZE
  ) {
    const group = sortedDocuments.slice(start, start + BATCH_SIZE);
    checked += group.length;

    const checkable: { doc: T; ref: ItemRef }[] = [];
    for (const doc of group) {
      const driveId = doc.driveId?.trim() || defaultDriveId;
      if (driveId && doc.itemId) {
        checkable.push({ doc, ref: { driveId, itemId: doc.itemId } });
      } else {
        unverified += 1;
      }
    }

    const verdicts = await checkItemAccess(
      checkable.map((entry) => entry.ref),
      viewer,
    );

    checkable.forEach((entry, position) => {
      if (verdicts[position] === "allowed") {
        if (accepted.length < limit) {
          accepted.push(entry.doc);
        }
      } else if (verdicts[position] === "unknown") {
        unverified += 1;
      }
    });
  }

  // Say nothing about how many files were hidden; a count would reveal that they exist.
  return {
    documents: accepted,
    notice:
      accepted.length > 0
        ? undefined
        : unverified > 0
          ? UNVERIFIED_NOTICE
          : NO_ACCESSIBLE_RESULTS_NOTICE,
  };
}
