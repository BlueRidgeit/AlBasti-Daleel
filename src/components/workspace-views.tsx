"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";

import { ChatMenu } from "@/components/chat-menu";
import { appCopy, type AppLocale } from "@/lib/i18n";

export type ChatEntry = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
  pinned: boolean;
  pinnedOrder?: number;
  projectId?: string;
  projectName?: string;
};

export type ProjectEntry = { id: string; name: string };

export type SearchDoc = {
  itemId: string;
  title: string;
  snippet: string;
  url?: string;
  library?: string;
};

export type ChatActions = {
  onOpen: (id: string) => void;
  onPinToggle: (id: string, pinned: boolean) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onSetProject: (id: string, projectId: string | null) => void;
  onCreateProjectWithChat: (id: string, name: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
};

export function formatRelativeDate(iso: string, locale: AppLocale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((startToday.getTime() - startTarget.getTime()) / 86_400_000);

  if (diff <= 0) return locale === "ar" ? "اليوم" : "Today";
  if (diff === 1) return locale === "ar" ? "أمس" : "Yesterday";
  if (diff < 7) return locale === "ar" ? `منذ ${diff} أيام` : `${diff} days ago`;
  return date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

// One chat row, shared by the sidebar (compact) and the All-Chats page (detailed).
export function ChatRow({
  chat,
  locale,
  isArabic,
  variant,
  projects,
  active,
  loading,
  renaming,
  canMoveUp,
  canMoveDown,
  actions,
  onRenameSubmit,
}: {
  chat: ChatEntry;
  locale: AppLocale;
  isArabic: boolean;
  variant: "sidebar" | "list";
  projects: ProjectEntry[];
  active: boolean;
  loading: boolean;
  renaming: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  actions: ChatActions;
  onRenameSubmit: (id: string, title: string | null) => void;
}) {
  const [draft, setDraft] = useState(chat.title);

  useEffect(() => {
    if (renaming) {
      setDraft(chat.title);
    }
  }, [renaming, chat.title]);

  if (renaming) {
    return (
      <input
        autoFocus
        value={draft}
        dir={isArabic ? "rtl" : "ltr"}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onRenameSubmit(chat.id, draft);
          if (event.key === "Escape") onRenameSubmit(chat.id, null);
        }}
        onBlur={() => onRenameSubmit(chat.id, draft)}
        className={`w-full rounded-lg px-2.5 py-2 text-sm ${
          variant === "sidebar"
            ? "border border-white/20 bg-white/10 text-sidebar-foreground"
            : "border border-slate-300 bg-white text-slate-900"
        } focus:outline-none`}
      />
    );
  }

  const menu = (
    <ChatMenu
      locale={locale}
      isArabic={isArabic}
      chat={chat}
      projects={projects}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      triggerClassName={
        variant === "list"
          ? "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 focus:opacity-100 group-hover/item:opacity-100"
          : undefined
      }
      onPinToggle={actions.onPinToggle}
      onRename={actions.onRename}
      onDelete={actions.onDelete}
      onSetProject={actions.onSetProject}
      onCreateProjectWithChat={actions.onCreateProjectWithChat}
      onMove={actions.onMove}
    />
  );

  if (variant === "sidebar") {
    return (
      <div className="group/item relative">
        <button
          type="button"
          onClick={() => actions.onOpen(chat.id)}
          className={`w-full rounded-lg px-2.5 py-1.5 text-sm leading-6 transition ${
            active
              ? "bg-white/10 text-sidebar-foreground"
              : "text-sidebar-foreground/82 hover:bg-white/6"
          } ${isArabic ? "pl-9 text-right" : "pr-9 text-left"}`}
        >
          <span className="block truncate">
            {loading ? (locale === "ar" ? "جاري التحميل..." : "Loading...") : chat.title}
          </span>
        </button>
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${isArabic ? "left-1" : "right-1"}`}
        >
          {menu}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group/item flex items-center gap-3 border-b border-slate-200/70 px-2 py-3 ${
        isArabic ? "flex-row-reverse" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => actions.onOpen(chat.id)}
        className={`min-w-0 flex-1 ${isArabic ? "text-right" : "text-left"}`}
      >
        <span className="block truncate text-sm font-medium text-slate-900">
          {chat.title}
        </span>
      </button>
      {chat.projectName ? (
        <span className="hidden max-w-40 shrink-0 truncate rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary sm:inline">
          {chat.projectName}
        </span>
      ) : null}
      <span className="shrink-0 text-xs text-slate-400">
        {formatRelativeDate(chat.updatedAt, locale)}
      </span>
      {menu}
    </div>
  );
}

const viewHeaderCls = "mb-4 flex items-center gap-3";

export function AllChatsView({
  locale,
  isArabic,
  chats,
  projects,
  activeThreadId,
  loadingThreadId,
  renamingId,
  actions,
  onRenameSubmit,
  onNewChat,
}: {
  locale: AppLocale;
  isArabic: boolean;
  chats: ChatEntry[];
  projects: ProjectEntry[];
  activeThreadId?: string;
  loadingThreadId?: string | null;
  renamingId: string | null;
  actions: ChatActions;
  onRenameSubmit: (id: string, title: string | null) => void;
  onNewChat: () => void;
}) {
  const copy = appCopy[locale];
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? chats.filter((chat) => chat.title.toLowerCase().includes(needle))
      : chats;
  }, [chats, query]);

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 py-8"
    >
      <div className={`${viewHeaderCls} ${isArabic ? "flex-row-reverse" : ""}`}>
        <h2 className="flex-1 text-2xl font-semibold tracking-tight text-slate-950">
          {copy.chatsTitle}
        </h2>
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <PlusIcon className="size-4" />
          {copy.navNewChat}
        </button>
      </div>

      <div className="relative mb-2">
        <SearchIcon
          className={`pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-slate-400 ${
            isArabic ? "right-3" : "left-3"
          }`}
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.chatsSearchPlaceholder}
          dir={isArabic ? "rtl" : "ltr"}
          className={`w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm text-slate-900 transition focus:border-primary/40 focus:outline-none ${
            isArabic ? "pr-10 pl-3 text-right" : "pl-10 pr-3 text-left"
          }`}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">{copy.chatsEmpty}</p>
      ) : (
        <div>
          {filtered.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              locale={locale}
              isArabic={isArabic}
              variant="list"
              projects={projects}
              active={chat.id === activeThreadId}
              loading={loadingThreadId === chat.id}
              renaming={renamingId === chat.id}
              canMoveUp={false}
              canMoveDown={false}
              actions={actions}
              onRenameSubmit={onRenameSubmit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectsView({
  locale,
  isArabic,
  projects,
  chats,
  activeThreadId,
  loadingThreadId,
  renamingId,
  actions,
  onRenameSubmit,
  onCreateProject,
  onDeleteProject,
}: {
  locale: AppLocale;
  isArabic: boolean;
  projects: ProjectEntry[];
  chats: ChatEntry[];
  activeThreadId?: string;
  loadingThreadId?: string | null;
  renamingId: string | null;
  actions: ChatActions;
  onRenameSubmit: (id: string, title: string | null) => void;
  onCreateProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
}) {
  const copy = appCopy[locale];
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ProjectEntry | null>(null);

  const Back = isArabic ? ArrowRightIcon : ArrowLeftIcon;

  if (selected) {
    const projectChats = chats.filter((chat) => chat.projectId === selected.id);
    return (
      <div
        dir={isArabic ? "rtl" : "ltr"}
        className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 py-8"
      >
        <div className={`${viewHeaderCls} ${isArabic ? "flex-row-reverse" : ""}`}>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-100"
            aria-label={copy.backLabel}
          >
            <Back className="size-4" />
          </button>
          <h2 className="flex-1 truncate text-2xl font-semibold tracking-tight text-slate-950">
            {selected.name}
          </h2>
        </div>

        {projectChats.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            {copy.projectChatsEmpty}
          </p>
        ) : (
          <div>
            {projectChats.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                locale={locale}
                isArabic={isArabic}
                variant="list"
                projects={projects}
                active={chat.id === activeThreadId}
                loading={loadingThreadId === chat.id}
                renaming={renamingId === chat.id}
                canMoveUp={false}
                canMoveDown={false}
                actions={actions}
                onRenameSubmit={onRenameSubmit}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 py-8"
    >
      <div className={`${viewHeaderCls} ${isArabic ? "flex-row-reverse" : ""}`}>
        <h2 className="flex-1 text-2xl font-semibold tracking-tight text-slate-950">
          {copy.projectsTitle}
        </h2>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) {
            onCreateProject(name.trim());
            setName("");
          }
        }}
        className={`mb-6 flex items-center gap-2 ${isArabic ? "flex-row-reverse" : ""}`}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={copy.projectNamePlaceholder}
          dir={isArabic ? "rtl" : "ltr"}
          className={`min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-primary/40 focus:outline-none ${
            isArabic ? "text-right" : "text-left"
          }`}
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          <FolderPlusIcon className="size-4" />
          {copy.projectsCreate}
        </button>
      </form>

      {projects.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">{copy.projectsEmpty}</p>
      ) : (
        <div className="grid gap-2.5">
          {projects.map((project) => {
            const count = chats.filter((chat) => chat.projectId === project.id).length;
            return (
              <div
                key={project.id}
                className={`group/item flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/30 ${
                  isArabic ? "flex-row-reverse" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelected(project)}
                  className={`flex min-w-0 flex-1 items-center gap-3 ${
                    isArabic ? "flex-row-reverse text-right" : "text-left"
                  }`}
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FolderIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {project.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {count} {copy.chatsTitle}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(copy.projectDeleteConfirm)) {
                      onDeleteProject(project.id);
                      setSelected(null);
                    }
                  }}
                  aria-label={copy.projectDelete}
                  title={copy.projectDelete}
                  className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover/item:opacity-100"
                >
                  <Trash2Icon className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SearchResultsView({
  locale,
  isArabic,
  documents,
  busy,
}: {
  locale: AppLocale;
  isArabic: boolean;
  documents: SearchDoc[];
  busy: boolean;
}) {
  const copy = appCopy[locale];

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 py-8"
    >
      <div className={`${viewHeaderCls} ${isArabic ? "flex-row-reverse" : ""}`}>
        <h2 className="flex-1 text-2xl font-semibold tracking-tight text-slate-950">
          {copy.resultsTitle}
        </h2>
        {!busy ? (
          <span className="text-sm text-slate-500">{documents.length}</span>
        ) : null}
      </div>

      {busy ? (
        <p className="py-12 text-center text-sm text-slate-500">{copy.resultsSearching}</p>
      ) : documents.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">{copy.resultsEmpty}</p>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.itemId}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className={`flex items-start gap-3 ${isArabic ? "flex-row-reverse text-right" : "text-left"}`}>
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileTextIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`flex items-center gap-2 ${isArabic ? "flex-row-reverse" : ""}`}>
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {doc.title}
                    </span>
                    {doc.library ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                        {doc.library}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600">
                    {doc.snippet}
                  </p>
                  {doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline ${
                        isArabic ? "flex-row-reverse" : ""
                      }`}
                    >
                      <ExternalLinkIcon className="size-3.5" />
                      {copy.openInSharePoint}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
