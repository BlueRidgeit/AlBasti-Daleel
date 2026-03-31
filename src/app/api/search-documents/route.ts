import { z } from "zod";

import { searchDocuments } from "@/lib/search-documents";

export const runtime = "nodejs";

const requestSchema = z.object({
  query: z.string().trim().min(1),
  top: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  const payload = requestSchema.parse(await request.json());
  const result = await searchDocuments(payload.query, { top: payload.top });

  return Response.json(result);
}
