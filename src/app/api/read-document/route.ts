import { enforceAccess } from "@/lib/route-guard";
import { z } from "zod";

import { readDocument } from "@/lib/read-document";
import {
  acquireGraphTokenOnBehalfOf,
  getRequestBearerToken,
} from "@/lib/auth-server";

export const runtime = "nodejs";

const requestSchema = z.object({
  itemId: z.string().trim().min(1),
  question: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const accessDenied = await enforceAccess(request);
  if (accessDenied) {
    return accessDenied;
  }

  const payload = requestSchema.parse(await request.json());
  const apiAccessToken = getRequestBearerToken(request);
  let graphAccessToken: string | undefined;
  let graphAccessError: string | undefined;

  if (apiAccessToken) {
    graphAccessToken = await acquireGraphTokenOnBehalfOf(apiAccessToken).catch(
      (error) => {
        console.error("Graph OBO acquisition failed", error);
        graphAccessError =
          error instanceof Error
            ? error.message
            : "Unknown OBO token acquisition error.";
        return undefined;
      },
    );
  }
  const result = await readDocument(
    request,
    payload.itemId,
    payload.question,
    graphAccessToken,
    graphAccessError,
  );

  return Response.json(result);
}
