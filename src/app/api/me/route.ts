import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";

export const runtime = "nodejs";

// Lightweight identity endpoint so the client knows whether to show admin-only UI
// (e.g. the Library Management panel for Global Administrators).
export async function GET(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ authenticated: false, isGlobalAdmin: false });
  }

  return Response.json({
    authenticated: true,
    isGlobalAdmin: Boolean(user.isGlobalAdmin),
    displayName: user.displayName,
    email: user.email,
  });
}
