import { requireAdmin } from "@/lib/admin-gate";
import { sendInvitation } from "@/lib/invite-email";
import { hasMailConfig } from "@/lib/env";

export const runtime = "nodejs";

// Re-send the invitation e-mail to someone already on the user or administrator list.
export async function POST(request: Request) {
  const { user, denied } = await requireAdmin(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => undefined)) as
    | { email?: string; displayName?: string; role?: "user" | "admin" }
    | undefined;
  const email = body?.email?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "A valid email is required." }, { status: 400 });
  }

  const invite = await sendInvitation({
    request,
    to: email,
    displayName: body?.displayName,
    role: body?.role === "admin" ? "admin" : "user",
    invitedBy: user?.displayName ?? user?.email,
  });
  return Response.json({ ok: invite.status === "sent", invite, mailConfigured: hasMailConfig });
}
