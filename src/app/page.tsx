import { cookies } from "next/headers";

import { LegalWorkspace } from "@/components/legal-workspace";
import { resolveDeploymentLocale } from "@/lib/branding-server";
import type { AppLocale } from "@/lib/i18n";

const localeCookieName = "albasti-search-chat-locale";

export default async function Home() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;
  const initialLocale: AppLocale =
    cookieLocale === "ar" || cookieLocale === "en"
      ? cookieLocale
      : await resolveDeploymentLocale();

  return <LegalWorkspace initialLocale={initialLocale} />;
}
