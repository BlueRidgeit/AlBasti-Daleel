import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";

// Shared admin check for API routes: 401 when not signed in, 403 when not an administrator.
export async function requireAdmin(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return {
      user: undefined,
      denied: Response.json({ error: "Authentication required." }, { status: 401 }),
    };
  }
  if (!user.isGlobalAdmin) {
    return {
      user,
      denied: Response.json({ error: "Administrator role required." }, { status: 403 }),
    };
  }
  return { user, denied: null as Response | null };
}
