import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Cairo, IBM_Plex_Mono } from "next/font/google";

import { AuthProvider } from "@/components/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { env } from "@/lib/env";
import { defaultLocale } from "@/lib/i18n";

import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Al-Basti Search Chat",
  description:
    "A legal assistant workspace for Azure AI Search, SharePoint documents, and Foundry-style orchestration.",
  icons: {
    icon: "/albastilogo.png",
    shortcut: "/albastilogo.png",
    apple: "/albastilogo.png",
  },
};

export const dynamic = "force-dynamic";

const localeCookieName = "albasti-search-chat-locale";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;
  const initialLocale =
    cookieLocale === "ar" || cookieLocale === "en"
      ? cookieLocale
      : defaultLocale;
  const runtimePublicEnv = {
    nextPublicAzureTenantId: env.nextPublicAzureTenantId,
    nextPublicAzureClientId: env.nextPublicAzureClientId,
    nextPublicAzureApiScope: env.nextPublicAzureApiScope,
    nextPublicAzureRedirectPath: env.nextPublicAzureRedirectPath,
  };

  return (
    <html
      lang={initialLocale}
      dir={initialLocale === "ar" ? "rtl" : "ltr"}
      className={`${cairo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ALBASTI_PUBLIC_ENV__ = ${JSON.stringify(
              runtimePublicEnv,
            ).replace(/</g, "\\u003c")};`,
          }}
        />
        <AuthProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
