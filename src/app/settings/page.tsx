"use client";

import Image from "next/image";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, LanguagesIcon, LogOutIcon, ShieldCheckIcon, UserCircle2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { isAuthEnabled } from "@/lib/auth-client";
import { appCopy, defaultLocale, localeLabels, type AppLocale } from "@/lib/i18n";

const localeStorageKey = "albasti-search-chat-locale";

const getStoredLocale = (): AppLocale => {
  if (typeof window === "undefined") {
    return defaultLocale;
  }

  const saved = window.localStorage.getItem(localeStorageKey);
  return saved === "en" || saved === "ar" ? saved : defaultLocale;
};

export default function SettingsPage() {
  const [locale, setLocale] = useState<AppLocale>(defaultLocale);

  useEffect(() => {
    setLocale(getStoredLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const copy = appCopy[locale];
  const isArabic = locale === "ar";
  const authEnabled = isAuthEnabled();
  const BackIcon = isArabic ? ArrowRightIcon : ArrowLeftIcon;
  const workspaceHref = `/?locale=${locale}`;

  return (
    <main
      dir={isArabic ? "rtl" : "ltr"}
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(38,53,139,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(205,170,72,0.18),_transparent_24%),linear-gradient(180deg,_#f6f4f0_0%,_#ece7de_100%)] px-4 py-5 text-slate-900 md:px-6"
    >
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[1.75rem] border border-white/70 bg-white/70 shadow-[0_30px_90px_-45px_rgba(23,35,52,0.45)] backdrop-blur">
          <header className="border-b border-slate-200/80 bg-[linear-gradient(135deg,_rgba(38,53,139,0.08),_rgba(205,170,72,0.14))] px-6 py-5">
            <div className={`flex flex-col gap-4 ${isArabic ? "text-right" : "text-left"} md:flex-row md:items-start md:justify-between`}>
              <div className={`flex items-start gap-4 ${isArabic ? "md:flex-row-reverse" : ""}`}>
                <Image
                  src="/albastilogo.png"
                  alt="Al Basti"
                  width={52}
                  height={52}
                  priority
                  className="h-12 w-12 object-contain"
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">
                    {copy.navSettings}
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                    {isArabic ? "إعدادات التطبيق" : "Application settings"}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">
                    {isArabic
                      ? "يمكنك هنا مراجعة هوية المستخدم الحالية، وتعديل تفضيلات اللغة الخاصة بالتطبيق، وإدارة جلسة تسجيل الدخول."
                      : "Review the current signed-in user, adjust application language preferences, and manage the current sign-in session here."}
                  </p>
                </div>
              </div>

              <Link
                href={workspaceHref}
                className="inline-flex items-center gap-2 self-start rounded-full border border-primary/15 bg-white px-4 py-2 text-sm font-medium text-primary transition hover:border-primary/30 hover:bg-primary/5"
              >
                <BackIcon className="size-4" />
                <span>{isArabic ? "العودة إلى مساحة العمل" : "Back to workspace"}</span>
              </Link>
            </div>
          </header>

          <div className="grid gap-5 px-6 py-6 md:grid-cols-[1.05fr_0.95fr]">
            <AccountCard locale={locale} />
            <PreferencesCard locale={locale} setLocale={setLocale} />
          </div>
        </div>
      </div>
    </main>
  );
}

function AccountCard({ locale }: { locale: AppLocale }) {
  const { instance, accounts } = useMsal();
  const copy = appCopy[locale];
  const account = instance.getActiveAccount() ?? accounts[0];
  const isArabic = locale === "ar";
  const authEnabled = isAuthEnabled();

  const initials = (account?.name ?? account?.username ?? "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

  const handleSignOut = async () => {
    await instance.logoutRedirect({
      account,
      postLogoutRedirectUri: `${window.location.origin}/`,
    });
  };

  return (
    <section className="rounded-[1.5rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_22px_70px_-50px_rgba(23,35,52,0.35)]">
      <div className={`flex items-center gap-3 ${isArabic ? "flex-row-reverse text-right" : "text-left"}`}>
        <div className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {initials}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">
            {copy.accountSection}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            {account?.name ?? copy.authSignedOut}
          </h2>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <InfoRow
          icon={UserCircle2Icon}
          label={isArabic ? "اسم المستخدم" : "Username"}
          value={account?.username ?? (isArabic ? "غير متوفر" : "Unavailable")}
          isArabic={isArabic}
        />
        <InfoRow
          icon={ShieldCheckIcon}
          label={isArabic ? "وضع الوصول" : "Access mode"}
          value={
            authEnabled
              ? copy.liveAccessReady
              : isArabic
                ? "إعدادات تسجيل الدخول لم تكتمل بعد."
                : "Sign-in configuration is not complete yet."
          }
          isArabic={isArabic}
        />
      </div>

      <div className={`mt-6 flex items-center gap-3 ${isArabic ? "flex-row-reverse justify-between" : "justify-between"}`}>
        <Link
          href={`/?locale=${locale}`}
          className="rounded-full border border-primary/15 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition hover:border-primary/30 hover:bg-primary/10"
        >
          {isArabic ? "العودة إلى المحادثة" : "Return to chat"}
        </Link>

        {account ? (
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <LogOutIcon className="size-4" />
            <span>{copy.signOut}</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PreferencesCard({
  locale,
  setLocale,
}: {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}) {
  const isArabic = locale === "ar";

  const handleLocaleChange = (value: AppLocale) => {
    setLocale(value);
    window.localStorage.setItem(localeStorageKey, value);
  };

  return (
    <section className="rounded-[1.5rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_22px_70px_-50px_rgba(23,35,52,0.35)]">
      <div className={`flex items-center gap-3 ${isArabic ? "flex-row-reverse text-right" : "text-left"}`}>
        <div className="rounded-2xl bg-primary p-2.5 text-primary-foreground">
          <LanguagesIcon className="size-4" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">
            {isArabic ? "التفضيلات" : "Preferences"}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            {isArabic ? "لغة التطبيق" : "Application language"}
          </h2>
        </div>
      </div>

      <p className={`mt-4 text-sm leading-6 text-slate-700 ${isArabic ? "text-right" : "text-left"}`}>
        {isArabic
          ? "حدّد اللغة الافتراضية التي يستخدمها التطبيق في الواجهة وفي تلميحات البداية. يمكنك كذلك تغيير اللغة من داخل مساحة العمل."
          : "Choose the default interface language for the application and its starter guidance. You can also switch it later from inside the workspace."}
      </p>

      <div className="mt-5 grid gap-3">
        {(["ar", "en"] as AppLocale[]).map((value) => {
          const active = locale === value;

          return (
            <button
              key={value}
              type="button"
              onClick={() => handleLocaleChange(value)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                active
                  ? "border-primary/30 bg-primary/6 text-primary"
                  : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-primary/20 hover:bg-white"
              } ${isArabic ? "flex-row-reverse text-right" : "text-left"}`}
            >
              <span className={`inline-flex size-8 items-center justify-center rounded-full ${active ? "bg-primary text-primary-foreground" : "bg-white text-slate-500"}`}>
                {active ? <CheckIcon className="size-4" /> : <LanguagesIcon className="size-4" />}
              </span>
              <span className="flex-1">{localeLabels[value]}</span>
            </button>
          );
        })}
      </div>

      <div className={`mt-6 rounded-2xl border border-primary/10 bg-[linear-gradient(180deg,rgba(205,170,72,0.12),rgba(255,255,255,0.85))] p-4 text-sm leading-6 text-slate-700 ${isArabic ? "text-right" : "text-left"}`}>
        {isArabic
          ? "سنضيف لاحقًا إعدادات إضافية مثل تفضيلات الذاكرة وسلوك الاستجابة لكل مستخدم بعد اكتمال النشر وإعداد قاعدة البيانات."
          : "Additional per-user settings such as chat memory and response behavior will be added after deployment and database setup are complete."}
      </div>
    </section>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  isArabic,
}: {
  icon: typeof UserCircle2Icon;
  label: string;
  value: string;
  isArabic: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 ${isArabic ? "flex-row-reverse text-right" : "text-left"}`}>
      <div className="rounded-2xl bg-white p-2 text-primary shadow-sm">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
          {label}
        </div>
        <div className="mt-1 text-sm leading-6 text-slate-700">
          {value}
        </div>
      </div>
    </div>
  );
}
