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
  fileTypes: string[];
};

const EMPTY: QueryCriteria = {
  allWords: "",
  anyWords: "",
  exactPhrase: "",
  withoutWords: "",
  partWords: "",
  fileTypes: [],
};

const TEXT_KEYS = [
  "allWords",
  "anyWords",
  "exactPhrase",
  "withoutWords",
  "partWords",
] as const;

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

  const hasAny = TEXT_KEYS.some((key) => criteria[key].trim());

  const fileTypeOptions: { key: string; label: string }[] = [
    { key: "word", label: copy.ftWord },
    { key: "pdf", label: copy.ftPdf },
    { key: "text", label: copy.ftText },
    { key: "excel", label: copy.ftExcel },
    { key: "powerpoint", label: copy.ftPowerpoint },
    { key: "image", label: copy.ftImage },
  ];

  const toggleType = (key: string) =>
    setCriteria((prev) => ({
      ...prev,
      fileTypes: prev.fileTypes.includes(key)
        ? prev.fileTypes.filter((value) => value !== key)
        : [...prev.fileTypes, key],
    }));

  const field = (key: (typeof TEXT_KEYS)[number], label: string) => (
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

          <div className={isArabic ? "text-right" : "text-left"}>
            <span className="mb-1.5 block text-[11px] font-medium text-slate-600">
              {copy.qbFileType}
            </span>
            <div className={`flex flex-wrap gap-1.5 ${isArabic ? "flex-row-reverse" : ""}`}>
              {fileTypeOptions.map((option) => {
                const active = criteria.fileTypes.includes(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleType(option.key)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-slate-200 bg-white text-slate-600 hover:border-primary/30"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

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
