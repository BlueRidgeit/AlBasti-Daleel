import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import { accessControlAvailable, isAccessRestricted } from "@/lib/access";

export const runtime = "nodejs";

// Lightweight identity endpoint so the client knows whether to show admin-only UI
// (e.g. the Library Management panel for Global Administrators) and whether this account
// has been granted access when "only listed users" access control is on.
export async function GET(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request, {
    includeBlocked: true,
  }).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ authenticated: false, isGlobalAdmin: false });
  }

  return Response.json({
    authenticated: true,
    isGlobalAdmin: Boolean(user.isGlobalAdmin),
    displayName: user.displayName,
    email: user.email,
    // Additive fields: allowed=false means access control is on and this user is not listed.
    allowed: user.accessRole !== "none",
    accessControl: accessControlAvailable
      ? { restricted: await isAccessRestricted().catch(() => false) }
      : undefined,
  });
}
