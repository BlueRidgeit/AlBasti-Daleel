import { getSetting, setSetting } from "@/lib/app-settings";
import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";
import {
  LOGO_SLOTS,
  sanitizeBranding,
  type Branding,
  type LogoSlot,
} from "@/lib/branding";
import { getConfiguredLocale, getDefaultLocale, type AppLocale } from "@/lib/i18n";

const SETTINGS_KEY = "branding";

export const brandingEnabled = hasDatabaseConfig;

export const EMPTY_BRANDING: Branding = { colors: {}, logos: {} };

// Server only. Without the Postgres database this is always the empty (stock) branding.
export async function getBranding(): Promise<Branding> {
  if (!hasDatabaseConfig) {
    return EMPTY_BRANDING;
  }
  try {
    return sanitizeBranding(await getSetting<unknown>(SETTINGS_KEY));
  } catch {
    return EMPTY_BRANDING;
  }
}

export async function saveBranding(branding: Branding, updatedBy?: string) {
  return setSetting(SETTINGS_KEY, sanitizeBranding(branding), updatedBy);
}

export const isLogoSlot = (value: unknown): value is LogoSlot =>
  typeof value === "string" && (LOGO_SLOTS as readonly string[]).includes(value);

export async function getLogoAsset(slot: LogoSlot) {
  if (!hasDatabaseConfig) {
    return undefined;
  }
  const rows = await query<{ content_type: string; data: Buffer }>(
    "SELECT content_type, data FROM app_assets WHERE name = $1",
    [`logo:${slot}`],
  );
  return rows[0];
}

export async function putLogoAsset(
  slot: LogoSlot,
  contentType: string,
  data: Buffer,
  updatedBy?: string,
) {
  await query(
    `INSERT INTO app_assets (name, content_type, data, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (name) DO UPDATE
       SET content_type = EXCLUDED.content_type, data = EXCLUDED.data,
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [`logo:${slot}`, contentType, data, updatedBy ?? null],
  );
}

export async function deleteLogoAsset(slot: LogoSlot) {
  await query("DELETE FROM app_assets WHERE name = $1", [`logo:${slot}`]);
}

// First-visit language for the whole deployment: DALEEL_DEFAULT_LOCALE, then the admin's
// Settings choice, then the built-in default.
export async function resolveDeploymentLocale(): Promise<AppLocale> {
  const fromEnv = getConfiguredLocale();
  if (fromEnv) {
    return fromEnv;
  }
  const branding = await getBranding();
  return branding.defaultLocale ?? getDefaultLocale();
}
