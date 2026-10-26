import { Pool } from "pg";

import { env, hasDatabaseConfig } from "@/lib/env";

// Opt-in Postgres connection (DALEEL_DATABASE_URL). Everything that uses it must first check
// hasDatabaseConfig; with the variable unset nothing here is ever touched.

let pool: Pool | null = null;
let schemaPromise: Promise<void> | null = null;

const buildPool = () => {
  const url = new URL(env.databaseUrl!);
  const sslMode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  url.searchParams.delete("schema");

  return new Pool({
    connectionString: url.toString(),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Azure Database for Postgres requires TLS. The connection is encrypted; the certificate
    // chain is not pinned (sslmode=disable turns TLS off for local development only).
    ssl: sslMode === "disable" ? false : { rejectUnauthorized: false },
  });
};

export const getPool = () => {
  if (!hasDatabaseConfig) {
    throw new Error("DALEEL_DATABASE_URL is not configured.");
  }
  if (!pool) {
    pool = buildPool();
    pool.on("error", (error) => console.error("Postgres pool error", error));
  }
  return pool;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS daleel_docs (
  collection text NOT NULL,
  pk         text NOT NULL,
  id         text NOT NULL,
  doc        jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, pk, id)
);
CREATE INDEX IF NOT EXISTS daleel_docs_pk_idx ON daleel_docs (collection, pk);

CREATE TABLE IF NOT EXISTS app_admins (
  email        text PRIMARY KEY,
  display_name text,
  added_by     text,
  added_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  email        text PRIMARY KEY,
  display_name text,
  role         text NOT NULL DEFAULT 'user',
  added_by     text,
  added_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_assets (
  name         text PRIMARY KEY,
  content_type text NOT NULL,
  data         bytea NOT NULL,
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
`;

// Creates the tables on first use. Idempotent; a failure is not cached so the next call retries.
export const ensureSchema = async () => {
  if (!schemaPromise) {
    schemaPromise = getPool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }
  return schemaPromise;
};

export const query = async <T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
) => {
  await ensureSchema();
  const result = await getPool().query<T>(text, values);
  return result.rows;
};
