import { requireAdmin } from "@/lib/admin-gate";
import { sanitizeBranding } from "@/lib/branding";
import { brandingEnabled, getBranding, saveBranding } from "@/lib/branding-server";

export const runtime = "nodejs";

const notConfigured = () =>
  Response.json(
    { error: "Appearance settings need the Postgres database (DALEEL_DATABASE_URL)." },
    { status: 500 },
  );

export async function GET(request: Request) {
  const { denied } = await requireAdmin(request);
  if (denied) return denied;
  return Response.json({ enabled: brandingEnabled, branding: await getBranding() });
}

// Saves colours / font / name / default language. Logos are managed by the /logo route; their
// versions are always taken from what is already stored, never from the request.
export async function PUT(request: Request) {
  const { user, denied } = await requireAdmin(request);
  if (denied) return denied;
  if (!brandingEnabled) return notConfigured();

  const body = await request.json().catch(() => undefined);
  const incoming = sanitizeBranding(body);
  const current = await getBranding();
  const next = { ...incoming, logos: current.logos };

  await saveBranding(next, user?.email);
  return Response.json({ ok: true, branding: next });
}
