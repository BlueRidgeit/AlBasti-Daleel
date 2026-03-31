import { NextResponse } from "next/server";

import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    nextPublicAzureTenantId: env.nextPublicAzureTenantId,
    nextPublicAzureClientId: env.nextPublicAzureClientId,
    nextPublicAzureApiScope: env.nextPublicAzureApiScope,
    nextPublicAzureRedirectPath: env.nextPublicAzureRedirectPath,
  });
}
