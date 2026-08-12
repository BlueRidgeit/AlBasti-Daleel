import { env } from "@/lib/env";
import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";

export const runtime = "nodejs";

// Admin-gated proxy to the indexer's read-only /api/status health endpoint. Keeps the indexer
// function key server-side and never exposes the indexer URL to the browser.
async function adminGate(request: Request): Promise<Response | null> {
  const user = await getAuthenticatedUserFromRequest(request).catch(
    () => undefined,
  );

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!user.isGlobalAdmin) {
    return Response.json(
      { error: "Administrator role required." },
      { status: 403 },
    );
  }

  return null;
}

export async function GET(request: Request) {
  const denied = await adminGate(request);
  if (denied) {
    return denied;
  }

  const url = `${env.indexerBaseUrl.replace(/\/$/, "")}/api/status`;

  try {
    const response = await fetch(url, {
      headers: env.indexerFunctionKey
        ? { "x-functions-key": env.indexerFunctionKey }
        : {},
      cache: "no-store",
    });

    const text = await response.text();
    if (!response.ok) {
      return Response.json(
        { error: `Indexer status failed (${response.status}).` },
        { status: 502 },
      );
    }

    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      return Response.json(
        { error: "Indexer returned a non-JSON status response." },
        { status: 502 },
      );
    }

    return Response.json(payload);
  } catch {
    return Response.json(
      { error: "Could not reach the indexer. Is it running or deployed?" },
      { status: 502 },
    );
  }
}
