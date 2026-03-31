"use client";

import { Settings2Icon } from "lucide-react";
import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { authEnabled, loginRequest } from "@/lib/auth-client";
import { appCopy, type AppLocale } from "@/lib/i18n";

export function AuthStatus({ locale }: { locale: AppLocale }) {
  const copy = appCopy[locale];
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!authEnabled) {
    return (
      <div className="rounded-full border border-primary/15 bg-primary/6 px-3 py-1.5 text-xs text-primary">
        {copy.authSetupPending}
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
        {copy.authSignedOut}
      </div>
    );
  }

  return <AuthenticatedStatus locale={locale} />;
}

export function AuthRequired({
  locale,
  children,
}: {
  locale: AppLocale;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <AuthLockedState locale={locale} />;
  }

  if (!authEnabled) {
    return <AuthLockedState locale={locale} setupPending />;
  }

  return <AuthenticatedGate locale={locale}>{children}</AuthenticatedGate>;
}

function AuthenticatedGate({
  locale,
  children,
}: {
  locale: AppLocale;
  children: React.ReactNode;
}) {
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];

  if (!account) {
    return <AuthLockedState locale={locale} />;
  }

  return <>{children}</>;
}

function AuthLockedState({
  locale,
  setupPending = false,
}: {
  locale: AppLocale;
  setupPending?: boolean;
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
          {setupPending ? copy.liveAccessRequiresSignIn : copy.lockedDescription}
        </p>
        {!setupPending ? <SignInButton locale={locale} large className="mt-6" /> : null}
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
    await instance.logoutRedirect({
      account,
      postLogoutRedirectUri: `${window.location.origin}/`,
    });
  };

  const handleOpenSettings = () => router.push("/settings");

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
    if (!loginRequest) {
      return;
    }

    await instance.loginRedirect(loginRequest);
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
