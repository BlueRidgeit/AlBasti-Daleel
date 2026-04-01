import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import { listThreadHistory } from "@/lib/chat-history";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const locale = searchParams.get("locale") === "en" ? "en" : "ar";
    const groups = await listThreadHistory({
      userId: user.objectId,
      locale,
    });

    return Response.json({ groups });
  } catch (error) {
    console.error("Failed to load thread history", error);
    return Response.json({ groups: [], error: "History unavailable." });
  }
}
