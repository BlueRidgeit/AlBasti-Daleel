"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";

import { ChatMenu } from "@/components/chat-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export type ProjectEntry = { id: string; name: string; description?: string };

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

function ProjectModal({
  locale,
  isArabic,
  open,
  initial,
  onOpenChange,
  onSubmit,
}: {
  locale: AppLocale;
  isArabic: boolean;
  open: boolean;
  initial: { name: string; description?: string } | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, description: string) => void;
}) {
  const copy = appCopy[locale];
  const editing = Boolean(initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir={isArabic ? "rtl" : "ltr"}>
        <DialogHeader className={isArabic ? "text-right" : "text-left"}>
          <DialogTitle>
            {editing ? copy.projectModalEditTitle : copy.projectModalCreateTitle}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) onSubmit(name.trim(), description.trim());
          }}
          className="space-y-4"
        >
          <div className={isArabic ? "text-right" : "text-left"}>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {copy.projectWorkingOn}
            </label>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={copy.projectNamePlaceholder}
              dir={isArabic ? "rtl" : "ltr"}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary/40 focus:outline-none"
            />
          </div>
          <div className={isArabic ? "text-right" : "text-left"}>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {copy.projectAchieve}
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={copy.projectDescPlaceholder}
              dir={isArabic ? "rtl" : "ltr"}
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary/40 focus:outline-none"
            />
          </div>
          <div
            className={`flex items-center justify-end gap-2 ${
              isArabic ? "flex-row-reverse" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {copy.cancel}
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {editing ? copy.saveLabel : copy.projectCreateBtn}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
  onUpdateProject,
  onDeleteProject,
  onStartProjectChat,
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
  onCreateProject: (name: string, description: string) => Promise<ProjectEntry | undefined>;
  onUpdateProject: (id: string, name: string, description: string) => void;
  onDeleteProject: (id: string, deleteChats: boolean) => void;
  onStartProjectChat: (projectId: string) => void;
}) {
  const copy = appCopy[locale];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProjectEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectEntry | null>(null);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectEntry | null>(null);
  const [alsoDeleteChats, setAlsoDeleteChats] = useState(false);
  const detailMenuBtnRef = useRef<HTMLButtonElement>(null);
  const [detailMenuPos, setDetailMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const toggleDetailMenu = () => {
    if (detailMenuOpen) {
      setDetailMenuOpen(false);
      return;
    }
    const rect = detailMenuBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 200;
      const rawLeft = isArabic ? rect.left : rect.right - width;
      const left = Math.min(Math.max(8, rawLeft), window.innerWidth - width - 8);
      setDetailMenuPos({ top: rect.bottom + 6, left });
    }
    setDetailMenuOpen(true);
  };

  const Back = isArabic ? ArrowRightIcon : ArrowLeftIcon;

  const handleModalSubmit = async (name: string, description: string) => {
    if (editing) {
      onUpdateProject(editing.id, name, description);
      setSelected((current) =>
        current && current.id === editing.id
          ? { ...current, name, description: description || undefined }
          : current,
      );
      setModalOpen(false);
      return;
    }
    const created = await onCreateProject(name, description);
    setModalOpen(false);
    if (created) setSelected(created);
  };

  const projectModal = (
    <ProjectModal
      locale={locale}
      isArabic={isArabic}
      open={modalOpen}
      initial={editing ? { name: editing.name, description: editing.description } : null}
      onOpenChange={setModalOpen}
      onSubmit={handleModalSubmit}
    />
  );

  const deleteTargetChats = deleteTarget
    ? chats.filter((chat) => chat.projectId === deleteTarget.id).length
    : 0;

  const deleteModal = (
    <Dialog
      open={Boolean(deleteTarget)}
      onOpenChange={(value) => {
        if (!value) setDeleteTarget(null);
      }}
    >
      <DialogContent className="sm:max-w-md" dir={isArabic ? "rtl" : "ltr"}>
        <DialogHeader className={isArabic ? "text-right" : "text-left"}>
          <DialogTitle>{copy.projectDelete}</DialogTitle>
        </DialogHeader>
        <div className={`space-y-4 ${isArabic ? "text-right" : "text-left"}`}>
          <p className="text-sm text-slate-600">
            {copy.projectDeleteBody}
            {deleteTarget ? ` “${deleteTarget.name}”` : ""}
          </p>
          {deleteTargetChats > 0 ? (
            <label
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 ${
                isArabic ? "flex-row-reverse text-right" : "text-left"
              }`}
            >
              <input
                type="checkbox"
                checked={alsoDeleteChats}
                onChange={(event) => setAlsoDeleteChats(event.target.checked)}
                className="size-4 shrink-0 accent-primary"
              />
              <span className="flex-1">
                {copy.projectDeleteChatsOption} ({deleteTargetChats})
              </span>
            </label>
          ) : null}
          <div className={`flex items-center justify-end gap-2 ${isArabic ? "flex-row-reverse" : ""}`}>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                if (deleteTarget) onDeleteProject(deleteTarget.id, alsoDeleteChats);
                setDeleteTarget(null);
                setSelected(null);
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              {copy.historyDelete}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (selected) {
    const projectChats = chats.filter((chat) => chat.projectId === selected.id);
    return (
      <div
        dir={isArabic ? "rtl" : "ltr"}
        className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 py-8"
      >
        <button
          type="button"
          onClick={() => setSelected(null)}
          className={`mb-6 flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-800 ${
            isArabic ? "flex-row-reverse" : ""
          }`}
        >
          <Back className="size-4" />
          {copy.allProjects}
        </button>

        <div className="mb-6 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2
              className={`truncate text-2xl font-semibold tracking-tight text-slate-950 ${
                isArabic ? "text-right" : "text-left"
              }`}
            >
              {selected.name}
            </h2>
            {selected.description ? (
              <p
                className={`mt-1 text-sm text-slate-600 ${
                  isArabic ? "text-right" : "text-left"
                }`}
              >
                {selected.description}
              </p>
            ) : null}
          </div>

          <div className="shrink-0">
            <button
              ref={detailMenuBtnRef}
              type="button"
              onClick={toggleDetailMenu}
              aria-label="More options"
              className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
            >
              <MoreVerticalIcon className="size-4" />
            </button>
            {mounted && detailMenuOpen && detailMenuPos
              ? createPortal(
                  <>
                    <button
                      type="button"
                      aria-hidden
                      tabIndex={-1}
                      onClick={() => setDetailMenuOpen(false)}
                      className="fixed inset-0 z-40 cursor-default"
                    />
                    <div
                      role="menu"
                      data-slot="project-detail-menu"
                      dir={isArabic ? "rtl" : "ltr"}
                      style={{
                        top: detailMenuPos.top,
                        left: detailMenuPos.left,
                        width: 200,
                      }}
                      className="fixed z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setDetailMenuOpen(false);
                          setEditing(selected);
                          setModalOpen(true);
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 ${
                          isArabic ? "flex-row-reverse text-right" : "text-left"
                        }`}
                      >
                        <PencilIcon className="size-4 shrink-0" />
                        <span className="flex-1">{copy.menuEditDetails}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailMenuOpen(false);
                          setAlsoDeleteChats(false);
                          setDeleteTarget(selected);
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 ${
                          isArabic ? "flex-row-reverse text-right" : "text-left"
                        }`}
                      >
                        <Trash2Icon className="size-4 shrink-0" />
                        <span className="flex-1">{copy.projectDelete}</span>
                      </button>
                    </div>
                  </>,
                  document.body,
                )
              : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onStartProjectChat(selected.id)}
          className={`mb-6 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 transition hover:border-primary/40 hover:shadow-sm ${
            isArabic ? "text-right" : "text-left"
          }`}
        >
          <span className="block text-sm text-slate-400">
            {copy.projectComposerPlaceholder}
          </span>
          <PlusIcon className="mt-3 size-5 text-slate-400" />
        </button>

        {projectChats.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            {copy.projectStartHint}
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

        {projectModal}
        {deleteModal}
      </div>
    );
  }

  const filtered = query.trim()
    ? projects.filter((project) =>
        project.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : projects;

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 py-8"
    >
      <div className={`${viewHeaderCls} ${isArabic ? "flex-row-reverse" : ""}`}>
        <h2 className="flex-1 text-2xl font-semibold tracking-tight text-slate-950">
          {copy.projectsTitle}
        </h2>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <FolderPlusIcon className="size-4" />
          {copy.projectsNew}
        </button>
      </div>

      {projects.length > 0 ? (
        <div className="relative mb-4">
          <SearchIcon
            className={`pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-slate-400 ${
              isArabic ? "right-3" : "left-3"
            }`}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.projectSearchPlaceholder}
            dir={isArabic ? "rtl" : "ltr"}
            className={`w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm text-slate-900 transition focus:border-primary/40 focus:outline-none ${
              isArabic ? "pr-10 pl-3 text-right" : "pl-10 pr-3 text-left"
            }`}
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">{copy.projectsEmpty}</p>
      ) : (
        <div className="grid gap-2.5">
          {filtered.map((project) => {
            const count = chats.filter((chat) => chat.projectId === project.id).length;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelected(project)}
                className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/30 ${
                  isArabic ? "flex-row-reverse text-right" : "text-left"
                }`}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FolderIcon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {project.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {project.description
                      ? project.description
                      : `${count} ${copy.chatsTitle}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {projectModal}
      {deleteModal}
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
