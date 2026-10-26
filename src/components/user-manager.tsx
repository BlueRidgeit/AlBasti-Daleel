"use client";

import { useState } from "react";
import { Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getApiAccessToken } from "@/lib/auth-browser";
import type { AppLocale } from "@/lib/i18n";

type AppUser = {
  email: string;
  displayName?: string;
  addedBy?: string;
  addedAt: string;
};

const t = (isArabic: boolean, ar: string, en: string) => (isArabic ? ar : en);

// Admin-only: choose who may use Daleel as a search user. Only shown when the app has the
// Postgres database; the "only listed users" switch turns enforcement on.
export function UserManager({
  isArabic,
}: {
  locale: AppLocale;
  isArabic: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [restricted, setRestricted] = useState(false);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await getApiAccessToken().catch(() => undefined);
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const call = async (method: string, body?: unknown) => {
    const response = await fetch("/api/admin/users", {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(await authHeaders()),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : `HTTP ${response.status}`);
    }
    return data;
  };

  const fail = (err: unknown, fallback: string) =>
    setError(err instanceof Error && err.message ? err.message : fallback);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await call("GET");
      setAvailable(data.available !== false);
      setUsers(Array.isArray(data.users) ? (data.users as AppUser[]) : []);
      setRestricted(Boolean(data.restricted));
    } catch (err) {
      fail(err, t(isArabic, "تعذّر تحميل المستخدمين.", "Could not load users."));
    } finally {
      setLoading(false);
    }
  };

  const add = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy("__add");
    setError(null);
    try {
      const data = await call("POST", {
        email: trimmed,
        displayName: displayName.trim() || undefined,
      });
      const added = data.user as AppUser;
      setUsers((current) =>
        [...current.filter((u) => u.email.toLowerCase() !== added.email.toLowerCase()), added].sort(
          (a, b) => a.email.localeCompare(b.email),
        ),
      );
      setEmail("");
      setDisplayName("");
    } catch (err) {
      fail(err, t(isArabic, "تعذّرت الإضافة.", "Could not add user."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (user: AppUser) => {
    if (
      !window.confirm(
        t(isArabic, `إزالة وصول ${user.email}؟`, `Remove access for ${user.email}?`),
      )
    ) {
      return;
    }
    setBusy(user.email);
    setError(null);
    try {
      await call("DELETE", { email: user.email });
      setUsers((current) => current.filter((u) => u.email.toLowerCase() !== user.email.toLowerCase()));
    } catch (err) {
      fail(err, t(isArabic, "تعذّرت الإزالة.", "Could not remove user."));
    } finally {
      setBusy(null);
    }
  };

  const toggleRestricted = async (next: boolean) => {
    if (
      next &&
      !window.confirm(
        t(
          isArabic,
          "سيُسمح فقط للمستخدمين المدرجين والمسؤولين باستخدام دليل. المتابعة؟",
          "Only the users listed here and administrators will be able to use Daleel. Continue?",
        ),
      )
    ) {
      return;
    }
    setBusy("__restrict");
    setError(null);
    try {
      await call("PUT", { restricted: next });
      setRestricted(next);
    } catch (err) {
      fail(err, t(isArabic, "تعذّر تغيير الإعداد.", "Could not change the setting."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger
        className={`flex w-full items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-primary transition hover:border-primary/30 hover:bg-primary/10 ${
          isArabic ? "flex-row-reverse text-right" : "text-left"
        }`}
      >
        <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
          <UsersIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">
          {t(isArabic, "إدارة المستخدمين", "Manage users")}
        </span>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md" dir={isArabic ? "rtl" : "ltr"}>
        <DialogHeader className={isArabic ? "text-right" : "text-left"}>
          <DialogTitle>{t(isArabic, "إدارة المستخدمين", "Manage users")}</DialogTitle>
          <DialogDescription>
            {t(
              isArabic,
              "امنح مستخدمي Entra صلاحية البحث فقط. المسؤولون يحتفظون بكامل الصلاحيات.",
              "Grant Entra users search-only access. Administrators keep full access.",
            )}
          </DialogDescription>
        </DialogHeader>

        {!available ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {t(
              isArabic,
              "إدارة المستخدمين تتطلب قاعدة بيانات Postgres لم تُهيَّأ بعد.",
              "User management needs the Postgres database, which is not configured yet.",
            )}
          </p>
        ) : (
          <>
            <label
              className={`flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-sm ${
                isArabic ? "flex-row-reverse text-right" : "text-left"
              }`}
            >
              <input
                type="checkbox"
                checked={restricted}
                disabled={busy === "__restrict" || loading}
                onChange={(event) => void toggleRestricted(event.target.checked)}
                className="size-4 accent-primary"
              />
              <span className="flex-1">
                {t(
                  isArabic,
                  "السماح للمستخدمين المدرجين فقط",
                  "Only listed users can use Daleel",
                )}
                <span className="block text-xs text-muted-foreground">
                  {restricted
                    ? t(isArabic, "مفعّل — غير المدرجين محجوبون.", "On — unlisted users are blocked.")
                    : t(isArabic, "متوقف — كل مستخدمي المستأجر يستطيعون الدخول.", "Off — everyone in the tenant can sign in.")}
                </span>
              </span>
            </label>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
              <div className="grid gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void add();
                    }
                  }}
                  placeholder={t(isArabic, "بريد المستخدم أو UPN", "User email / UPN")}
                  dir="ltr"
                  className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary ${
                    isArabic ? "text-right" : "text-left"
                  }`}
                />
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={t(isArabic, "الاسم (اختياري)", "Display name (optional)")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => void add()}
                  disabled={busy === "__add" || !email.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                >
                  <UserPlusIcon className="size-4" />
                  {busy === "__add"
                    ? t(isArabic, "جارٍ الإضافة…", "Adding…")
                    : t(isArabic, "منح صلاحية البحث", "Grant search access")}
                </button>
              </div>
            </div>

            {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

            <div className="max-h-[34vh] overflow-y-auto">
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">…</p>
              ) : users.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t(isArabic, "لا يوجد مستخدمون مُضافون بعد.", "No users added yet.")}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {users.map((user) => (
                    <li
                      key={user.email}
                      className={`flex items-center gap-3 rounded-lg border border-slate-200/80 px-3 py-2 ${
                        isArabic ? "flex-row-reverse text-right" : "text-left"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        {user.displayName ? (
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {user.displayName}
                          </span>
                        ) : null}
                        <span
                          dir="ltr"
                          className={`block truncate text-slate-700 ${
                            user.displayName ? "text-xs text-muted-foreground" : "text-sm font-medium"
                          } ${isArabic ? "text-right" : "text-left"}`}
                        >
                          {user.email}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void remove(user)}
                        disabled={busy === user.email}
                        title={t(isArabic, "إزالة", "Remove")}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        <Trash2Icon className="size-3.5" />
                        {t(isArabic, "إزالة", "Remove")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
