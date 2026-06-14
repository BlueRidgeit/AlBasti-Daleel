"use client";

import { useState } from "react";
import { ChevronDownIcon, SearchIcon } from "lucide-react";

import { appCopy, type AppLocale } from "@/lib/i18n";

export type QueryCriteria = {
  allWords: string;
  anyWords: string;
  exactPhrase: string;
  withoutWords: string;
  partWords: string;
};

const EMPTY: QueryCriteria = {
  allWords: "",
  anyWords: "",
  exactPhrase: "",
  withoutWords: "",
  partWords: "",
};

export function QueryBuilder({
  locale,
  isArabic,
  busy,
  onSearch,
}: {
  locale: AppLocale;
  isArabic: boolean;
  busy: boolean;
  onSearch: (criteria: QueryCriteria) => void;
}) {
  const copy = appCopy[locale];
  const [open, setOpen] = useState(false);
  const [criteria, setCriteria] = useState<QueryCriteria>(EMPTY);

  const hasAny = Object.values(criteria).some((value) => value.trim());

  const field = (key: keyof QueryCriteria, label: string) => (
    <label className={`block ${isArabic ? "text-right" : "text-left"}`}>
      <span className="mb-1 block text-[11px] font-medium text-slate-600">
        {label}
      </span>
      <input
        type="text"
        value={criteria[key]}
        onChange={(event) =>
          setCriteria((prev) => ({ ...prev, [key]: event.target.value }))
        }
        dir={isArabic ? "rtl" : "ltr"}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 transition focus:border-primary/40 focus:outline-none"
      />
    </label>
  );

  return (
    <section className="mt-5 rounded-2xl border border-primary/10 bg-white/70 p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center gap-2 ${
          isArabic ? "flex-row-reverse text-right" : "text-left"
        }`}
      >
        <SearchIcon className="size-3.5 text-primary/70" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">
          {copy.queryBuilderTitle}
        </span>
        <ChevronDownIcon
          className={`size-4 text-primary/70 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (hasAny && !busy) {
              onSearch(criteria);
            }
          }}
          className="mt-3 space-y-2.5"
        >
          {field("allWords", copy.qbAllWords)}
          {field("anyWords", copy.qbAnyWords)}
          {field("exactPhrase", copy.qbExactPhrase)}
          {field("withoutWords", copy.qbWithoutWords)}
          {field("partWords", copy.qbPartWords)}

          <div className={`flex items-center gap-2 ${isArabic ? "flex-row-reverse" : ""}`}>
            <button
              type="submit"
              disabled={!hasAny || busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              <SearchIcon className="size-3.5" />
              {busy ? copy.resultsSearching : copy.qbFind}
            </button>
            <button
              type="button"
              onClick={() => setCriteria(EMPTY)}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
            >
              {copy.qbClear}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
