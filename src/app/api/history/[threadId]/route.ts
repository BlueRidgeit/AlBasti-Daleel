import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import { deleteThreadById, getThreadById } from "@/lib/chat-history";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function GET(request: Request, { params }: Params) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const { threadId } = await params;
    const thread = await getThreadById({
      userId: user.objectId,
      threadId,
    });

    if (!thread) {
      return Response.json({ error: "Thread not found." }, { status: 404 });
    }

    return Response.json({ thread });
  } catch (error) {
    console.error("Failed to load thread by id", error);
    return Response.json({ error: "Thread unavailable." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const { threadId } = await params;
    const deleted = await deleteThreadById({
      userId: user.objectId,
      threadId,
    });

    if (!deleted) {
      return Response.json({ error: "Thread not found." }, { status: 404 });
    }

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete thread by id", error);
    return Response.json({ error: "Thread could not be deleted." }, { status: 500 });
  }
}
