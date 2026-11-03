import {
  acquireGraphTokenOnBehalfOf,
  getAuthenticatedUserFromRequest,
  getRequestBearerToken,
} from "@/lib/auth-server";
import { isPermissionTrimmingEnabled, type Viewer } from "@/lib/permission-trim";

// For routes that do not already exchange the user's token: resolve who is asking and get a Graph
// token for them. Returns an empty viewer when permission trimming is off (nothing to do) or no
// token can be had; the trimming code then fails closed.
export async function getViewerFromRequest(request: Request): Promise<Viewer> {
  if (!isPermissionTrimmingEnabled()) {
    return {};
  }

  const bearer = getRequestBearerToken(request);
  if (!bearer) {
    return {};
  }

  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);
  const graphAccessToken = await acquireGraphTokenOnBehalfOf(bearer).catch((error) => {
    console.error("Graph OBO acquisition failed", error);
    return undefined;
  });

  return { graphAccessToken, userId: user?.objectId };
}
