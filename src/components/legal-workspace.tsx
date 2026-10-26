"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import Image from "next/image";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FilePlus2Icon,
  FolderKanbanIcon,
  PanelLeftCloseIcon,
  PanelRightCloseIcon,
  SidebarOpenIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { Assistant } from "@/app/assistant";
import { AccountBar, AuthRequired } from "@/components/auth-status";
import { LibraryManager } from "@/components/library-manager";
import { QueryBuilder, type QueryCriteria } from "@/components/query-builder";
import {
  AllChatsView,
  ChatRow,
  ProjectsView,
  SearchResultsView,
  type ChatActions,
  type ChatEntry,
  type ProjectEntry,
  type SearchDoc,
} from "@/components/workspace-views";
import { isAuthEnabled } from "@/lib/auth-client";
import { getApiAccessToken } from "@/lib/auth-browser";
import { getAppCopy, getConfiguredLocale, getDefaultLocale } from "@/lib/i18n";
import type { AppLocale } from "@/lib/i18n";

const localeStorageKey = "albasti-search-chat-locale";
const panelStorageKey = "albasti-search-chat-panel-open";
const librariesStorageKey = "albasti-search-chat-libraries";
const localThreadIdPrefix = "__LOCALID_";

type View = "chat" | "all-chats" | "projects" | "search-results";

type LibraryOption = {
  label: string;
  count: number;
};

type StoredThreadMessage = {
  id: string;
  role: string;
  text: string;
};

type ActiveThread = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  locale: AppLocale;
  messages: UIMessage[];
};

const toRuntimeMessages = (messages: StoredThreadMessage[]): UIMessage[] =>
  messages
    .filter((message) => message.text?.trim())
    .map((message, index) => ({
      id: message.id || `restored-${index + 1}`,
      role:
        message.role === "assistant" || message.role === "system"
          ? message.role
          : "user",
      parts: [{ type: "text", text: message.text }],
    }));

const extractMessageText = (message: UIMessage) => {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if ("type" in part && part.type === "text" && "text" in part) {
        return typeof part.text === "string" ? part.text : "";
      }
      return "";
    })
    .join("\n")
    .trim();
};

const truncateLabel = (value: string, max = 56) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

const getThreadTitleFromMessages = (messages: UIMessage[], fallback: string) => {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage ? extractMessageText(firstUserMessage) : "";
  return truncateLabel(title || fallback, 56);
};

const getThreadPreviewFromMessages = (messages: UIMessage[]) => {
  const latestText = [...messages].reverse().map(extractMessageText).find(Boolean);
  return truncateLabel(latestText ?? "", 96);
};

const getInitialLocale = (fallback: AppLocale): AppLocale => {
  if (typeof window === "undefined") return fallback;
  const urlLocale = new URLSearchParams(window.location.search).get("locale");
  if (urlLocale === "ar" || urlLocale === "en") return urlLocale;
  const saved = window.localStorage.getItem(localeStorageKey);
  if (saved === "ar" || saved === "en") return saved;
  // An explicit deployment default wins over browser-language guessing.
  if (getConfiguredLocale()) return fallback;
  return window.navigator.language.toLowerCase().startsWith("ar") ? "ar" : fallback;
};

const getInitialPanelOpen = () => {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem(panelStorageKey);
  if (saved === "0") return false;
  return true;
};

const getInitialSelectedLibraries = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(librariesStorageKey);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};

const getResolvedThreadId = (activeThreadId?: string, runtimeThreadId?: string) => {
  if (activeThreadId && !activeThreadId.startsWith(localThreadIdPrefix)) {
    return activeThreadId;
  }
  if (runtimeThreadId && !runtimeThreadId.startsWith(localThreadIdPrefix)) {
    return runtimeThreadId;
  }
  return crypto.randomUUID();
};

export function LegalWorkspace({
  initialLocale = getDefaultLocale(),
}: {
  initialLocale?: AppLocale;
}) {
  const [locale, setLocale] = useState<AppLocale>(initialLocale);
  const [localeHydrated, setLocaleHydrated] = useState(false);
  const [panelOpen, setPanelOpen] = useState(getInitialPanelOpen);
  const [allChats, setAllChats] = useState<ChatEntry[]>([]);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [activeThread, setActiveThread] = useState<ActiveThread | null>(null);
  const [activeThreadVersion, setActiveThreadVersion] = useState(0);
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [libraries, setLibraries] = useState<LibraryOption[]>([]);
  const [selectedLibraries, setSelectedLibraries] = useState<string[]>(
    getInitialSelectedLibraries,
  );
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  // False when access control is on and the signed-in account has not been granted access.
  const [accessAllowed, setAccessAllowed] = useState(true);
  const [view, setView] = useState<View>("chat");
  const [searchDocs, setSearchDocs] = useState<SearchDoc[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  // When a new chat is started from a project, its id rides along on /api/chat so the
  // persisted thread is tagged to that project.
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);

  useEffect(() => {
    setLocale(getInitialLocale(initialLocale));
    setLocaleHydrated(true);
  }, [initialLocale]);

  useEffect(() => {
    if (!localeHydrated) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem(localeStorageKey, locale);
    document.cookie = `${localeStorageKey}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale, localeHydrated]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(panelStorageKey, panelOpen ? "1" : "0");
  }, [panelOpen]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/libraries")
      .then((response) => (response.ok ? response.json() : { libraries: [] }))
      .then((data: { libraries?: LibraryOption[] }) => {
        if (!cancelled && Array.isArray(data.libraries)) {
          setLibraries(
            data.libraries.filter(
              (entry) => typeof entry?.label === "string" && entry.label.trim(),
            ),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(librariesStorageKey, JSON.stringify(selectedLibraries));
  }, [selectedLibraries]);

  useEffect(() => {
    if (!localeHydrated || !isAuthEnabled()) return;
    let cancelled = false;
    (async () => {
      const accessToken = await getApiAccessToken().catch(() => undefined);
      if (!accessToken) return;
      const response = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => undefined);
      if (!response?.ok) return;
      const data = (await response.json()) as { isGlobalAdmin?: boolean; allowed?: boolean };
      if (!cancelled) {
        setIsGlobalAdmin(Boolean(data?.isGlobalAdmin));
        setAccessAllowed(data?.allowed !== false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [localeHydrated]);

  const loadHistory = async (currentLocale: AppLocale) => {
    const accessToken = await getApiAccessToken().catch(() => undefined);
    if (!accessToken) {
      setAllChats([]);
      return;
    }
    const response = await fetch(`/api/history?locale=${currentLocale}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
    if (!response?.ok) {
      setAllChats([]);
      return;
    }
    const data = (await response.json()) as {
      groups?: Array<{ items?: ChatEntry[] }>;
    };
    const flat = (data.groups ?? [])
      .flatMap((group) => group.items ?? [])
      .filter(
        (item) =>
          !!item?.id &&
          !item.id.startsWith(localThreadIdPrefix) &&
          !!item?.title?.trim(),
      );
    setAllChats(flat);
  };

  const loadProjects = async () => {
    const accessToken = await getApiAccessToken().catch(() => undefined);
    if (!accessToken) {
      setProjects([]);
      return;
    }
    const response = await fetch("/api/projects", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
    if (!response?.ok) {
      setProjects([]);
      return;
    }
    const data = (await response.json()) as { projects?: ProjectEntry[] };
    setProjects(Array.isArray(data.projects) ? data.projects : []);
  };

  useEffect(() => {
    if (!localeHydrated) return;
    if (!isAuthEnabled()) {
      setAllChats([]);
      setProjects([]);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      await loadHistory(locale);
      await loadProjects();
      if (cancelled) return;
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [locale, localeHydrated]);

  const copy = getAppCopy(locale);
  const isArabic = locale === "ar";

  const pinnedChats = useMemo(() => allChats.filter((chat) => chat.pinned), [allChats]);
  const recentChats = useMemo(() => allChats.filter((chat) => !chat.pinned), [allChats]);

  const workspaceTitle = truncateLabel(
    activeThread?.title?.trim() || copy.navNewChat,
    52,
  );

  // ---- thread / message handlers ----
  const handleThreadActivity = ({
    threadId,
    messages,
  }: {
    threadId: string;
    messages: UIMessage[];
  }) => {
    setActiveThread((current) => {
      const previous = current?.id === threadId ? current : undefined;
      return {
        id: threadId,
        title: getThreadTitleFromMessages(messages, previous?.title ?? copy.navNewChat),
        preview: getThreadPreviewFromMessages(messages),
        updatedAt: new Date().toISOString(),
        locale,
        messages,
      };
    });
  };

  const handleOpenThread = async (threadId: string) => {
    setView("chat");
    setPendingProjectId(null);
    setLoadingThreadId(threadId);
    try {
      const accessToken = await getApiAccessToken();
      const response = await fetch(`/api/history/${encodeURIComponent(threadId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Failed to load thread ${threadId}.`);
      const data = (await response.json()) as {
        thread?: {
          id: string;
          title: string;
          preview: string;
          updatedAt: string;
          locale: AppLocale;
          messages: StoredThreadMessage[];
        };
      };
      if (!data.thread) throw new Error("Thread payload missing.");
      setActiveThread({
        ...data.thread,
        messages: toRuntimeMessages(data.thread.messages),
      });
      setLocale(data.thread.locale);
      setActiveThreadVersion((current) => current + 1);
    } catch (error) {
      console.error("Failed to restore chat thread", error);
    } finally {
      setLoadingThreadId(null);
    }
  };

  const handleNewChat = () => {
    setView("chat");
    setActiveThread(null);
    setActiveThreadVersion((current) => current + 1);
    setPendingProjectId(null);
  };

  // ---- shared PATCH helper ----
  const patchThreadApi = async (threadId: string, body: Record<string, unknown>) => {
    const accessToken = await getApiAccessToken().catch(() => undefined);
    if (!accessToken) return false;
    const response = await fetch(`/api/history/${encodeURIComponent(threadId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }).catch(() => undefined);
    return Boolean(response?.ok);
  };

  const createProjectApi = async (
    name: string,
    description?: string,
  ): Promise<ProjectEntry | undefined> => {
    const accessToken = await getApiAccessToken().catch(() => undefined);
    if (!accessToken) return undefined;
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name, description }),
    }).catch(() => undefined);
    if (!response?.ok) return undefined;
    const data = (await response.json()) as { project?: ProjectEntry };
    return data.project;
  };

  // ---- chat action handlers ----
  const handlePinToggle = async (id: string, pinned: boolean) => {
    await patchThreadApi(id, { pinned });
    await loadHistory(locale);
  };

  const handleRenameSubmit = async (id: string, title: string | null) => {
    setRenamingId(null);
    if (title && title.trim()) {
      await patchThreadApi(id, { title: title.trim() });
      await loadHistory(locale);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(copy.historyDeleteConfirm)) return;
    const accessToken = await getApiAccessToken().catch(() => undefined);
    if (!accessToken) return;
    const response = await fetch(`/api/history/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
    if (!response?.ok) return;
    if (activeThread?.id === id) handleNewChat();
    await loadHistory(locale);
  };

  // Bulk delete from the multi-select "All chats" view. The confirm happens in
  // the view (one prompt for the whole batch), so no per-item confirm here.
  const handleDeleteMany = async (ids: string[]) => {
    if (ids.length === 0) return;
    const accessToken = await getApiAccessToken().catch(() => undefined);
    if (!accessToken) return;
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/history/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => undefined),
      ),
    );
    if (activeThread?.id && ids.includes(activeThread.id)) handleNewChat();
    await loadHistory(locale);
  };

  const handleSetProject = async (id: string, projectId: string | null) => {
    await patchThreadApi(id, { projectId });
    await loadHistory(locale);
  };

  const handleCreateProjectWithChat = async (id: string, name: string) => {
    const project = await createProjectApi(name);
    if (project) await patchThreadApi(id, { projectId: project.id });
    await loadProjects();
    await loadHistory(locale);
  };

  const handleMove = async (id: string, direction: "up" | "down") => {
    const list = [...pinnedChats];
    const index = list.findIndex((chat) => chat.id === id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= list.length) return;
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
    await Promise.all(
      list.map((chat, position) => patchThreadApi(chat.id, { pinnedOrder: position })),
    );
    await loadHistory(locale);
  };

  const handleCreateProject = async (name: string, description: string) => {
    const project = await createProjectApi(name, description);
    await loadProjects();
    return project;
  };

  const handleUpdateProject = async (
    id: string,
    name: string,
    description: string,
  ) => {
    const accessToken = await getApiAccessToken().catch(() => undefined);
    if (!accessToken) return;
    await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name, description }),
    }).catch(() => undefined);
    await loadProjects();
    await loadHistory(locale);
  };

  // Start a brand-new chat already scoped to a project (composer on the project page).
  const handleStartProjectChat = (projectId: string) => {
    setPendingProjectId(projectId);
    setActiveThread(null);
    setActiveThreadVersion((current) => current + 1);
    setView("chat");
  };

  const handleDeleteProject = async (id: string, deleteChats: boolean) => {
    const accessToken = await getApiAccessToken().catch(() => undefined);
    if (!accessToken) return;
    await fetch(
      `/api/projects/${encodeURIComponent(id)}?deleteChats=${deleteChats}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    ).catch(() => undefined);
    await loadProjects();
    await loadHistory(locale);
  };

  const handleAdvancedSearch = async (criteria: QueryCriteria) => {
    setView("search-results");
    setSearchBusy(true);
    setSearchDocs([]);
    try {
      const accessToken = await getApiAccessToken().catch(() => undefined);
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ ...criteria, libraries: selectedLibraries }),
      });
      if (response.ok) {
        const data = (await response.json()) as { documents?: SearchDoc[] };
        setSearchDocs(Array.isArray(data.documents) ? data.documents : []);
      } else {
        setSearchDocs([]);
      }
    } catch {
      setSearchDocs([]);
    } finally {
      setSearchBusy(false);
    }
  };

  const handleToggleLibrary = (label: string) =>
    setSelectedLibraries((current) =>
      current.includes(label)
        ? current.filter((value) => value !== label)
        : [...current, label],
    );
  const handleClearLibraries = () => setSelectedLibraries([]);

  const actions: ChatActions = {
    onOpen: handleOpenThread,
    onPinToggle: handlePinToggle,
    onRename: (id) => setRenamingId(id),
    onDelete: handleDelete,
    onDeleteMany: handleDeleteMany,
    onSetProject: handleSetProject,
    onCreateProjectWithChat: handleCreateProjectWithChat,
    onMove: handleMove,
  };

  const mainContent: ReactNode =
    view === "all-chats" ? (
      <AllChatsView
        locale={locale}
        isArabic={isArabic}
        chats={allChats}
        projects={projects}
        activeThreadId={activeThread?.id}
        loadingThreadId={loadingThreadId}
        renamingId={renamingId}
        actions={actions}
        onRenameSubmit={handleRenameSubmit}
        onNewChat={handleNewChat}
      />
    ) : view === "projects" ? (
      <ProjectsView
        locale={locale}
        isArabic={isArabic}
        projects={projects}
        chats={allChats}
        activeThreadId={activeThread?.id}
        loadingThreadId={loadingThreadId}
        renamingId={renamingId}
        actions={actions}
        onRenameSubmit={handleRenameSubmit}
        onCreateProject={handleCreateProject}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        onStartProjectChat={handleStartProjectChat}
      />
    ) : view === "search-results" ? (
      <SearchResultsView
        locale={locale}
        isArabic={isArabic}
        documents={searchDocs}
        busy={searchBusy}
      />
    ) : (
      <Assistant locale={locale} />
    );

  const nav = (
    <PrimaryNav
      locale={locale}
      setLocale={setLocale}
      isArabic={isArabic}
      onNewChat={handleNewChat}
      onOpenProjects={() => setView("projects")}
      onViewAll={() => setView("all-chats")}
      pinnedChats={pinnedChats}
      recentChats={recentChats.slice(0, 6)}
      totalChats={allChats.length}
      projects={projects}
      activeThreadId={activeThread?.id}
      loadingThreadId={loadingThreadId}
      renamingId={renamingId}
      actions={actions}
      onRenameSubmit={handleRenameSubmit}
      isGlobalAdmin={isGlobalAdmin}
    />
  );

  const panel = (
    <PanelSlot open={panelOpen}>
      <SupportPanel
        locale={locale}
        isArabic={isArabic}
        libraries={libraries}
        selectedLibraries={selectedLibraries}
        onToggleLibrary={handleToggleLibrary}
        onClearLibraries={handleClearLibraries}
        onAdvancedSearch={handleAdvancedSearch}
        searchBusy={searchBusy}
      />
    </PanelSlot>
  );

  const workspace = (
    <Workspace
      locale={locale}
      setLocale={setLocale}
      isArabic={isArabic}
      panelOpen={panelOpen}
      setPanelOpen={setPanelOpen}
      title={view === "chat" ? workspaceTitle : ""}
    >
      {mainContent}
    </Workspace>
  );

  if (!accessAllowed) {
    return (
      <main
        dir={isArabic ? "rtl" : "ltr"}
        className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900"
      >
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">
            {isArabic ? "لم يتم منح حسابك صلاحية الوصول" : "Your account has not been granted access"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {isArabic
              ? "تواصل مع مسؤول دليل ليضيف حسابك إلى قائمة المستخدمين المسموح لهم."
              : "Ask a Daleel administrator to add your account to the list of permitted users."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <ChatRuntimeShell
      key={`runtime:${activeThreadVersion}`}
      activeThreadId={activeThread?.id}
      initialMessages={activeThread?.messages ?? []}
      onThreadActivity={handleThreadActivity}
      selectedLibraries={selectedLibraries}
      pendingProjectId={pendingProjectId}
    >
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(38,53,139,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(205,170,72,0.18),_transparent_24%),linear-gradient(180deg,_#f6f4f0_0%,_#ece7de_100%)] px-3 py-3 text-slate-900 md:px-4 md:py-4">
        <div
          dir="ltr"
          className="mx-auto flex h-[calc(100vh-1.5rem)] min-h-[calc(100vh-1.5rem)] w-full max-w-[1800px] overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/50 shadow-[0_30px_90px_-45px_rgba(23,35,52,0.45)] backdrop-blur"
        >
          {!isArabic ? (
            <>
              {nav}
              {panel}
              {workspace}
            </>
          ) : (
            <>
              {workspace}
              {panel}
              {nav}
            </>
          )}
        </div>
      </main>
    </ChatRuntimeShell>
  );
}

function ChatRuntimeShell({
  activeThreadId,
  initialMessages,
  onThreadActivity,
  selectedLibraries,
  pendingProjectId,
  children,
}: {
  activeThreadId?: string;
  initialMessages: UIMessage[];
  onThreadActivity: (payload: { threadId: string; messages: UIMessage[] }) => void;
  selectedLibraries: string[];
  pendingProjectId: string | null;
  children: ReactNode;
}) {
  const runtime = useChatRuntime({
    messages: initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: async (options) => {
        const resolvedThreadId = getResolvedThreadId(activeThreadId, options.id);
        onThreadActivity({ threadId: resolvedThreadId, messages: options.messages });
        const accessToken = await getApiAccessToken().catch((error) => {
          console.error("Failed to acquire API access token", error);
          return undefined;
        });
        return {
          api: options.api,
          body: {
            ...(options.body ?? {}),
            id: resolvedThreadId,
            messages: options.messages,
            selectedLibraries,
            ...(pendingProjectId ? { projectId: pendingProjectId } : {}),
            requestMetadata: options.requestMetadata,
          },
          credentials: options.credentials,
          headers: {
            ...(options.headers ?? {}),
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        };
      },
    }),
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

function PanelSlot({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!open}
      className={`hidden overflow-hidden transition-[width,opacity] duration-300 ease-out lg:flex ${
        open ? "w-[330px] opacity-100" : "w-0 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

function Workspace({
  locale,
  setLocale,
  isArabic,
  panelOpen,
  setPanelOpen,
  title,
  children,
}: {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  isArabic: boolean;
  panelOpen: boolean;
  setPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  title: string;
  children: ReactNode;
}) {
  const copy = getAppCopy(locale);
  const CollapseIcon = isArabic ? PanelRightCloseIcon : PanelLeftCloseIcon;
  const ExpandIcon = SidebarOpenIcon;

  return (
    <section
      dir={isArabic ? "rtl" : "ltr"}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,_rgba(255,255,255,0.84),_rgba(244,241,235,0.96))]"
    >
      <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,_rgba(38,53,139,0.08),_rgba(205,170,72,0.14))] px-6 py-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setPanelOpen((current) => !current)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/90 text-slate-700 shadow-sm transition hover:border-[rgba(38,53,139,0.18)] hover:bg-white"
            aria-label={panelOpen ? copy.navCollapsePanel : copy.navExpandPanel}
            title={panelOpen ? copy.navCollapsePanel : copy.navExpandPanel}
          >
            {panelOpen ? (
              <CollapseIcon className="size-4" />
            ) : (
              <ExpandIcon className="size-4" />
            )}
          </button>
          {title ? (
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <AuthRequired locale={locale} setLocale={setLocale}>
          {children}
        </AuthRequired>
      </div>
    </section>
  );
}

function SectionHeading({
  isArabic,
  children,
}: {
  isArabic: boolean;
  children: ReactNode;
}) {
  return (
    <p
      className={`px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45 ${
        isArabic ? "text-right" : "text-left"
      }`}
    >
      {children}
    </p>
  );
}

function PrimaryNav({
  locale,
  setLocale,
  isArabic,
  onNewChat,
  onOpenProjects,
  onViewAll,
  pinnedChats,
  recentChats,
  totalChats,
  projects,
  activeThreadId,
  loadingThreadId,
  renamingId,
  actions,
  onRenameSubmit,
  isGlobalAdmin,
}: {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  isArabic: boolean;
  onNewChat: () => void;
  onOpenProjects: () => void;
  onViewAll: () => void;
  pinnedChats: ChatEntry[];
  recentChats: ChatEntry[];
  totalChats: number;
  projects: ProjectEntry[];
  activeThreadId?: string;
  loadingThreadId?: string | null;
  renamingId: string | null;
  actions: ChatActions;
  onRenameSubmit: (id: string, title: string | null) => void;
  isGlobalAdmin: boolean;
}) {
  const copy = getAppCopy(locale);
  const ViewAllIcon = isArabic ? ChevronLeftIcon : ChevronRightIcon;

  return (
    <aside
      dir={isArabic ? "rtl" : "ltr"}
      className={`flex min-h-0 w-[290px] shrink-0 flex-col bg-sidebar text-sidebar-foreground ${
        isArabic ? "border-l border-sidebar-border" : "border-r border-sidebar-border"
      }`}
    >
      <div className="border-b border-sidebar-border px-5 py-4">
        <Image
          src={isArabic ? "/daleel-logo-ar.png" : "/daleel-logo-en.png"}
          alt="Daleel"
          width={4000}
          height={1835}
          priority
          className="h-auto w-full object-contain"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
        <div className="space-y-1.5">
          <NavButton icon={FilePlus2Icon} label={copy.navNewChat} onClick={onNewChat} primary isArabic={isArabic} />
          <NavButton icon={FolderKanbanIcon} label={copy.navProjects} onClick={onOpenProjects} isArabic={isArabic} />
          {isGlobalAdmin ? <LibraryManager locale={locale} isArabic={isArabic} /> : null}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {pinnedChats.length > 0 ? (
            <section className="mb-3">
              <SectionHeading isArabic={isArabic}>{copy.pinnedHeading}</SectionHeading>
              <div className="space-y-0.5">
                {pinnedChats.map((chat, index) => (
                  <ChatRow
                    key={chat.id}
                    chat={chat}
                    locale={locale}
                    isArabic={isArabic}
                    variant="sidebar"
                    projects={projects}
                    active={chat.id === activeThreadId}
                    loading={loadingThreadId === chat.id}
                    renaming={renamingId === chat.id}
                    canMoveUp={index > 0}
                    canMoveDown={index < pinnedChats.length - 1}
                    actions={actions}
                    onRenameSubmit={onRenameSubmit}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <div className={`flex items-center ${isArabic ? "flex-row-reverse" : ""}`}>
              <div className="flex-1">
                <SectionHeading isArabic={isArabic}>{copy.recentHeading}</SectionHeading>
              </div>
              {totalChats > 0 ? (
                <button
                  type="button"
                  onClick={onViewAll}
                  className={`flex items-center gap-0.5 px-2 pb-1.5 text-[11px] font-medium text-sidebar-primary transition hover:text-sidebar-primary/80 ${
                    isArabic ? "flex-row-reverse" : ""
                  }`}
                >
                  {copy.viewAll}
                  <ViewAllIcon className="size-3.5" />
                </button>
              ) : null}
            </div>

            {recentChats.length > 0 ? (
              <div className="space-y-0.5">
                {recentChats.map((chat) => (
                  <ChatRow
                    key={chat.id}
                    chat={chat}
                    locale={locale}
                    isArabic={isArabic}
                    variant="sidebar"
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
            ) : (
              <p
                className={`px-2 py-2 text-xs text-sidebar-foreground/50 ${
                  isArabic ? "text-right" : "text-left"
                }`}
              >
                {copy.navComingSoon}
              </p>
            )}
          </section>
        </div>

        <div className="mt-3 border-t border-sidebar-border pt-3">
          <AccountBar locale={locale} setLocale={setLocale} />
        </div>
      </div>
    </aside>
  );
}

function SupportPanel({
  locale,
  isArabic,
  libraries,
  selectedLibraries,
  onToggleLibrary,
  onClearLibraries,
  onAdvancedSearch,
  searchBusy,
}: {
  locale: AppLocale;
  isArabic: boolean;
  libraries: LibraryOption[];
  selectedLibraries: string[];
  onToggleLibrary: (label: string) => void;
  onClearLibraries: () => void;
  onAdvancedSearch: (criteria: QueryCriteria) => void;
  searchBusy: boolean;
}) {
  const copy = getAppCopy(locale);

  return (
    <aside
      dir={isArabic ? "rtl" : "ltr"}
      className={`flex min-h-0 w-[330px] shrink-0 flex-col bg-white/72 ${
        isArabic ? "border-l border-slate-200/80" : "border-r border-slate-200/80"
      }`}
    >
      <div className="border-b border-slate-200/80 px-5 py-5">
        <div className={isArabic ? "text-right" : "text-left"}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">
            {copy.supportPanelTitle}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {copy.supportPanelDescription}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <LibraryFilter
          locale={locale}
          isArabic={isArabic}
          libraries={libraries}
          selected={selectedLibraries}
          onToggle={onToggleLibrary}
          onClear={onClearLibraries}
        />
        <QueryBuilder
          locale={locale}
          isArabic={isArabic}
          busy={searchBusy}
          onSearch={onAdvancedSearch}
        />
      </div>
    </aside>
  );
}

function LibraryFilter({
  locale,
  isArabic,
  libraries,
  selected,
  onToggle,
  onClear,
}: {
  locale: AppLocale;
  isArabic: boolean;
  libraries: LibraryOption[];
  selected: string[];
  onToggle: (label: string) => void;
  onClear: () => void;
}) {
  const copy = getAppCopy(locale);

  return (
    <section className="rounded-2xl border border-primary/10 bg-white/70 p-4">
      <div
        className={`flex items-center gap-2 ${
          isArabic ? "flex-row-reverse text-right" : "text-left"
        }`}
      >
        <p className="flex-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">
          {copy.librariesTitle}
        </p>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-primary/80 transition hover:bg-primary/10"
          >
            {copy.librariesClear}
          </button>
        ) : null}
      </div>

      {libraries.length === 0 ? (
        <p className={`mt-3 text-xs text-slate-500 ${isArabic ? "text-right" : "text-left"}`}>
          {copy.librariesEmpty}
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {libraries.map((library) => {
            const checked = selected.includes(library.label);
            return (
              <label
                key={library.label}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${
                  checked
                    ? "border-primary/40 bg-primary/5 text-slate-900"
                    : "border-slate-200/80 bg-white/60 text-slate-700 hover:border-primary/20"
                } ${isArabic ? "flex-row-reverse text-right" : "text-left"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(library.label)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1 truncate">{library.label}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{library.count}</span>
              </label>
            );
          })}
        </div>
      )}

      <p className={`mt-2 text-[11px] text-slate-500 ${isArabic ? "text-right" : "text-left"}`}>
        {selected.length === 0 ? copy.librariesAllHint : copy.librariesScopedHint}
      </p>
    </section>
  );
}

function NavButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
  isArabic,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  primary?: boolean;
  isArabic: boolean;
}) {
  const className = `flex w-full items-center gap-3 rounded-2xl border px-4 py-2.5 transition ${
    primary
      ? "border-[#dab74c] bg-[#dab74c] text-white hover:bg-[#dab74c]/90"
      : "border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground hover:border-sidebar-primary/30 hover:bg-sidebar-accent"
  } ${isArabic ? "flex-row-reverse text-right" : "text-left"}`;

  return (
    <button type="button" onClick={onClick} className={className}>
      <span
        className={`inline-flex size-9 items-center justify-center rounded-2xl ${
          primary ? "bg-black/10" : "bg-white/10"
        }`}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
    </button>
  );
}
