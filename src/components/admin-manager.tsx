"use client";

import { useState } from "react";
import { ShieldPlusIcon, Trash2Icon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getApiAccessToken } from "@/lib/auth-browser";
import { describeInvite, resendInvite, type InviteResult } from "@/lib/invite-client";
import type { AppLocale } from "@/lib/i18n";

type AppAdmin = {
  email: string;
  displayName?: string;
  addedBy?: string;
  addedAt: string;
};

const t = (isArabic: boolean, ar: string, en: string) => (isArabic ? ar : en);

export function AdminManager({
  isArabic,
}: {
  locale: AppLocale;
  isArabic: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [admins, setAdmins] = useState<AppAdmin[]>([]);
  const [envAdmins, setEnvAdmins] = useState<string[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sendInvite, setSendInvite] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getApiAccessToken().catch(() => undefined);
      const response = await fetch("/api/admin/admins", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = (await response.json().catch(() => ({}))) as {
        admins?: AppAdmin[];
        envAdmins?: string[];
        me?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setAdmins(Array.isArray(data.admins) ? data.admins : []);
      setEnvAdmins(Array.isArray(data.envAdmins) ? data.envAdmins : []);
      setMe(data.me ?? null);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t(isArabic, "تعذّر تحميل قائمة المسؤولين.", "Could not load administrators."),
      );
    } finally {
      setLoading(false);
    }
  };

  const add = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getApiAccessToken().catch(() => undefined);
      const response = await fetch("/api/admin/admins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: trimmed,
          displayName: displayName.trim() || undefined,
          sendInvite,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        admin?: AppAdmin;
        invite?: InviteResult;
        error?: string;
      };
      if (!response.ok || !data.admin) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setAdmins((current) => {
        const next = current.filter(
          (a) => a.email.toLowerCase() !== data.admin!.email.toLowerCase(),
        );
        next.push(data.admin!);
        return next.sort((a, b) => a.email.localeCompare(b.email));
      });
      const outcome = describeInvite(isArabic, data.invite, data.admin.email);
      setNotice(outcome.text ? outcome : null);
      setEmail("");
      setDisplayName("");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t(isArabic, "تعذّرت الإضافة.", "Could not add administrator."),
      );
    } finally {
      setAdding(false);
    }
  };

  const resend = async (admin: AppAdmin) => {
    setBusyEmail(`resend:${admin.email}`);
    setError(null);
    setNotice(null);
    try {
      const invite = await resendInvite({ email: admin.email, displayName: admin.displayName, role: "admin" });
      const outcome = describeInvite(isArabic, invite, admin.email);
      setNotice(
        invite.status === "not_configured" || invite.status === "failed"
          ? { ok: false, text: outcome.text.replace(/^(تمت الإضافة، لكن |Added, but )/, "") }
          : outcome,
      );
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t(isArabic, "تعذّر إرسال الدعوة.", "Could not send the invitation."),
      );
    } finally {
      setBusyEmail(null);
    }
  };

  const remove = async (admin: AppAdmin) => {
    if (
      !window.confirm(
        t(
          isArabic,
          `إزالة صلاحية المسؤول عن ${admin.email}؟`,
          `Remove administrator access for ${admin.email}?`,
        ),
      )
    ) {
      return;
    }
    setBusyEmail(admin.email);
    setError(null);
    try {
      const token = await getApiAccessToken().catch(() => undefined);
      const response = await fetch("/api/admin/admins", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: admin.email }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setAdmins((current) =>
        current.filter(
          (a) => a.email.toLowerCase() !== admin.email.toLowerCase(),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t(isArabic, "تعذّرت الإزالة.", "Could not remove administrator."),
      );
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          void load();
        }
      }}
    >
      <DialogTrigger
        className={`flex w-full items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-primary transition hover:border-primary/30 hover:bg-primary/10 ${
          isArabic ? "flex-row-reverse text-right" : "text-left"
        }`}
      >
        <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
          <ShieldPlusIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">
          {t(isArabic, "إدارة المسؤولين", "Manage administrators")}
        </span>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md" dir={isArabic ? "rtl" : "ltr"}>
        <DialogHeader className={isArabic ? "text-right" : "text-left"}>
          <DialogTitle>
            {t(isArabic, "إدارة المسؤولين", "Manage administrators")}
          </DialogTitle>
          <DialogDescription>
            {t(
              isArabic,
              "امنح مستخدمًا صلاحيات المسؤول داخل التطبيق دون منحه دور مسؤول عام على المستأجر.",
              "Grant a user admin access inside this app without making them a tenant Global Administrator.",
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Add form */}
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
              placeholder={t(
                isArabic,
                "بريد المستخدم أو UPN",
                "User email / UPN",
              )}
              dir="ltr"
              className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary ${
                isArabic ? "text-right" : "text-left"
              }`}
            />
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t(
                isArabic,
                "الاسم (اختياري)",
                "Display name (optional)",
              )}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={adding || !email.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              <ShieldPlusIcon className="size-4" />
              {adding
                ? t(isArabic, "جارٍ الإضافة…", "Adding…")
                : t(isArabic, "منح صلاحية المسؤول", "Grant admin access")}
            </button>
          </div>
        </div>

        <label className={`flex items-center gap-2 text-xs text-slate-600 ${isArabic ? "flex-row-reverse" : ""}`}>
          <input
            type="checkbox"
            checked={sendInvite}
            onChange={(event) => setSendInvite(event.target.checked)}
            className="size-3.5 accent-primary"
          />
          {t(isArabic, "إرسال دعوة بالبريد الإلكتروني", "Send an invitation email")}
        </label>

        {error ? (
          <p className="text-center text-sm text-red-600">{error}</p>
        ) : null}
        {notice ? (
          <p className={`text-center text-sm ${notice.ok ? "text-emerald-700" : "text-amber-700"}`}>
            {notice.text}
          </p>
        ) : null}

        {/* Current app-admins */}
        <div className="max-h-[38vh] overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">…</p>
          ) : admins.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t(
                isArabic,
                "لا يوجد مسؤولون مُضافون من التطبيق بعد.",
                "No app-added administrators yet.",
              )}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {admins.map((admin) => {
                const isMe =
                  me != null &&
                  admin.email.toLowerCase() === me.toLowerCase();
                return (
                  <li
                    key={admin.email}
                    className={`flex items-center gap-3 rounded-lg border border-slate-200/80 px-3 py-2 ${
                      isArabic ? "flex-row-reverse text-right" : "text-left"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      {admin.displayName ? (
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {admin.displayName}
                        </span>
                      ) : null}
                      <span
                        dir="ltr"
                        className={`block truncate text-slate-700 ${
                          admin.displayName
                            ? "text-xs text-muted-foreground"
                            : "text-sm font-medium"
                        } ${isArabic ? "text-right" : "text-left"}`}
                      >
                        {admin.email}
                        {isMe
                          ? t(isArabic, " (أنت)", " (you)")
                          : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void resend(admin)}
                      disabled={busyEmail === `resend:${admin.email}`}
                      title={t(isArabic, "إعادة إرسال الدعوة", "Resend invitation")}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/5 disabled:opacity-60"
                    >
                      {busyEmail === `resend:${admin.email}` ? "…" : t(isArabic, "إعادة الدعوة", "Resend")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(admin)}
                      disabled={busyEmail === admin.email}
                      title={t(isArabic, "إزالة", "Remove")}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2Icon className="size-3.5" />
                      {busyEmail === admin.email
                        ? t(isArabic, "…", "…")
                        : t(isArabic, "إزالة", "Remove")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Read-only context: always-on admin sources */}
        {envAdmins.length > 0 ? (
          <div className="rounded-xl border border-slate-200/70 bg-white/60 p-3">
            <div
              className={`mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground ${
                isArabic ? "text-right" : "text-left"
              }`}
            >
              {t(isArabic, "مسؤولون دائمون (إعدادات)", "Always-on (env config)")}
            </div>
            <ul className="space-y-1">
              {envAdmins.map((upn) => (
                <li
                  key={upn}
                  dir="ltr"
                  className={`truncate text-xs text-slate-600 ${
                    isArabic ? "text-right" : "text-left"
                  }`}
                >
                  {upn}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p
          className={`text-xs leading-5 text-muted-foreground ${
            isArabic ? "text-right" : "text-left"
          }`}
        >
          {t(
            isArabic,
            "يظل مسؤولو المستأجر العامون (Global Admin) يملكون الصلاحية دائمًا ولا تظهر هنا.",
            "Tenant Global Administrators always keep access and are not listed here.",
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
