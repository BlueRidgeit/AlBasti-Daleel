import { env } from "@/lib/env";

// Creating folders and files in SharePoint through Microsoft Graph, as the signed-in user (the
// token comes from the on-behalf-of flow, so SharePoint's own permissions always apply). Create
// only: nothing here overwrites, moves or deletes.

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_SIMPLE_UPLOAD = 4 * 1024 * 1024;
const SEARCH_API_VERSION = "2025-09-01";

export class SharePointError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const FORBIDDEN = /["*:<>?/\\|\u0000-\u001F]/g;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export function sanitizeSegment(raw: string): string {
  const cleaned = raw.replace(FORBIDDEN, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  if (!cleaned || cleaned === "." || cleaned === ".." || RESERVED.test(cleaned) || cleaned.startsWith("~$")) {
    throw new SharePointError(`"${raw}" is not a usable folder or file name.`);
  }
  if (cleaned.length > 120) throw new SharePointError(`"${raw.slice(0, 30)}…" is too long.`);
  return cleaned;
}

export function parseFolderPath(path: string): string[] {
  const parts = path
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => part === ".." || part === ".")) {
    throw new SharePointError("The folder path may not contain '.' or '..'.");
  }
  if (parts.length > 8) throw new SharePointError("The folder path is too deep (maximum 8 levels).");
  return parts.map(sanitizeSegment);
}

export function sanitizeDocxName(name: string): string {
  const base = sanitizeSegment(name.replace(/\.docx$/i, ""));
  return `${base}.docx`;
}

const encodePath = (segments: string[]) => segments.map(encodeURIComponent).join("/");

async function graph(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) },
    signal: AbortSignal.timeout(30_000),
  });
  return response;
}

const failFrom = async (response: Response, action: string): Promise<never> => {
  const body = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  const detail = body.error?.message ?? body.error?.code ?? `HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    throw new SharePointError(
      `Not allowed to ${action}: ${detail}. Either you do not have edit permission on that location in SharePoint, or Daleel has not been granted the write permission yet.`,
      response.status,
    );
  }
  throw new SharePointError(`Could not ${action}: ${detail}`, response.status);
};

// ---------------------------------------------------------------------------------------------
// Libraries
// ---------------------------------------------------------------------------------------------

export type LibraryRef = { label: string; driveId: string };

// The index stores each document's library label and drive id, so the drive for a library name
// is looked up there (the same source the Library filter uses).
export async function resolveLibrary(label: string): Promise<LibraryRef> {
  const wanted = label.trim();
  if (!wanted) throw new SharePointError("Which library? (for example Proposals)");
  if (env.createLibraries.length > 0 && !env.createLibraries.includes(wanted.toLowerCase())) {
    throw new SharePointError(`Daleel is not allowed to create files in "${wanted}".`);
  }
  if (!env.azureSearchEndpoint || !env.azureSearchApiKey) {
    throw new SharePointError("Search is not configured, so libraries cannot be resolved.");
  }

  const endpoint = env.azureSearchEndpoint.replace(/\/$/, "");
  const response = await fetch(
    `${endpoint}/indexes/${env.azureSearchIndexName}/docs/search?api-version=${SEARCH_API_VERSION}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": env.azureSearchApiKey },
      body: JSON.stringify({
        search: "*",
        top: 0,
        facets: ["library,count:100,sort:value"],
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new SharePointError("Could not look up the libraries.");

  const data = (await response.json()) as { "@search.facets"?: { library?: Array<{ value?: string }> } };
  const labels = (data["@search.facets"]?.library ?? []).map((f) => f.value).filter((v): v is string => Boolean(v));
  const match = labels.find((candidate) => candidate.toLowerCase() === wanted.toLowerCase());
  if (!match) {
    throw new SharePointError(`There is no library called "${wanted}". Available: ${labels.join(", ") || "none"}.`);
  }

  const escaped = match.replace(/'/g, "''");
  const docs = await fetch(
    `${endpoint}/indexes/${env.azureSearchIndexName}/docs/search?api-version=${SEARCH_API_VERSION}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": env.azureSearchApiKey },
      body: JSON.stringify({ search: "*", top: 1, select: "driveId", filter: `library eq '${escaped}'` }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const found = (await docs.json().catch(() => ({}))) as { value?: Array<{ driveId?: string }> };
  const driveId = found.value?.[0]?.driveId;
  if (!driveId) throw new SharePointError(`Could not find the drive for "${match}".`);
  return { label: match, driveId };
}

// ---------------------------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------------------------

type DriveItem = { id: string; name?: string; webUrl?: string; folder?: unknown; size?: number };

export async function itemAt(token: string, driveId: string, segments: string[]) {
  return getItemByPath(token, driveId, segments);
}

async function getItemByPath(token: string, driveId: string, segments: string[]): Promise<DriveItem | undefined> {
  const path = segments.length === 0 ? "/root" : `/root:/${encodePath(segments)}`;
  const response = await graph(token, `/drives/${encodeURIComponent(driveId)}${path}?$select=id,name,webUrl,folder,size`);
  if (response.status === 404) return undefined;
  if (!response.ok) await failFrom(response, "look up that folder");
  return (await response.json()) as DriveItem;
}

// Which folders of the path do not exist yet (so the preview can say what will be created).
export async function missingFolders(token: string, driveId: string, segments: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const existing = await getItemByPath(token, driveId, segments.slice(0, i + 1));
    if (!existing) {
      missing.push(...segments.slice(i));
      break;
    }
  }
  return missing;
}

export async function ensureFolder(
  token: string,
  driveId: string,
  segments: string[],
): Promise<{ id: string; webUrl?: string; created: string[] }> {
  let parent = await getItemByPath(token, driveId, []);
  if (!parent) throw new SharePointError("Could not open the library root.");
  const created: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const existing = await getItemByPath(token, driveId, segments.slice(0, i + 1));
    if (existing) {
      if (!existing.folder) throw new SharePointError(`"${segments[i]}" already exists and is a file, not a folder.`);
      parent = existing;
      continue;
    }
    const response = await graph(token, `/drives/${encodeURIComponent(driveId)}/items/${parent.id}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: segments[i], folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (response.status === 409) {
      // Created by someone else in the meantime: use it.
      const again = await getItemByPath(token, driveId, segments.slice(0, i + 1));
      if (!again?.folder) throw new SharePointError(`Could not create the folder "${segments[i]}".`);
      parent = again;
      continue;
    }
    if (!response.ok) await failFrom(response, `create the folder "${segments[i]}"`);
    parent = (await response.json()) as DriveItem;
    created.push(segments[i]);
  }
  return { id: parent.id, webUrl: parent.webUrl, created };
}

// ---------------------------------------------------------------------------------------------
// Templates and files
// ---------------------------------------------------------------------------------------------

export type TemplateRef = { id: string; name: string; webUrl?: string; driveId: string };

export async function listTemplates(token: string): Promise<{ location: string; templates: TemplateRef[] }> {
  const segments = env.templatesPath.split(/[\\/]+/).map((s) => s.trim()).filter(Boolean);
  const [libraryLabel, ...folder] = segments;
  if (!libraryLabel) throw new SharePointError("The templates location is not configured.");
  const library = await resolveLibrary(libraryLabel);

  const path = folder.length === 0 ? "/root/children" : `/root:/${encodePath(folder)}:/children`;
  const response = await graph(token, `/drives/${encodeURIComponent(library.driveId)}${path}?$select=id,name,webUrl,file&$top=200`);
  if (response.status === 404) return { location: env.templatesPath, templates: [] };
  if (!response.ok) await failFrom(response, "list the templates");

  const data = (await response.json()) as { value?: Array<DriveItem & { file?: unknown }> };
  const templates = (data.value ?? [])
    .filter((item) => item.file && /\.docx$/i.test(item.name ?? "") && !(item.name ?? "").startsWith("~$"))
    .map((item) => ({ id: item.id, name: item.name!, webUrl: item.webUrl, driveId: library.driveId }));
  return { location: env.templatesPath, templates };
}

export async function findTemplate(token: string, wanted: string): Promise<TemplateRef> {
  const { location, templates } = await listTemplates(token);
  const clean = wanted.trim().toLowerCase().replace(/\.docx$/, "");
  const match = templates.find((t) => t.name.toLowerCase().replace(/\.docx$/, "") === clean);
  if (!match) {
    throw new SharePointError(
      `No template called "${wanted}" in ${location}. Available: ${templates.map((t) => t.name).join(", ") || "none"}.`,
    );
  }
  return match;
}

export async function downloadItem(token: string, driveId: string, itemId: string): Promise<Buffer> {
  const response = await graph(token, `/drives/${encodeURIComponent(driveId)}/items/${itemId}/content`);
  if (!response.ok) await failFrom(response, "read the template");
  return Buffer.from(await response.arrayBuffer());
}

export async function uploadNewFile(
  token: string,
  driveId: string,
  folderSegments: string[],
  fileName: string,
  data: Buffer,
): Promise<{ name: string; webUrl?: string; id: string }> {
  if (data.length > MAX_SIMPLE_UPLOAD) {
    throw new SharePointError("The generated document is larger than 4 MB, which this first version cannot upload.");
  }
  const path = encodePath([...folderSegments, fileName]);
  // conflictBehavior=rename: an existing file is never overwritten; the new one gets a numbered name.
  const response = await graph(
    token,
    `/drives/${encodeURIComponent(driveId)}/root:/${path}:/content?@microsoft.graph.conflictBehavior=rename`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      body: new Uint8Array(data),
    },
  );
  if (!response.ok) await failFrom(response, "save the document");
  const item = (await response.json()) as DriveItem;
  return { id: item.id, name: item.name ?? fileName, webUrl: item.webUrl };
}
