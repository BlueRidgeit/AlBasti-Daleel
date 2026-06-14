import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import {
  deleteThreadById,
  getThreadById,
  renameThread,
  setThreadOrder,
  setThreadPinned,
  setThreadProject,
} from "@/lib/chat-history";

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

export async function PATCH(request: Request, { params }: Params) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => undefined)) as
    | {
        pinned?: boolean;
        title?: string;
        projectId?: string | null;
        pinnedOrder?: number;
      }
    | undefined;

  if (!body || typeof body !== "object") {
    return Response.json({ error: "A JSON body is required." }, { status: 400 });
  }

  try {
    const { threadId } = await params;
    const userId = user.objectId;
    let touched = false;
    let ok = true;

    if (typeof body.pinned === "boolean") {
      ok = (await setThreadPinned({ userId, threadId, pinned: body.pinned })) && ok;
      touched = true;
    }
    if (typeof body.title === "string") {
      ok = (await renameThread({ userId, threadId, title: body.title })) && ok;
      touched = true;
    }
    if (body.projectId !== undefined) {
      ok = (await setThreadProject({ userId, threadId, projectId: body.projectId })) && ok;
      touched = true;
    }
    if (typeof body.pinnedOrder === "number") {
      ok = (await setThreadOrder({ userId, threadId, pinnedOrder: body.pinnedOrder })) && ok;
      touched = true;
    }

    if (!touched) {
      return Response.json({ error: "No supported fields provided." }, { status: 400 });
    }
    if (!ok) {
      return Response.json({ error: "Thread not found." }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to update thread", error);
    return Response.json({ error: "Thread could not be updated." }, { status: 500 });
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
