import { getAuthenticatedUserFromRequest } from "@/lib/auth-server";
import { sendInvitation } from "@/lib/invite-email";
import {
  accessControlAvailable,
  addAppUser,
  isAccessRestricted,
  listAppUsers,
  removeAppUser,
  setAccessRestricted,
} from "@/lib/access";

export const runtime = "nodejs";

// Admins (tenant Global Admin, ADMIN_UPNS or an app-admin) manage who may use Daleel.
async function adminGate(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request).catch(
    () => undefined,
  );

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

const notConfigured = () =>
  Response.json(
    { error: "User access control needs the Postgres database (DALEEL_DATABASE_URL)." },
    { status: 500 },
  );

export async function GET(request: Request) {
  const { denied } = await adminGate(request);
  if (denied) {
    return denied;
  }

  if (!accessControlAvailable) {
    return Response.json({ available: false, users: [], restricted: false });
  }

  const [users, restricted] = await Promise.all([
    listAppUsers().catch(() => []),
    isAccessRestricted().catch(() => false),
  ]);
  return Response.json({ available: true, users, restricted });
}

export async function POST(request: Request) {
  const { user, denied } = await adminGate(request);
  if (denied) {
    return denied;
  }
  if (!accessControlAvailable) {
    return notConfigured();
  }

  const body = (await request.json().catch(() => undefined)) as
    | { email?: string; displayName?: string; sendInvite?: boolean }
    | undefined;
  const email = body?.email?.trim();
  if (!email) {
    return Response.json({ error: "email is required." }, { status: 400 });
  }

  const added = await addAppUser({
    email,
    displayName: body?.displayName,
    addedBy: user?.email,
  });
  if (!added) {
    return Response.json(
      { error: "That does not look like a valid user email / UPN." },
      { status: 400 },
    );
  }
  const invite =
    body?.sendInvite === false
      ? { status: "skipped" as const }
      : await sendInvitation({
          request,
          to: added.email,
          displayName: added.displayName,
          role: "user",
          invitedBy: user?.displayName ?? user?.email,
        });
  return Response.json({ ok: true, user: added, invite });
}

// Turn "only listed users" access control on or off.
export async function PUT(request: Request) {
  const { user, denied } = await adminGate(request);
  if (denied) {
    return denied;
  }
  if (!accessControlAvailable) {
    return notConfigured();
  }

  const body = (await request.json().catch(() => undefined)) as
    | { restricted?: boolean }
    | undefined;
  if (typeof body?.restricted !== "boolean") {
    return Response.json({ error: "restricted (boolean) is required." }, { status: 400 });
  }

  await setAccessRestricted(body.restricted, user?.email);
  return Response.json({ ok: true, restricted: body.restricted });
}

export async function DELETE(request: Request) {
  const { denied } = await adminGate(request);
  if (denied) {
    return denied;
  }
  if (!accessControlAvailable) {
    return notConfigured();
  }

  const body = (await request.json().catch(() => undefined)) as
    | { email?: string }
    | undefined;
  const email = body?.email?.trim();
  if (!email) {
    return Response.json({ error: "email is required." }, { status: 400 });
  }

  const ok = await removeAppUser(email);
  if (!ok) {
    return Response.json({ error: "Could not remove that user (not found)." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
