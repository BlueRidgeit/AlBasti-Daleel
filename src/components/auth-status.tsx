"use client";

import {
  CheckIcon,
  ChevronUpIcon,
  LogOutIcon,
  Settings2Icon,
} from "lucide-react";
import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { getLoginRequest, isAuthEnabled } from "@/lib/auth-client";
import { appCopy, localeLabels, type AppLocale } from "@/lib/i18n";

const localeStorageKey = "albasti-search-chat-locale";

export function AuthStatus({ locale }: { locale: AppLocale }) {
  const copy = appCopy[locale];
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
        {copy.authSignedOut}
      </div>
    );
  }

  if (!isAuthEnabled()) {
    return (
      <div className="rounded-full border border-primary/15 bg-primary/6 px-3 py-1.5 text-xs text-primary">
        {copy.authSetupPending}
      </div>
    );
  }

  return <AuthenticatedStatus locale={locale} />;
}

export function AuthRequired({
  locale,
  setLocale,
  children,
}: {
  locale: AppLocale;
  setLocale?: (locale: AppLocale) => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <AuthLockedState locale={locale} loading />;
  }

  if (!isAuthEnabled()) {
    return (
      <AuthLockedState locale={locale} setupPending setLocale={setLocale} />
    );
  }

  return (
    <AuthenticatedGate locale={locale} setLocale={setLocale}>
      {children}
    </AuthenticatedGate>
  );
}

function AuthenticatedGate({
  locale,
  setLocale,
  children,
}: {
  locale: AppLocale;
  setLocale?: (locale: AppLocale) => void;
  children: React.ReactNode;
}) {
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];

  if (!account) {
    return <AuthLockedState locale={locale} setLocale={setLocale} />;
  }

  return <>{children}</>;
}

function AuthLockedState({
  locale,
  setLocale,
  setupPending = false,
  loading = false,
}: {
  locale: AppLocale;
  setLocale?: (locale: AppLocale) => void;
  setupPending?: boolean;
  loading?: boolean;
}) {
  const copy = appCopy[locale];

  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6 md:p-10">
      <div className="max-w-2xl rounded-[2rem] border border-white/75 bg-white/92 px-6 py-8 text-center shadow-[0_28px_90px_-42px_rgba(23,35,52,0.4)] backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">
          {copy.badge}
        </p>
        <h3 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          {setupPending ? copy.authSetupPending : copy.lockedTitle}
        </h3>
        <p className="mt-4 text-base leading-7 text-slate-700">
          {loading
            ? copy.liveAccessRequiresSignIn
            : setupPending
              ? copy.liveAccessRequiresSignIn
              : copy.lockedDescription}
        </p>
        {!setupPending && !loading ? (
          <SignInButton locale={locale} large className="mt-6" />
        ) : null}
        {setLocale && !loading ? (
          <LoginLanguageToggle locale={locale} setLocale={setLocale} />
        ) : null}
      </div>
    </div>
  );
}

// Language selector shown on the sign-in screen so a user can pick English or Arabic
// BEFORE logging in (the choice persists through the redirect via SignInButton).
function LoginLanguageToggle({
  locale,
  setLocale,
}: {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}) {
  const isArabic = locale === "ar";

  return (
    <div className="mt-7 flex flex-col items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {isArabic ? "اللغة" : "Language"}
      </span>
      <div
        className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm"
        dir="ltr"
      >
        {(["ar", "en"] as AppLocale[]).map((value) => {
          const active = locale === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setLocale(value)}
              aria-pressed={active}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {localeLabels[value]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AuthenticatedStatus({ locale }: { locale: AppLocale }) {
  const { instance, accounts } = useMsal();
  const copy = appCopy[locale];
  const account = instance.getActiveAccount() ?? accounts[0];
  const router = useRouter();
  const isArabic = locale === "ar";
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = useMemo(() => {
    const source = (account?.name ?? account?.username ?? "").trim();
    if (!source) {
      return "U";
    }

    const parts = source.split(/\s+/).filter(Boolean);
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [account?.name, account?.username]);

  const handleSignOut = async () => {
    window.localStorage.setItem(localeStorageKey, locale);
    document.cookie = `${localeStorageKey}=${locale}; path=/; max-age=31536000; samesite=lax`;
    await instance.logoutRedirect({
      account,
      postLogoutRedirectUri: `${window.location.origin}/`,
    });
  };

  const handleOpenSettings = () => router.push(`/settings?locale=${locale}`);

  return account ? (
    <div className={`space-y-3 ${isArabic ? "text-right" : "text-left"}`}>
      <div className="text-xs text-sidebar-foreground/72">
        <div className="font-semibold text-sidebar-foreground">{copy.authSignedIn}</div>
        <div className="mt-1 text-sm text-sidebar-foreground/94">
          {account.name ?? account.username}
        </div>
        <div className="mt-1 text-[11px] leading-5 text-sidebar-foreground/72">
          {copy.liveAccessReady}
        </div>
      </div>

      <div
        className={`flex items-center gap-2 ${
          isArabic ? "flex-row-reverse justify-between" : "justify-between"
        }`}
      >
        <button
          type="button"
          title="Settings"
          aria-label="Settings"
          onClick={handleOpenSettings}
          className="inline-flex size-10 items-center justify-center rounded-full border border-white/18 bg-white/10 text-sidebar-foreground transition hover:border-white/28 hover:bg-white/14"
        >
          <Settings2Icon className="size-4" />
        </button>

        <div className={`flex items-center gap-2 ${isArabic ? "flex-row-reverse" : ""}`}>
          {menuOpen ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full border border-white/18 bg-white/10 px-3 py-1.5 text-xs font-medium text-sidebar-foreground transition hover:border-white/28 hover:bg-white/14"
            >
              {copy.signOut}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/92"
            aria-expanded={menuOpen}
            aria-label={account.name ?? account.username ?? copy.authSignedIn}
          >
            {initials}
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div
      className={`flex items-center gap-2 ${
        isArabic ? "flex-row-reverse justify-between" : "justify-between"
      }`}
    >
      <div
        className={`hidden max-w-56 text-[11px] leading-5 text-sidebar-foreground/72 sm:block ${
          isArabic ? "text-right" : "text-left"
        }`}
      >
        {copy.liveAccessRequiresSignIn}
      </div>
      <SignInButton locale={locale} />
    </div>
  );
}

// Bottom-of-sidebar account control: avatar + name with an upward dropdown
// (Settings, Language, Sign out) — mirrors the Claude desktop account menu.
export function AccountBar({
  locale,
  setLocale,
}: {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}) {
  const copy = appCopy[locale];
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (!isAuthEnabled()) {
    return (
      <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5 text-xs text-sidebar-foreground/70">
        {copy.authSetupPending}
      </div>
    );
  }

  return <AccountBarInner locale={locale} setLocale={setLocale} />;
}

function AccountBarInner({
  locale,
  setLocale,
}: {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}) {
  const { instance, accounts } = useMsal();
  const copy = appCopy[locale];
  const isArabic = locale === "ar";
  const router = useRouter();
  const account = instance.getActiveAccount() ?? accounts[0];
  const [open, setOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);

  const initials = useMemo(() => {
    const source = (account?.name ?? account?.username ?? "").trim();
    if (!source) return "U";
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [account?.name, account?.username]);

  // Load the signed-in user's Entra ID profile photo (Graph User.Read).
  // Falls back to initials if there's no photo or User.Read isn't consented.
  useEffect(() => {
    if (!account) return;
    let active = true;
    let createdUrl: string | undefined;
    (async () => {
      try {
        const result = await instance.acquireTokenSilent({
          scopes: ["User.Read"],
          account,
        });
        const response = await fetch(
          "https://graph.microsoft.com/v1.0/me/photo/$value",
          { headers: { Authorization: `Bearer ${result.accessToken}` } },
        );
        if (!response.ok) return;
        const blob = await response.blob();
        createdUrl = URL.createObjectURL(blob);
        if (active) {
          setPhotoUrl(createdUrl);
        } else {
          URL.revokeObjectURL(createdUrl);
        }
      } catch {
        // No photo / no User.Read consent — keep the initials avatar.
      }
    })();
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.homeAccountId]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!account) {
    return (
      <div className={`flex ${isArabic ? "justify-end" : "justify-start"}`}>
        <SignInButton locale={locale} />
      </div>
    );
  }

  const handleSignOut = async () => {
    window.localStorage.setItem(localeStorageKey, locale);
    document.cookie = `${localeStorageKey}=${locale}; path=/; max-age=31536000; samesite=lax`;
    await instance.logoutRedirect({
      account,
      postLogoutRedirectUri: `${window.location.origin}/`,
    });
  };

  const itemCls = `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition hover:bg-black/10 ${
    isArabic ? "flex-row-reverse text-right" : "text-left"
  }`;

  return (
    <div ref={ref} className="relative">
      {open ? (
        <div className="absolute bottom-full mb-2 w-full overflow-hidden rounded-2xl border border-black/10 bg-[#dab74c] p-1 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]">
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              setOpen(false);
              router.push(`/settings?locale=${locale}`);
            }}
          >
            <Settings2Icon className="size-4" />
            <span className="flex-1">{copy.accountSettings}</span>
          </button>

          <div
            className={`px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/80 ${
              isArabic ? "text-right" : "text-left"
            }`}
          >
            {copy.accountLanguage}
          </div>
          {(["ar", "en"] as AppLocale[]).map((value) => (
            <button
              key={value}
              type="button"
              className={itemCls}
              onClick={() => {
                setLocale(value);
                setOpen(false);
              }}
            >
              <span className="flex-1">{localeLabels[value]}</span>
              {locale === value ? <CheckIcon className="size-4" /> : null}
            </button>
          ))}

          <div className="my-1 h-px bg-black/15" />
          <button
            type="button"
            className={`${itemCls} !text-red-800 hover:bg-black/10 hover:!text-red-900`}
            onClick={handleSignOut}
          >
            <LogOutIcon className="size-4" />
            <span className="flex-1">{copy.signOut}</span>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/50 px-3 py-2.5 transition hover:bg-sidebar-accent ${
          isArabic ? "flex-row-reverse text-right" : "text-left"
        }`}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="size-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">
            {account.name ?? account.username}
          </span>
          <span className="block truncate text-[11px] text-sidebar-foreground/60">
            {account.username}
          </span>
        </span>
        <ChevronUpIcon
          className={`size-4 shrink-0 text-sidebar-foreground/60 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
    </div>
  );
}

export function SignInButton({
  locale,
  large = false,
  className = "",
}: {
  locale: AppLocale;
  large?: boolean;
  className?: string;
}) {
  const { instance } = useMsal();
  const copy = appCopy[locale];

  const handleSignIn = async () => {
    const loginRequest = getLoginRequest();
    if (!loginRequest) {
      return;
    }

    window.localStorage.setItem(localeStorageKey, locale);
    document.cookie = `${localeStorageKey}=${locale}; path=/; max-age=31536000; samesite=lax`;
    await instance.loginRedirect({
      ...loginRequest,
      redirectStartPage: `${window.location.origin}/?locale=${locale}`,
    });
  };

  return (
    <button
      type="button"
      onClick={handleSignIn}
      className={`rounded-full border border-primary bg-primary font-medium text-primary-foreground transition hover:bg-primary/92 ${
        large ? "px-5 py-2.5 text-sm" : "px-3 py-1.5 text-xs"
      } ${className}`}
    >
      {large ? copy.lockedButton : copy.signIn}
    </button>
  );
}
