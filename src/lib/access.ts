import { getSetting, setSetting } from "@/lib/app-settings";
import { query } from "@/lib/db";
import { env, hasDatabaseConfig } from "@/lib/env";

// Optional access control: when "restricted", only admins and users listed under Settings →
// Users may use Daleel. Off by default (and always off without the Postgres database), in
// which case every signed-in tenant user has access exactly as before.

export type AccessRole = "admin" | "user" | "none";

export type AppUser = {
  email: string;
  displayName?: string;
  role: "user";
  addedBy?: string;
  addedAt: string;
};

type AccessSettings = { restrict: boolean };

const SETTINGS_KEY = "access";
const USERS_CACHE_TTL_MS = 30_000;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const accessControlAvailable = hasDatabaseConfig;

export async function isAccessRestricted(): Promise<boolean> {
  if (env.restrictAccess) {
    return true;
  }
  if (!hasDatabaseConfig) {
    return false;
  }
  const settings = await getSetting<AccessSettings>(SETTINGS_KEY);
  return Boolean(settings?.restrict);
}

export async function setAccessRestricted(restrict: boolean, updatedBy?: string) {
  return setSetting(SETTINGS_KEY, { restrict } satisfies AccessSettings, updatedBy);
}

type UserRow = {
  email: string;
  display_name: string | null;
  role: string;
  added_by: string | null;
  added_at: Date | string;
};

const fromRow = (row: UserRow): AppUser => ({
  email: row.email,
  displayName: row.display_name ?? undefined,
  role: "user",
  addedBy: row.added_by ?? undefined,
  addedAt: new Date(row.added_at).toISOString(),
});

export async function listAppUsers(): Promise<AppUser[]> {
  if (!hasDatabaseConfig) {
    return [];
  }
  const rows = await query<UserRow>(
    "SELECT email, display_name, role, added_by, added_at FROM app_users ORDER BY lower(email)",
  );
  return rows.map(fromRow);
}

export async function addAppUser(args: {
  email: string;
  displayName?: string;
  addedBy?: string;
}): Promise<AppUser | null> {
  if (!hasDatabaseConfig) {
    return null;
  }
  const normalized = normalizeEmail(args.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  const rows = await query<UserRow>(
    `INSERT INTO app_users (email, display_name, role, added_by, added_at)
     VALUES ($1, $2, 'user', $3, now())
     ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING email, display_name, role, added_by, added_at`,
    [normalized, args.displayName?.trim() || null, args.addedBy ?? null],
  );
  usersCache = null;
  return fromRow(rows[0]);
}

export async function removeAppUser(email: string): Promise<boolean> {
  if (!hasDatabaseConfig) {
    return false;
  }
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }
  const rows = await query<{ email: string }>(
    "DELETE FROM app_users WHERE email = $1 RETURNING email",
    [normalized],
  );
  usersCache = null;
  return rows.length > 0;
}

let usersCache: { emails: Set<string>; expires: number } | null = null;

async function isListedUser(email: string): Promise<boolean> {
  const now = Date.now();
  if (!usersCache || usersCache.expires < now) {
    try {
      const users = await listAppUsers();
      usersCache = {
        emails: new Set(users.map((user) => normalizeEmail(user.email))),
        expires: now + USERS_CACHE_TTL_MS,
      };
    } catch (error) {
      console.error("Failed to read the app user list", error);
      // Fail closed: with no list (and no stale cache) nobody but admins gets in.
      return usersCache?.emails.has(normalizeEmail(email)) ?? false;
    }
  }
  return usersCache.emails.has(normalizeEmail(email));
}

// Role for a verified signed-in user. `isAdmin` already folds in the tenant Global
// Administrator role, the ADMIN_UPNS list and the app-admin list.
export async function resolveAccessRole(user: {
  email?: string;
  isGlobalAdmin?: boolean;
}): Promise<AccessRole> {
  if (user.isGlobalAdmin) {
    return "admin";
  }
  if (!(await isAccessRestricted())) {
    return "user";
  }
  if (user.email && (await isListedUser(user.email))) {
    return "user";
  }
  return "none";
}
