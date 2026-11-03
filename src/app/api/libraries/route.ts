import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import { listLibraries } from "@/lib/library-list";
import { isPermissionTrimmingEnabled } from "@/lib/permission-trim";
import { enforceAccess } from "@/lib/route-guard";
import { getViewerFromRequest } from "@/lib/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const accessDenied = await enforceAccess(request);
  if (accessDenied) {
    return accessDenied;
  }

  // With SharePoint permission trimming on, the list (names and counts) is only for signed-in
  // users, and only includes libraries that user can open.
  if (isPermissionTrimmingEnabled()) {
    const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);
    if (!user?.objectId) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
  }

  try {
    const viewer = await getViewerFromRequest(request);
    return Response.json(await listLibraries(viewer));
  } catch (error) {
    console.error("Failed to list libraries", error);
    return Response.json({ libraries: [] });
  }
}
