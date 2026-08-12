import { env, hasAzureCosmosConfig } from "@/lib/env";
import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import {
  addAppAdmin,
  listAppAdmins,
  removeAppAdmin,
} from "@/lib/app-admins";

export const runtime = "nodejs";

// Any admin (tenant Global Admin, ADMIN_UPNS env, or an existing app-admin) may view and
// manage the UI-managed app-admin list.
async function adminGate(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request).catch(
    () => undefined,
  );

  if (!user?.objectId) {
    return {
      user: undefined,
      denied: Response.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  if (!user.isGlobalAdmin) {
    return {
      user,
      denied: Response.json(
        { error: "Administrator role required." },
        { status: 403 },
      ),
    };
  }

  return { user, denied: null as Response | null };
}

export async function GET(request: Request) {
  const { user, denied } = await adminGate(request);
  if (denied) {
    return denied;
  }

  if (!hasAzureCosmosConfig) {
    return Response.json(
      {
        error: "Admin storage (Cosmos) is not configured.",
        admins: [],
        envAdmins: env.adminUpns,
        me: user?.email ?? null,
      },
      { status: 500 },
    );
  }

  const admins = await listAppAdmins().catch(() => []);
  return Response.json({
    admins,
    // Break-glass admins configured via the ADMIN_UPNS env var — shown read-only for context.
    envAdmins: env.adminUpns,
    me: user?.email ?? null,
  });
}

export async function POST(request: Request) {
  const { user, denied } = await adminGate(request);
  if (denied) {
    return denied;
  }

  if (!hasAzureCosmosConfig) {
    return Response.json(
      { error: "Admin storage (Cosmos) is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => undefined)) as
    | { email?: string; displayName?: string }
    | undefined;
  const email = body?.email?.trim();

  if (!email) {
    return Response.json({ error: "email is required." }, { status: 400 });
  }

  const admin = await addAppAdmin({
    email,
    displayName: body?.displayName,
    addedBy: user?.email,
  });

  if (!admin) {
    return Response.json(
      { error: "That does not look like a valid user email / UPN." },
      { status: 400 },
    );
  }

  return Response.json({ ok: true, admin });
}

export async function DELETE(request: Request) {
  const { denied } = await adminGate(request);
  if (denied) {
    return denied;
  }

  if (!hasAzureCosmosConfig) {
    return Response.json(
      { error: "Admin storage (Cosmos) is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => undefined)) as
    | { email?: string }
    | undefined;
  const email = body?.email?.trim();

  if (!email) {
    return Response.json({ error: "email is required." }, { status: 400 });
  }

  const ok = await removeAppAdmin(email);
  if (!ok) {
    return Response.json(
      { error: "Could not remove that admin (not found)." },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
