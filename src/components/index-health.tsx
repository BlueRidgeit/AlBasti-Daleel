"use client";

import { useState } from "react";
import { ActivitySquareIcon, RefreshCwIcon } from "lucide-react";

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

type LibraryStatus = {
  driveId: string;
  label: string;
  enabled: boolean;
  indexedCount: number;
  lastSyncedAt: string | null;
};

type StatusPayload = {
  generatedAt: string;
  queue: { ingestion: number; retry: number };
  libraries: LibraryStatus[];
};

// A library that hasn't advanced its delta cursor in over an hour is treated as stuck.
const STALE_MS = 60 * 60 * 1000;

const t = (isArabic: boolean, ar: string, en: string) => (isArabic ? ar : en);

const ageMs = (iso: string | null) =>
  iso ? Date.now() - new Date(iso).getTime() : Number.POSITIVE_INFINITY;

const isStale = (lib: LibraryStatus) =>
  lib.enabled && ageMs(lib.lastSyncedAt) > STALE_MS;

const relativeTime = (iso: string | null, isArabic: boolean) => {
  if (!iso) {
    return t(isArabic, "لم تتم المزامنة قط", "never synced");
  }
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) {
    return t(isArabic, "الآن", "just now");
  }
  if (mins < 60) {
    return t(isArabic, `منذ ${mins} دقيقة`, `${mins} min ago`);
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return t(isArabic, `منذ ${hours} ساعة`, `${hours}h ago`);
  }
  const days = Math.floor(hours / 24);
  return t(isArabic, `منذ ${days} يوم`, `${days}d ago`);
};

export function IndexHealth({
  isArabic,
}: {
  locale: AppLocale;
  isArabic: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getApiAccessToken().catch(() => undefined);
      const response = await fetch("/api/admin/index-status", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as
        | (StatusPayload & { error?: string })
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          (payload as { error?: string }).error ?? `HTTP ${response.status}`,
        );
      }
      setData(payload as StatusPayload);
      setCheckedAt(new Date());
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error && err.message
          ? err.message
          : t(isArabic, "تعذّر تحميل الحالة.", "Could not load status."),
      );
    } finally {
      setLoading(false);
    }
  };

  const libraries = data?.libraries ?? [];
  const enabled = libraries.filter((lib) => lib.enabled);
  const staleCount = enabled.filter(isStale).length;
  const healthy = data != null && staleCount === 0;
  const pending =
    (data?.queue.ingestion ?? 0) < 0 ? 0 : data?.queue.ingestion ?? 0;
  const retry = (data?.queue.retry ?? 0) < 0 ? 0 : data?.queue.retry ?? 0;

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
          <ActivitySquareIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">
          {t(isArabic, "حالة الفهرسة", "Indexing health")}
        </span>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg" dir={isArabic ? "rtl" : "ltr"}>
        <DialogHeader className={isArabic ? "text-right" : "text-left"}>
          <DialogTitle>
            {t(isArabic, "حالة الفهرسة", "Indexing health")}
          </DialogTitle>
          <DialogDescription>
            {t(
              isArabic,
              "يعرض ما إذا كانت كل مكتبة تتم مزامنتها، وعدد الملفات المفهرسة، وحجم قائمة الانتظار.",
              "Shows whether each library is syncing, how many files are indexed, and the pending queue.",
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Overall status banner */}
        {data ? (
          <div
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              healthy
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50"
            } ${isArabic ? "flex-row-reverse text-right" : "text-left"}`}
          >
            <span className="text-lg leading-none">
              {healthy ? "🟢" : "🔴"}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={`text-sm font-semibold ${
                  healthy ? "text-emerald-800" : "text-red-800"
                }`}
              >
                {healthy
                  ? t(isArabic, "الفهرسة تعمل", "Indexing is healthy")
                  : t(
                      isArabic,
                      `${staleCount} مكتبة لم تتزامن منذ أكثر من ساعة`,
                      `${staleCount} librar${staleCount === 1 ? "y" : "ies"} not synced in over an hour`,
                    )}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(isArabic, "قيد الانتظار: ", "Pending: ")}
                {pending.toLocaleString()}
                {retry > 0
                  ? t(
                      isArabic,
                      ` • إعادة المحاولة: ${retry.toLocaleString()}`,
                      ` • retry: ${retry.toLocaleString()}`,
                    )
                  : ""}
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="text-center text-sm text-red-600">{error}</p>
        ) : null}

        {/* Per-library rows */}
        <div className="max-h-[42vh] overflow-y-auto">
          {loading && !data ? (
            <p className="py-6 text-center text-sm text-muted-foreground">…</p>
          ) : libraries.length === 0 && !error ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t(isArabic, "لا توجد مكتبات.", "No libraries.")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {libraries.map((lib) => {
                const stale = isStale(lib);
                const dot = !lib.enabled ? "⚪" : stale ? "🔴" : "🟢";
                return (
                  <li
                    key={lib.driveId}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                      stale ? "border-red-200 bg-red-50/50" : "border-slate-200/80"
                    } ${isArabic ? "flex-row-reverse text-right" : "text-left"}`}
                  >
                    <span className="text-base leading-none">{dot}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {lib.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {lib.indexedCount.toLocaleString()}
                        {t(isArabic, " ملف مفهرس", " indexed")}
                        {lib.enabled ? (
                          <>
                            {" • "}
                            <span
                              className={
                                stale ? "font-medium text-red-600" : ""
                              }
                            >
                              {relativeTime(lib.lastSyncedAt, isArabic)}
                            </span>
                          </>
                        ) : (
                          <> {t(isArabic, "• غير مُفعّلة", "• not enabled")}</>
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer: last-checked + refresh */}
        <div
          className={`flex items-center justify-between gap-3 ${
            isArabic ? "flex-row-reverse" : ""
          }`}
        >
          <span className="text-xs text-muted-foreground">
            {checkedAt
              ? t(
                  isArabic,
                  `آخر فحص: ${checkedAt.toLocaleTimeString("ar")}`,
                  `Last checked: ${checkedAt.toLocaleTimeString()}`,
                )
              : ""}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
          >
            <RefreshCwIcon
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            />
            {t(isArabic, "تحديث", "Refresh")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
