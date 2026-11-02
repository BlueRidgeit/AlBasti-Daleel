import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

// "Always confirm first": the preview call returns a signed token that binds the exact plan, the
// user and the number of chat messages at that moment. The create call only accepts it when the
// conversation has moved on (a NEW user message exists), so the model cannot preview and create
// within one turn, and it cannot change the content after the user has seen the plan.

const TTL_MS = 30 * 60 * 1000;

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const key = () => `${env.azureEntraClientSecret ?? ""}:daleel-create-confirm`;

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

const planHash = (plan: unknown) => createHash("sha256").update(stable(plan)).digest("hex");

export function signPlan(plan: unknown, ctx: { userId: string; messageCount: number }) {
  const payload = Buffer.from(
    JSON.stringify({
      u: ctx.userId,
      m: ctx.messageCount,
      h: planHash(plan),
      e: Date.now() + TTL_MS,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyPlan(
  token: string | undefined,
  plan: unknown,
  ctx: { userId: string; messageCount: number },
): VerifyResult {
  if (!token) return { ok: false, reason: "No confirmation token. Preview first and ask the user to confirm." };

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return { ok: false, reason: "The confirmation token is malformed." };

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "The confirmation token is not valid." };
  }

  let data: { u: string; m: number; h: string; e: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "The confirmation token is malformed." };
  }

  if (data.u !== ctx.userId) return { ok: false, reason: "This confirmation belongs to a different user." };
  if (Date.now() > data.e) return { ok: false, reason: "The confirmation expired. Preview again and ask the user to confirm." };
  if (data.h !== planHash(plan)) {
    return { ok: false, reason: "The content changed after the preview. Preview again and ask the user to confirm." };
  }
  if (ctx.messageCount <= data.m) {
    return { ok: false, reason: "The user has not confirmed yet: wait for their reply to the preview before creating anything." };
  }
  return { ok: true };
}
