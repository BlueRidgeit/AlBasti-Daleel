"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FolderIcon,
  FolderMinusIcon,
  FolderPlusIcon,
  MoreVerticalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { getAppCopy, type AppLocale } from "@/lib/i18n";

export type ChatProject = { id: string; name: string };

export type ChatMenuTarget = {
  id: string;
  pinned: boolean;
  projectId?: string;
  projectName?: string;
};

const MENU_WIDTH = 216;

export function ChatMenu({
  locale,
  isArabic,
  chat,
  projects,
  canMoveUp,
  canMoveDown,
  triggerClassName,
  onPinToggle,
  onRename,
  onDelete,
  onSetProject,
  onCreateProjectWithChat,
  onMove,
}: {
  locale: AppLocale;
  isArabic: boolean;
  chat: ChatMenuTarget;
  projects: ChatProject[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  triggerClassName?: string;
  onPinToggle: (id: string, pinned: boolean) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onSetProject: (id: string, projectId: string | null) => void;
  onCreateProjectWithChat: (id: string, name: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  const copy = getAppCopy(locale);
  const [open, setOpen] = useState(false);
  const [projectPicker, setProjectPicker] = useState(false);
  const [newProject, setNewProject] = useState("");
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const close = () => {
    setOpen(false);
    setProjectPicker(false);
    setNewProject("");
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const rawLeft = isArabic ? rect.left : rect.right - MENU_WIDTH;
      const left = Math.min(
        Math.max(8, rawLeft),
        window.innerWidth - MENU_WIDTH - 8,
      );
      // Flip the menu above the trigger when there isn't enough room below
      // (e.g. the last rows of a long list), so it never runs off the bottom.
      const estimatedHeight = 320;
      if (window.innerHeight - rect.bottom < estimatedHeight) {
        setPos({ bottom: window.innerHeight - rect.top + 4, left });
      } else {
        setPos({ top: rect.bottom + 4, left });
      }
    }
    setOpen(true);
  };

  const itemCls = `flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-white transition hover:bg-black/10 ${
    isArabic ? "flex-row-reverse text-right" : "text-left"
  }`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        aria-label="More options"
        aria-haspopup="menu"
        className={
          triggerClassName ??
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/55 opacity-0 transition hover:bg-white/10 hover:text-sidebar-foreground focus:opacity-100 group-hover/item:opacity-100"
        }
      >
        <MoreVerticalIcon className="size-3.5" />
      </button>

      {mounted && open && pos
        ? createPortal(
            <>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={close}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                role="menu"
                dir={isArabic ? "rtl" : "ltr"}
                style={{
                  top: pos.top,
                  bottom: pos.bottom,
                  left: pos.left,
                  width: MENU_WIDTH,
                  maxHeight: "calc(100vh - 16px)",
                }}
                className="fixed z-50 overflow-y-auto rounded-xl border border-black/10 bg-(color:--nav-cta) p-1 text-(color:--nav-cta-text) shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]"
              >
                {!projectPicker ? (
                  <>
                    <button
                      type="button"
                      className={itemCls}
                      onClick={() => {
                        onPinToggle(chat.id, !chat.pinned);
                        close();
                      }}
                    >
                      {chat.pinned ? (
                        <PinOffIcon className="size-3.5" />
                      ) : (
                        <PinIcon className="size-3.5" />
                      )}
                      <span className="flex-1">
                        {chat.pinned ? copy.historyUnpin : copy.historyPin}
                      </span>
                    </button>

                    <button
                      type="button"
                      className={itemCls}
                      onClick={() => {
                        onRename(chat.id);
                        close();
                      }}
                    >
                      <PencilIcon className="size-3.5" />
                      <span className="flex-1">{copy.menuRename}</span>
                    </button>

                    <button
                      type="button"
                      className={itemCls}
                      onClick={() => setProjectPicker(true)}
                    >
                      <FolderPlusIcon className="size-3.5" />
                      <span className="flex-1">
                        {chat.projectId ? copy.menuChangeProject : copy.menuAddToProject}
                      </span>
                    </button>

                    {chat.projectId ? (
                      <button
                        type="button"
                        className={itemCls}
                        onClick={() => {
                          onSetProject(chat.id, null);
                          close();
                        }}
                      >
                        <FolderMinusIcon className="size-3.5" />
                        <span className="flex-1">{copy.menuRemoveFromProject}</span>
                      </button>
                    ) : null}

                    {canMoveUp ? (
                      <button
                        type="button"
                        className={itemCls}
                        onClick={() => {
                          onMove(chat.id, "up");
                          close();
                        }}
                      >
                        <ChevronUpIcon className="size-3.5" />
                        <span className="flex-1">{copy.menuMoveUp}</span>
                      </button>
                    ) : null}

                    {canMoveDown ? (
                      <button
                        type="button"
                        className={itemCls}
                        onClick={() => {
                          onMove(chat.id, "down");
                          close();
                        }}
                      >
                        <ChevronDownIcon className="size-3.5" />
                        <span className="flex-1">{copy.menuMoveDown}</span>
                      </button>
                    ) : null}

                    <div className="my-1 h-px bg-black/15" />

                    <button
                      type="button"
                      className={`${itemCls} !text-red-800 hover:bg-black/10 hover:!text-red-900`}
                      onClick={() => {
                        onDelete(chat.id);
                        close();
                      }}
                    >
                      <Trash2Icon className="size-3.5" />
                      <span className="flex-1">{copy.historyDelete}</span>
                    </button>
                  </>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    <p
                      className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/80 ${
                        isArabic ? "text-right" : "text-left"
                      }`}
                    >
                      {chat.projectId ? copy.menuChangeProject : copy.menuAddToProject}
                    </p>

                    {projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        className={itemCls}
                        onClick={() => {
                          onSetProject(chat.id, project.id);
                          close();
                        }}
                      >
                        <FolderIcon className="size-3.5" />
                        <span className="flex-1 truncate">{project.name}</span>
                        {chat.projectId === project.id ? (
                          <CheckIcon className="size-3.5" />
                        ) : null}
                      </button>
                    ))}

                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <input
                        value={newProject}
                        onChange={(event) => setNewProject(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && newProject.trim()) {
                            onCreateProjectWithChat(chat.id, newProject.trim());
                            close();
                          }
                        }}
                        placeholder={copy.projectsNew}
                        dir={isArabic ? "rtl" : "ltr"}
                        className="min-w-0 flex-1 rounded-md border border-black/20 bg-white/60 px-2 py-1 text-xs text-slate-900 placeholder:text-slate-600 focus:border-black/40 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={!newProject.trim()}
                        onClick={() => {
                          if (newProject.trim()) {
                            onCreateProjectWithChat(chat.id, newProject.trim());
                            close();
                          }
                        }}
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                      >
                        <PlusIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
