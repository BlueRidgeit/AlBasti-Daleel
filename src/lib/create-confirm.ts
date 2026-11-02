import { randomUUID } from "node:crypto";

import { postgresDocStore, type DocStore } from "@/lib/doc-store";
import { hasDatabaseConfig } from "@/lib/env";

// "Always confirm first". A preview stores the exact plan on the SERVER (one pending plan per user
// and chat). The model then only calls confirm_creation (no arguments), so it never has to
// repeat the document content. The server accepts the confirmation only when:
//   * a pending plan exists for this user and this chat, and it has not expired or been used;
//   * the conversation has moved on since the preview (a NEW user message exists), so the model
//     cannot preview and create within one turn;
//   * a new preview replaces the previous plan, so the user always confirms what was last shown.

const TTL_MS = 30 * 60 * 1000;

export type PendingPlan<T = unknown> = {
  planId: string;
  action: string;
  params: T;
  summary: string;
  messageCount: number;
};

type Stored = PendingPlan & { id: string; expires: number };

// Shared across replicas when the Postgres store is configured; otherwise per process.
const memory = new Map<string, Stored>();
const store: DocStore | undefined = hasDatabaseConfig ? postgresDocStore("pending-plans") : undefined;

const memKey = (userId: string, threadId: string) => `${userId}:${threadId}`;

export async function savePending<T>(
  ctx: { userId: string; threadId: string },
  plan: Omit<PendingPlan<T>, "planId">,
): Promise<string> {
  const planId = randomUUID().slice(0, 8);
  const record: Stored = { ...plan, planId, id: ctx.threadId, expires: Date.now() + TTL_MS };
  if (store) await store.upsert(record as never, ctx.userId);
  else memory.set(memKey(ctx.userId, ctx.threadId), record);
  return planId;
}

async function readPending(userId: string, threadId: string): Promise<Stored | undefined> {
  if (store) return store.read<Stored & Record<string, unknown>>(threadId, userId);
  return memory.get(memKey(userId, threadId));
}

export async function clearPending(userId: string, threadId: string) {
  if (store) await store.remove(threadId, userId).catch(() => undefined);
  else memory.delete(memKey(userId, threadId));
}

export type TakeResult<T> = { ok: true; plan: PendingPlan<T> } | { ok: false; reason: string };

// Checks (does not consume) the pending plan; call clearPending once it has been carried out.
export async function checkPending<T>(
  ctx: { userId: string; threadId: string; messageCount: number },
  planId?: string,
): Promise<TakeResult<T>> {
  const pending = await readPending(ctx.userId, ctx.threadId);
  if (!pending) {
    return { ok: false, reason: "There is no pending plan. Prepare one first (create_document or create_folder), show it to the user and wait for their confirmation." };
  }
  if (Date.now() > pending.expires) {
    await clearPending(ctx.userId, ctx.threadId);
    return { ok: false, reason: "The plan expired. Prepare it again and ask the user to confirm." };
  }
  if (planId && planId !== pending.planId) {
    return { ok: false, reason: "That is not the latest plan. Only the most recent plan can be confirmed; prepare it again if needed." };
  }
  if (ctx.messageCount <= pending.messageCount) {
    return { ok: false, reason: "The user has not confirmed yet: wait for their reply to the plan before creating anything." };
  }
  return { ok: true, plan: pending as unknown as PendingPlan<T> };
}
