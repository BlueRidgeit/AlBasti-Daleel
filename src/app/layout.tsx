import type { Metadata } from "next";
import { Cairo, IBM_Plex_Mono } from "next/font/google";

import { AuthProvider } from "@/components/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { env } from "@/lib/env";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtimePublicEnv = {
    nextPublicAzureTenantId: env.nextPublicAzureTenantId,
    nextPublicAzureClientId: env.nextPublicAzureClientId,
    nextPublicAzureApiScope: env.nextPublicAzureApiScope,
    nextPublicAzureRedirectPath: env.nextPublicAzureRedirectPath,
  };

  return (
    <html
      lang="ar"
      dir="rtl"
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
