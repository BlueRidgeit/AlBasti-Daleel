import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import { createProject, listProjects } from "@/lib/chat-history";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request).catch(() => undefined);

  if (!user?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const projects = await listProjects(user.objectId);
    return Response.json({ projects });
  } catch (error) {
    console.error("Failed to list projects", error);
    return Response.json({ error: "Projects unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    const project = await createProject(user.objectId, name);
    if (!project) {
      return Response.json({ error: "Could not create project." }, { status: 500 });
    }
    return Response.json({ project });
  } catch (error) {
    console.error("Failed to create project", error);
    return Response.json({ error: "Could not create project." }, { status: 500 });
  }
}
