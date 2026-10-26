import type { Container } from "@azure/cosmos";

import { query } from "@/lib/db";

// A tiny partitioned document store used by chat history. Two backends: Cosmos (original) and
// Postgres (opt-in). Callers only deal in `{ id, ... }` documents addressed by (partition key, id).

export type StoredDoc = { id: string } & Record<string, unknown>;

export interface DocStore {
  read<T extends StoredDoc>(id: string, pk: string): Promise<T | undefined>;
  upsert(doc: StoredDoc, pk: string): Promise<void>;
  // All documents in a partition, optionally limited to one `type` value.
  list<T extends StoredDoc>(pk: string, type?: string): Promise<T[]>;
  remove(id: string, pk: string): Promise<void>;
}

export const cosmosDocStore = (container: Container): DocStore => ({
  async read<T extends StoredDoc>(id: string, pk: string): Promise<T | undefined> {
    const result = await container
      .item(id, pk)
      .read<T>()
      .catch(() => undefined);
    return result?.resource;
  },
  async upsert(doc) {
    await container.items.upsert(doc);
  },
  async list<T extends StoredDoc>(pk: string, type?: string): Promise<T[]> {
    const result = await container.items
      .query<T>(
        type
          ? {
              query: "SELECT * FROM c WHERE c.userId = @pk AND c.type = @type",
              parameters: [
                { name: "@pk", value: pk },
                { name: "@type", value: type },
              ],
            }
          : {
              query: "SELECT * FROM c WHERE c.userId = @pk",
              parameters: [{ name: "@pk", value: pk }],
            },
        { partitionKey: pk },
      )
      .fetchAll();
    return result.resources;
  },
  async remove(id, pk) {
    await container.item(id, pk).delete();
  },
});

export const postgresDocStore = (collection: string): DocStore => ({
  async read<T extends StoredDoc>(id: string, pk: string): Promise<T | undefined> {
    const rows = await query<{ doc: T }>(
      "SELECT doc FROM daleel_docs WHERE collection = $1 AND pk = $2 AND id = $3",
      [collection, pk, id],
    );
    return rows[0]?.doc;
  },
  async upsert(doc, pk) {
    await query(
      `INSERT INTO daleel_docs (collection, pk, id, doc, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (collection, pk, id)
       DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
      [collection, pk, doc.id, JSON.stringify(doc)],
    );
  },
  async list<T extends StoredDoc>(pk: string, type?: string): Promise<T[]> {
    const rows = type
      ? await query<{ doc: T }>(
          "SELECT doc FROM daleel_docs WHERE collection = $1 AND pk = $2 AND doc->>'type' = $3",
          [collection, pk, type],
        )
      : await query<{ doc: T }>(
          "SELECT doc FROM daleel_docs WHERE collection = $1 AND pk = $2",
          [collection, pk],
        );
    return rows.map((row) => row.doc);
  },
  async remove(id, pk) {
    await query(
      "DELETE FROM daleel_docs WHERE collection = $1 AND pk = $2 AND id = $3",
      [collection, pk, id],
    );
  },
});
