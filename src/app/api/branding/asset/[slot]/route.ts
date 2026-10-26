import { getLogoAsset, isLogoSlot } from "@/lib/branding-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: uploaded logos are shown on the sign-in screen too.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slot: string }> },
) {
  const { slot } = await params;
  if (!isLogoSlot(slot)) {
    return new Response("Not found", { status: 404 });
  }

  const asset = await getLogoAsset(slot).catch(() => undefined);
  if (!asset) {
    return new Response("Not found", { status: 404 });
  }

  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.content_type,
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      // SVG can carry script: never let an uploaded image run anything if opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
