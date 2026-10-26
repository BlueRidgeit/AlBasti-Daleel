import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import { isAccessRestricted } from "@/lib/access";

// For API routes that never required sign-in. When access control is on they must see a valid,
// permitted user; when it is off (the default) this returns null and nothing changes.
export async function enforceAccess(request: Request): Promise<Response | null> {
  if (!(await isAccessRestricted().catch(() => false))) {
    return null;
  }

  const user = await getAuthenticatedUserFromRequest(request, {
    includeBlocked: true,
  }).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.accessRole === "none") {
    return Response.json(
      { error: "Your account has not been granted access to this app." },
      { status: 403 },
    );
  }
  return null;
}
