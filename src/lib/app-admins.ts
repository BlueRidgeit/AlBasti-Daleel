import { CosmosClient, type Container } from "@azure/cosmos";

import { query } from "@/lib/db";
import { env, hasAzureCosmosConfig, hasDatabaseConfig } from "@/lib/env";

// A UI-managed app-admin. These users get the same admin capabilities as tenant Global
// Administrators, but WITHOUT holding any tenant directory role — the grant lives only in
// this app's Cosmos store and is managed from Settings by an existing admin.
export type AppAdmin = {
  email: string;
  displayName?: string;
  addedBy?: string;
  addedAt: string;
};

type AppAdminDocument = AppAdmin & {
  id: string; // lowercased email (also the item key)
  type: "admin"; // constant partition-key value — all admins live in one small partition
};

const PARTITION = "admin";
const CACHE_TTL_MS = 60_000;

// The opt-in Postgres store (DALEEL_DATABASE_URL) takes precedence over Cosmos.
export const appAdminsEnabled = hasDatabaseConfig || hasAzureCosmosConfig;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

let cosmosClient: CosmosClient | null = null;
let containerPromise: Promise<Container> | null = null;

// Cached set of lowercased admin emails, so the per-request auth check does not hit Cosmos
// on every call. Busted immediately on any add/remove.
let cache: { emails: Set<string>; expires: number } | null = null;

const getClient = () => {
  if (!hasAzureCosmosConfig) {
    return null;
  }

  if (!cosmosClient) {
    cosmosClient = new CosmosClient({
      endpoint: env.azureCosmosEndpoint!,
      key: env.azureCosmosKey!,
    });
  }

  return cosmosClient;
};

const ensureContainer = async (): Promise<Container | null> => {
  if (!hasAzureCosmosConfig) {
    return null;
  }

  if (!containerPromise) {
    containerPromise = (async () => {
      const client = getClient()!;
      const { database } = await client.databases.createIfNotExists({
        id: env.azureCosmosDatabase,
      });
      const { container } = await database.containers.createIfNotExists({
        id: env.azureCosmosAdminsContainer,
        partitionKey: { paths: ["/type"] },
      });
      return container;
    })();
  }

  return containerPromise;
};

const toAppAdmin = (doc: AppAdminDocument): AppAdmin => ({
  email: doc.email,
  displayName: doc.displayName,
  addedBy: doc.addedBy,
  addedAt: doc.addedAt,
});

type AdminRow = {
  email: string;
  display_name: string | null;
  added_by: string | null;
  added_at: Date | string;
};

const fromRow = (row: AdminRow): AppAdmin => ({
  email: row.email,
  displayName: row.display_name ?? undefined,
  addedBy: row.added_by ?? undefined,
  addedAt: new Date(row.added_at).toISOString(),
});

export async function listAppAdmins(): Promise<AppAdmin[]> {
  if (hasDatabaseConfig) {
    const rows = await query<AdminRow>(
      "SELECT email, display_name, added_by, added_at FROM app_admins ORDER BY lower(email)",
    );
    return rows.map(fromRow);
  }

  const container = await ensureContainer();
  if (!container) {
    return [];
  }

  const { resources } = await container.items
    .query<AppAdminDocument>(
      {
        query: "SELECT * FROM c WHERE c.type = @type",
        parameters: [{ name: "@type", value: PARTITION }],
      },
      { partitionKey: PARTITION },
    )
    .fetchAll();

  return resources
    .map(toAppAdmin)
    .sort((a, b) => a.email.localeCompare(b.email));
}

// True if the given signed-in email has been granted app-admin via the Cosmos list.
// Fails closed (returns false) on any transient Cosmos error so a lookup blip never crashes auth.
export async function isAppAdmin(email: string): Promise<boolean> {
  if (!appAdminsEnabled) {
    return false;
  }

  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }

  const now = Date.now();
  if (!cache || cache.expires < now) {
    try {
      const admins = await listAppAdmins();
      cache = {
        emails: new Set(admins.map((admin) => normalizeEmail(admin.email))),
        expires: now + CACHE_TTL_MS,
      };
    } catch {
      // Serve a stale cache if we have one; otherwise deny (fail closed).
      return cache?.emails.has(normalized) ?? false;
    }
  }

  return cache.emails.has(normalized);
}

export async function addAppAdmin(args: {
  email: string;
  displayName?: string;
  addedBy?: string;
}): Promise<AppAdmin | null> {
  if (hasDatabaseConfig) {
    const email = args.email.trim();
    const normalized = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return null;
    }
    // Stored lowercased so lookups are case-insensitive; display name is kept separately.
    const rows = await query<AdminRow>(
      `INSERT INTO app_admins (email, display_name, added_by, added_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING email, display_name, added_by, added_at`,
      [normalized, args.displayName?.trim() || null, args.addedBy ?? null],
    );
    cache = null;
    return fromRow(rows[0]);
  }

  const container = await ensureContainer();
  if (!container) {
    return null;
  }

  const email = args.email.trim();
  const normalized = normalizeEmail(email);
  // Minimal UPN/email shape check — must look like `user@domain`.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }

  const doc: AppAdminDocument = {
    id: normalized,
    type: "admin",
    email, // keep the original casing for display
    displayName: args.displayName?.trim() || undefined,
    addedBy: args.addedBy,
    addedAt: new Date().toISOString(),
  };

  await container.items.upsert(doc);
  cache = null; // force a fresh read on the next auth check
  return toAppAdmin(doc);
}

export async function removeAppAdmin(email: string): Promise<boolean> {
  if (hasDatabaseConfig) {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return false;
    }
    const rows = await query<{ email: string }>(
      "DELETE FROM app_admins WHERE email = $1 RETURNING email",
      [normalized],
    );
    cache = null;
    return rows.length > 0;
  }

  const container = await ensureContainer();
  if (!container) {
    return false;
  }

  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }

  try {
    await container.item(normalized, PARTITION).delete();
    cache = null;
    return true;
  } catch {
    return false;
  }
}
