import { cookies } from "next/headers";

import { LegalWorkspace } from "@/components/legal-workspace";
import { getDefaultLocale, type AppLocale } from "@/lib/i18n";

const localeCookieName = "albasti-search-chat-locale";

export default async function Home() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;
  const initialLocale: AppLocale =
    cookieLocale === "ar" || cookieLocale === "en"
      ? cookieLocale
      : getDefaultLocale();

  return <LegalWorkspace initialLocale={initialLocale} />;
}
