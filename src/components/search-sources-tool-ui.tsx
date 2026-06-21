"use client";

import { useAssistantToolUI } from "@assistant-ui/react";
import {
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  SearchIcon,
} from "lucide-react";

import { appCopy, type AppLocale } from "@/lib/i18n";

type SourceDoc = {
  itemId: string;
  title: string;
  url?: string;
  folderUrl?: string;
  library?: string;
};

type SearchResult = {
  documents?: SourceDoc[];
};

// Registers a custom renderer for the assistant's `search_documents` tool calls so chat
// answers show a clean "Sources" strip (Open in SharePoint + Open folder per cited file)
// instead of the generic raw-JSON tool fallback. Returns null — it only registers.
export function SearchSourcesToolUI({ locale }: { locale: AppLocale }) {
  const copy = appCopy[locale];
  const isArabic = locale === "ar";

  useAssistantToolUI({
    toolName: "search_documents",
    render: (part) => {
      const result = part.result as SearchResult | undefined;
      const running = part.status?.type === "running";

      if (running && !result) {
        return (
          <div
            className={`my-2 flex items-center gap-2 text-xs text-slate-500 ${
              isArabic ? "flex-row-reverse" : ""
            }`}
          >
            <SearchIcon className="size-3.5 animate-pulse" />
            <span>{copy.resultsSearching}</span>
          </div>
        );
      }

      const docs = result?.documents ?? [];
      if (docs.length === 0) return null;

      return (
        <div
          dir={isArabic ? "rtl" : "ltr"}
          className="my-3 rounded-2xl border border-slate-200 bg-white/70 p-3"
        >
          <div
            className={`mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary/70 ${
              isArabic ? "flex-row-reverse" : ""
            }`}
          >
            <FileTextIcon className="size-3.5" />
            <span>
              {copy.sourcesHeading} ({docs.length})
            </span>
          </div>
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.itemId}
                className="rounded-xl border border-slate-100 bg-white px-3 py-2"
              >
                <div className={`flex items-center gap-2 ${isArabic ? "flex-row-reverse" : ""}`}>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm font-medium text-slate-900 ${
                      isArabic ? "text-right" : "text-left"
                    }`}
                  >
                    {doc.title}
                  </span>
                  {doc.library ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                      {doc.library}
                    </span>
                  ) : null}
                </div>
                {doc.url || doc.folderUrl ? (
                  <div
                    className={`mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 ${
                      isArabic ? "flex-row-reverse" : ""
                    }`}
                  >
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline ${
                          isArabic ? "flex-row-reverse" : ""
                        }`}
                      >
                        <ExternalLinkIcon className="size-3" />
                        {copy.openInSharePoint}
                      </a>
                    ) : null}
                    {doc.folderUrl ? (
                      <a
                        href={doc.folderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-primary hover:underline ${
                          isArabic ? "flex-row-reverse" : ""
                        }`}
                      >
                        <FolderIcon className="size-3" />
                        {copy.openFolder}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      );
    },
  });

  return null;
}
