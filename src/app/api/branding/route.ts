import { brandingEnabled, getBranding } from "@/lib/branding-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: the look & feel is needed before sign-in (login screen). Contains no secrets.
export async function GET() {
  return Response.json({ enabled: brandingEnabled, branding: await getBranding() });
}
