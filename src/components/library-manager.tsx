"use client";

import { useState } from "react";
import { LibraryBigIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getApiAccessToken } from "@/lib/auth-browser";
import { appCopy } from "@/lib/i18n";
import type { AppLocale } from "@/lib/i18n";

type AdminLibrary = {
  driveId: string;
  label: string;
  webUrl?: string;
  indexed: boolean;
  count: number;
};

export function LibraryManager({
  locale,
  isArabic,
}: {
  locale: AppLocale;
  isArabic: boolean;
}) {
  const copy = appCopy[locale];
  const [open, setOpen] = useState(false);
  const [libraries, setLibraries] = useState<AdminLibrary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyDriveId, setBusyDriveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getApiAccessToken().catch(() => undefined);
      const response = await fetch("/api/admin/libraries", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as { libraries?: AdminLibrary[] };
      setLibraries(Array.isArray(data.libraries) ? data.libraries : []);
    } catch {
      setError(copy.adminLibrariesError);
    } finally {
      setLoading(false);
    }
  };

  const enable = async (library: AdminLibrary) => {
    setBusyDriveId(library.driveId);
    setError(null);
    try {
      const token = await getApiAccessToken().catch(() => undefined);
      const response = await fetch("/api/admin/libraries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ driveId: library.driveId, label: library.label }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setLibraries((current) =>
        current.map((entry) =>
          entry.driveId === library.driveId ? { ...entry, indexed: true } : entry,
        ),
      );
    } catch {
      setError(copy.adminLibrariesError);
    } finally {
      setBusyDriveId(null);
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
        className={`flex w-full items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/50 px-4 py-3 text-sidebar-foreground transition hover:border-sidebar-primary/30 hover:bg-sidebar-accent ${
          isArabic ? "flex-row-reverse text-right" : "text-left"
        }`}
      >
        <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-white/10">
          <LibraryBigIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">
          {copy.adminLibrariesTitle}
        </span>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md" dir={isArabic ? "rtl" : "ltr"}>
        <DialogHeader className={isArabic ? "text-right" : "text-left"}>
          <DialogTitle>{copy.adminLibrariesTitle}</DialogTitle>
          <DialogDescription>{copy.adminLibrariesDesc}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">…</p>
          ) : error ? (
            <p className="py-6 text-center text-sm text-red-600">{error}</p>
          ) : libraries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {copy.adminLibrariesEmpty}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {libraries.map((library) => (
                <li
                  key={library.driveId}
                  className={`flex items-center gap-3 rounded-lg border border-slate-200/80 px-3 py-2 ${
                    isArabic ? "flex-row-reverse text-right" : "text-left"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {library.label}
                    </span>
                    {library.indexed ? (
                      <span className="block text-xs text-muted-foreground">
                        {library.count.toLocaleString()}
                      </span>
                    ) : null}
                  </span>
                  {library.indexed ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {copy.adminLibrariesIndexed}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void enable(library)}
                      disabled={busyDriveId === library.driveId}
                      className="shrink-0 rounded-full border border-primary/30 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
                    >
                      {busyDriveId === library.driveId
                        ? copy.adminLibrariesAdding
                        : copy.adminLibrariesAdd}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
