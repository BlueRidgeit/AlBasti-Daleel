import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import { deleteProject, renameProject } from "@/lib/chat-history";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => undefined)) as
    | { name?: string }
    | undefined;
  const name = body?.name?.trim();

  if (!name) {
    return Response.json({ error: "name is required." }, { status: 400 });
  }

  try {
    const { id } = await params;
    const ok = await renameProject(user.objectId, id, name);
    if (!ok) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to rename project", error);
    return Response.json({ error: "Could not rename project." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const ok = await deleteProject(user.objectId, id);
    if (!ok) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete project", error);
    return Response.json({ error: "Could not delete project." }, { status: 500 });
  }
}
