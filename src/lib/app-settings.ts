import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";

// Key/value settings (JSON) stored in the opt-in Postgres database. With no database the
// getters return undefined and the setters report failure, so every caller falls back to the
// built-in defaults.

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; expires: number }>();

export const settingsEnabled = hasDatabaseConfig;

export async function getSetting<T>(key: string): Promise<T | undefined> {
  if (!hasDatabaseConfig) {
    return undefined;
  }

  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.value as T | undefined;
  }

  try {
    const rows = await query<{ value: T }>(
      "SELECT value FROM app_settings WHERE key = $1",
      [key],
    );
    const value = rows[0]?.value;
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    console.error(`Failed to read setting '${key}'`, error);
    // Serve a stale value if we have one; otherwise fall back to defaults.
    return hit?.value as T | undefined;
  }
}

export async function setSetting(
  key: string,
  value: unknown,
  updatedBy?: string,
): Promise<boolean> {
  if (!hasDatabaseConfig) {
    return false;
  }

  await query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), updatedBy ?? null],
  );
  cache.delete(key);
  return true;
}
