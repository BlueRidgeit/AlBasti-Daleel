import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import { getThreadById, listThreadHistory } from "@/lib/chat-history";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId")?.trim();
    const locale = searchParams.get("locale") === "en" ? "en" : "ar";

    if (threadId) {
      const thread = await getThreadById({
        userId: user.objectId,
        threadId,
      });

      if (!thread) {
        return Response.json({ error: "Thread not found." }, { status: 404 });
      }

      return Response.json({ thread });
    }

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
