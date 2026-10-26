import { requireAdmin } from "@/lib/admin-gate";
import {
  brandingEnabled,
  deleteLogoAsset,
  getBranding,
  isLogoSlot,
  putLogoAsset,
  saveBranding,
} from "@/lib/branding-server";

export const runtime = "nodejs";

const MAX_BYTES = 1_000_000;

const notConfigured = () =>
  Response.json(
    { error: "Appearance settings need the Postgres database (DALEEL_DATABASE_URL)." },
    { status: 500 },
  );

// Identify the image from its bytes, not the client-supplied type.
function detectImageType(bytes: Buffer): string | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  const head = bytes.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
    return "image/svg+xml";
  }
  return undefined;
}

// multipart/form-data: slot=nav|settings|favicon, file=<image up to 1 MB>
export async function POST(request: Request) {
  const { user, denied } = await requireAdmin(request);
  if (denied) return denied;
  if (!brandingEnabled) return notConfigured();

  const form = await request.formData().catch(() => undefined);
  const slot = form?.get("slot");
  const file = form?.get("file");

  if (!isLogoSlot(slot)) {
    return Response.json({ error: "slot must be nav, settings or favicon." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose an image file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "The image must be 1 MB or smaller." }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = detectImageType(bytes);
  if (!contentType) {
    return Response.json({ error: "Use a PNG, JPEG, WebP or SVG image." }, { status: 415 });
  }

  await putLogoAsset(slot, contentType, bytes, user?.email);
  const branding = await getBranding();
  const next = { ...branding, logos: { ...branding.logos, [slot]: Date.now() } };
  await saveBranding(next, user?.email);
  return Response.json({ ok: true, branding: next });
}

// ?slot=nav|settings|favicon — go back to the built-in logo.
export async function DELETE(request: Request) {
  const { user, denied } = await requireAdmin(request);
  if (denied) return denied;
  if (!brandingEnabled) return notConfigured();

  const slot = new URL(request.url).searchParams.get("slot");
  if (!isLogoSlot(slot)) {
    return Response.json({ error: "slot must be nav, settings or favicon." }, { status: 400 });
  }

  await deleteLogoAsset(slot);
  const branding = await getBranding();
  const logos = { ...branding.logos };
  delete logos[slot];
  const next = { ...branding, logos };
  await saveBranding(next, user?.email);
  return Response.json({ ok: true, branding: next });
}
