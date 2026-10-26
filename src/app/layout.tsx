import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Cairo, IBM_Plex_Mono, Inter, Tajawal } from "next/font/google";

import { AuthProvider } from "@/components/auth-provider";
import { BrandingProvider } from "@/components/branding-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { env } from "@/lib/env";
import { buildThemeCss, logoUrl } from "@/lib/branding";
import { getBranding, resolveDeploymentLocale } from "@/lib/branding-server";
import { getConfiguredLocale, getPromptProfile, isGeneralProfile } from "@/lib/i18n";

import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

// Optional fonts offered in Settings > Appearance. Only downloaded by the browser when selected.
const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export async function generateMetadata(): Promise<Metadata> {
  const general = isGeneralProfile();
  const branding = await getBranding();
  const icon = branding.logos.favicon
    ? logoUrl("favicon", branding.logos.favicon)
    : "/daleel-logo.png";
  const name = branding.appName ?? "Daleel";
  return {
    title: general
      ? `${name} | Your AI Guide to Company Documents`
      : `${name} | Your AI Guide to Legal Intelligence`,
    description: general
      ? `${name} — your AI guide to company documents.`
      : `${name} — your AI guide to legal intelligence.`,
    icons: {
      icon,
      shortcut: icon,
      apple: icon,
    },
  };
}

export const dynamic = "force-dynamic";

const localeCookieName = "albasti-search-chat-locale";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;
  const branding = await getBranding();
  const deploymentLocale = await resolveDeploymentLocale();
  const initialLocale =
    cookieLocale === "ar" || cookieLocale === "en"
      ? cookieLocale
      : deploymentLocale;
  const themeCss = buildThemeCss(branding);
  const publicBranding = {
    appName: branding.appName,
    logos: {
      nav: branding.logos.nav ? logoUrl("nav", branding.logos.nav) : undefined,
      settings: branding.logos.settings
        ? logoUrl("settings", branding.logos.settings)
        : undefined,
    },
  };
  const runtimePublicEnv = {
    nextPublicAzureTenantId: env.nextPublicAzureTenantId,
    nextPublicAzureClientId: env.nextPublicAzureClientId,
    nextPublicAzureApiScope: env.nextPublicAzureApiScope,
    nextPublicAzureRedirectPath: env.nextPublicAzureRedirectPath,
    defaultLocale: getConfiguredLocale() ?? branding.defaultLocale,
    promptProfile: getPromptProfile(),

  };

  return (
    <html
      lang={initialLocale}
      dir={initialLocale === "ar" ? "rtl" : "ltr"}
      className={`${cairo.variable} ${tajawal.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        {themeCss ? (
          <style id="branding-theme" dangerouslySetInnerHTML={{ __html: themeCss }} />
        ) : null}
      </head>
      <body className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ALBASTI_PUBLIC_ENV__ = ${JSON.stringify(
              runtimePublicEnv,
            ).replace(/</g, "\\u003c")};`,
          }}
        />
        <BrandingProvider value={publicBranding}>
          <AuthProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </AuthProvider>
        </BrandingProvider>
      </body>
    </html>
  );
}
