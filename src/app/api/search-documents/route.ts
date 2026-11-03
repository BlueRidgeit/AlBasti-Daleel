import { enforceAccess } from "@/lib/route-guard";
import { z } from "zod";

import { searchDocuments } from "@/lib/search-documents";
import { getViewerFromRequest } from "@/lib/viewer";

export const runtime = "nodejs";

const requestSchema = z.object({
  query: z.string().trim().min(1),
  top: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  const accessDenied = await enforceAccess(request);
  if (accessDenied) {
    return accessDenied;
  }

  const payload = requestSchema.parse(await request.json());
  const result = await searchDocuments(payload.query, {
    top: payload.top,
    viewer: await getViewerFromRequest(request),
  });

  return Response.json(result);
}
