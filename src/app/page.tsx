import { cookies } from "next/headers";

import { LegalWorkspace } from "@/components/legal-workspace";
import { defaultLocale, type AppLocale } from "@/lib/i18n";

const localeCookieName = "albasti-search-chat-locale";

export default async function Home() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;
  const initialLocale: AppLocale =
    cookieLocale === "ar" || cookieLocale === "en"
      ? cookieLocale
      : defaultLocale;

  return <LegalWorkspace initialLocale={initialLocale} />;
}
