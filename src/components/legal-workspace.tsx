"use client";

import { AssistantRuntimeProvider, ThreadPrimitive } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { useMsal } from "@azure/msal-react";
import type { UIMessage } from "ai";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilePlus2Icon,
  FileSearch2Icon,
  HistoryIcon,
  PanelLeftCloseIcon,
  PanelRightCloseIcon,
  ShieldCheckIcon,
  SidebarOpenIcon,
  ScaleIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";

import { Assistant } from "@/app/assistant";
import { AuthRequired, AuthStatus } from "@/components/auth-status";
import { isAuthEnabled } from "@/lib/auth-client";
import { getApiAccessToken } from "@/lib/auth-browser";
import {
  appCopy,
  defaultLocale,
  localeLabels,
  starterPrompts,
} from "@/lib/i18n";
import type { AppLocale } from "@/lib/i18n";

const localeStorageKey = "albasti-search-chat-locale";

type HistoryEntry = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
};

type HistoryGroup = {
  label: string;
  items: HistoryEntry[];
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
      parts: [
        {
          type: "text",
          text: message.text,
        },
      ],
    }));

const getInitialLocale = (): AppLocale => {
  if (typeof window === "undefined") {
    return defaultLocale;
  }

  const urlLocale = new URLSearchParams(window.location.search).get("locale");
  if (urlLocale === "ar" || urlLocale === "en") {
    return urlLocale;
  }

  const saved = window.localStorage.getItem(localeStorageKey);
  if (saved === "ar" || saved === "en") {
    return saved;
  }

  return window.navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en";
};

export function LegalWorkspace() {
  const [locale, setLocale] = useState<AppLocale>(defaultLocale);
  const [panelOpen, setPanelOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [activeThread, setActiveThread] = useState<ActiveThread | null>(null);
  const [activeThreadVersion, setActiveThreadVersion] = useState(0);
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);

  useEffect(() => {
    setLocale(getInitialLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  const loadHistory = async (currentLocale: AppLocale) => {
    const accessToken = await getApiAccessToken().catch(() => undefined);

    if (!accessToken) {
      setHistoryGroups([]);
      return;
    }

    const response = await fetch(`/api/history?locale=${currentLocale}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }).catch(() => undefined);

    if (!response?.ok) {
      setHistoryGroups([]);
      return;
    }

    const data = (await response.json()) as {
      groups?: Array<{
        label?: string;
        items?: HistoryEntry[];
      }>;
    };

    setHistoryGroups(
      (data.groups ?? [])
        .filter((group) => group.label && Array.isArray(group.items))
        .map((group) => ({
          label: group.label!,
          items: (group.items ?? []).filter(
            (item) => !!item?.id && !!item?.title?.trim(),
          ),
        }))
        .filter((group) => group.items.length > 0),
    );
  };

  useEffect(() => {
    if (!isAuthEnabled()) {
      setHistoryGroups([]);
      return;
    }

    let cancelled = false;

    const pollHistory = async () => {
      await loadHistory(locale);
      if (cancelled) {
        return;
      }
    };

    void pollHistory();
    const interval = window.setInterval(() => {
      void pollHistory();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [locale]);

  const copy = appCopy[locale];
  const isArabic = locale === "ar";

  const handleOpenThread = async (threadId: string) => {
    setLoadingThreadId(threadId);
    try {
      const accessToken = await getApiAccessToken();
      const response = await fetch(`/api/history/${encodeURIComponent(threadId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load thread ${threadId}.`);
      }

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

      if (!data.thread) {
        throw new Error("Thread payload missing.");
      }

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
    setActiveThread(null);
    setActiveThreadVersion((current) => current + 1);
  };

  const infoCards = useMemo(
    () => [
      { icon: FileSearch2Icon, ...copy.cards[0] },
      { icon: ScaleIcon, ...copy.cards[1] },
      { icon: ShieldCheckIcon, ...copy.cards[2] },
    ],
    [copy.cards],
  );

  return (
    <ChatRuntimeShell
      key={`${activeThread?.id ?? "new"}:${activeThreadVersion}`}
      activeThreadId={activeThread?.id}
      initialMessages={activeThread?.messages ?? []}
    >
      <main
        className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(38,53,139,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(205,170,72,0.18),_transparent_24%),linear-gradient(180deg,_#f6f4f0_0%,_#ece7de_100%)] px-3 py-3 text-slate-900 md:px-4 md:py-4"
      >
        <div
          dir="ltr"
          className="mx-auto flex h-[calc(100vh-1.5rem)] min-h-[calc(100vh-1.5rem)] w-full max-w-[1800px] overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/50 shadow-[0_30px_90px_-45px_rgba(23,35,52,0.45)] backdrop-blur"
        >
          {!isArabic ? (
            <>
              <PrimaryNav
                locale={locale}
                setLocale={setLocale}
                isArabic={isArabic}
                onNewChat={handleNewChat}
                historyOpen={historyOpen}
                setHistoryOpen={setHistoryOpen}
                historyGroups={historyGroups}
                activeThreadId={activeThread?.id}
                loadingThreadId={loadingThreadId}
                onOpenThread={handleOpenThread}
              />
              {panelOpen ? (
                <SupportPanel
                  locale={locale}
                  isArabic={isArabic}
                  infoCards={infoCards}
                />
              ) : null}
              <Workspace
                locale={locale}
                isArabic={isArabic}
                panelOpen={panelOpen}
                setPanelOpen={setPanelOpen}
              />
            </>
          ) : (
            <>
              <Workspace
                locale={locale}
                isArabic={isArabic}
                panelOpen={panelOpen}
                setPanelOpen={setPanelOpen}
              />
              {panelOpen ? (
                <SupportPanel
                  locale={locale}
                  isArabic={isArabic}
                  infoCards={infoCards}
                />
              ) : null}
              <PrimaryNav
                locale={locale}
                setLocale={setLocale}
                isArabic={isArabic}
                onNewChat={handleNewChat}
                historyOpen={historyOpen}
                setHistoryOpen={setHistoryOpen}
                historyGroups={historyGroups}
                activeThreadId={activeThread?.id}
                loadingThreadId={loadingThreadId}
                onOpenThread={handleOpenThread}
              />
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
  children,
}: {
  activeThreadId?: string;
  initialMessages: UIMessage[];
  children: ReactNode;
}) {
  const runtime = useChatRuntime({
    messages: initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: async (options) => {
        const accessToken = await getApiAccessToken().catch((error) => {
          console.error("Failed to acquire API access token", error);
          return undefined;
        });

        return {
          api: options.api,
          body: {
            ...(options.body ?? {}),
            id: activeThreadId ?? options.id,
            messages: options.messages,
            requestMetadata: options.requestMetadata,
          },
          credentials: options.credentials,
          headers: {
            ...(options.headers ?? {}),
            ...(accessToken
              ? {
                  Authorization: `Bearer ${accessToken}`,
                }
              : {}),
          },
        };
      },
    }),
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

function Workspace({
  locale,
  isArabic,
  panelOpen,
  setPanelOpen,
}: {
  locale: AppLocale;
  isArabic: boolean;
  panelOpen: boolean;
  setPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const copy = appCopy[locale];
  const CollapseIcon = isArabic ? PanelRightCloseIcon : PanelLeftCloseIcon;
  const ExpandIcon = SidebarOpenIcon;

  return (
    <section
      dir={isArabic ? "rtl" : "ltr"}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,_rgba(255,255,255,0.84),_rgba(244,241,235,0.96))]"
    >
      <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,_rgba(38,53,139,0.08),_rgba(205,170,72,0.14))] px-6 py-5">
        <div
          className={`flex flex-col gap-4 ${isArabic ? "text-right" : "text-left"} md:flex-row md:items-start md:justify-between`}
        >
          <div className={`flex items-start gap-3 ${isArabic ? "md:flex-row-reverse" : ""}`}>
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
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">
                {copy.workspaceBadge}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {copy.workspaceTitle}
              </h2>
            </div>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-700">
            {copy.workspaceDescription}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <AuthRequired locale={locale}>
          <Assistant locale={locale} />
        </AuthRequired>
      </div>
    </section>
  );
}

function PrimaryNav({
  locale,
  setLocale,
  isArabic,
  onNewChat,
  historyOpen,
  setHistoryOpen,
  historyGroups,
  activeThreadId,
  loadingThreadId,
  onOpenThread,
}: {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  isArabic: boolean;
  onNewChat: () => void;
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historyGroups: HistoryGroup[];
  activeThreadId?: string;
  loadingThreadId?: string | null;
  onOpenThread: (threadId: string) => void;
}) {
  const copy = appCopy[locale];

  return (
    <aside
      dir={isArabic ? "rtl" : "ltr"}
      className={`flex min-h-0 w-[290px] shrink-0 flex-col bg-sidebar text-sidebar-foreground ${
        isArabic ? "border-l border-sidebar-border" : "border-r border-sidebar-border"
      }`}
    >
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className={`space-y-4 ${isArabic ? "text-right" : "text-left"}`}>
          <div>
            <div className={`flex items-center gap-3 ${isArabic ? "flex-row-reverse justify-end" : ""}`}>
              <Image
                src="/white-logo.png"
                alt="Al Basti"
                width={42}
                height={42}
                priority
                className="h-10 w-10 object-contain"
              />
            </div>
            <h1 className="mt-3 text-[1.9rem] font-semibold leading-tight tracking-tight text-sidebar-foreground">
              {copy.title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-sidebar-foreground/75">
              {copy.description}
            </p>
          </div>

          <div className={`flex ${isArabic ? "justify-end" : "justify-start"}`}>
            <div className="inline-flex rounded-full border border-sidebar-border bg-sidebar-accent p-1 text-xs shadow-sm">
              {(["ar", "en"] as AppLocale[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLocale(value)}
                  className={`rounded-full px-3 py-1.5 transition-colors ${
                    locale === value
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-white/10"
                  }`}
                >
                  {localeLabels[value]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
        <nav className="space-y-3">
          <NavButton
            icon={FilePlus2Icon}
            label={copy.navNewChat}
            onClick={onNewChat}
            primary
            isArabic={isArabic}
          />
          <HistoryTree
            locale={locale}
            isArabic={isArabic}
            historyOpen={historyOpen}
            setHistoryOpen={setHistoryOpen}
            groups={historyGroups}
            activeThreadId={activeThreadId}
            loadingThreadId={loadingThreadId}
            onOpenThread={onOpenThread}
          />
        </nav>

        <section className="mt-4 rounded-2xl border border-sidebar-primary/35 bg-[linear-gradient(180deg,rgba(205,170,72,0.18),rgba(255,255,255,0.08))] p-4">
          <p
            className={`text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-primary/90 ${
              isArabic ? "text-right" : "text-left"
            }`}
          >
            {copy.accountSection}
          </p>
          <div className="mt-3">
            <AuthStatus locale={locale} />
          </div>
        </section>
      </div>
    </aside>
  );
}

function HistoryTree({
  locale,
  isArabic,
  historyOpen,
  setHistoryOpen,
  groups,
  activeThreadId,
  loadingThreadId,
  onOpenThread,
}: {
  locale: AppLocale;
  isArabic: boolean;
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  groups: HistoryGroup[];
  activeThreadId?: string;
  loadingThreadId?: string | null;
  onOpenThread: (threadId: string) => void;
}) {
  const copy = appCopy[locale];
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group, index) => [group.label, index < 3])),
  );
  const ExpandIcon = historyOpen ? ChevronDownIcon : isArabic ? ChevronLeftIcon : ChevronRightIcon;

  useEffect(() => {
    setOpenGroups(
      Object.fromEntries(groups.map((group, index) => [group.label, index < 3])),
    );
  }, [groups]);

  return (
    <div className="min-h-0 overflow-hidden rounded-xl border border-white/8 bg-transparent">
      <button
        type="button"
        onClick={() => setHistoryOpen((current) => !current)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white/6 ${
          isArabic ? "flex-row-reverse text-right" : "text-left"
        }`}
      >
        <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-white/10">
          <HistoryIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-sidebar-foreground">
            {copy.navHistory}
          </span>
          <span className="block text-[11px] text-sidebar-foreground/55">
            {groups.length > 0 ? "" : copy.navComingSoon}
          </span>
        </span>
        <ExpandIcon className="size-4 text-sidebar-primary" />
      </button>

      {historyOpen ? (
        <div className="border-t border-white/8 px-3 pb-2 pt-2">
          {groups.length === 0 ? (
            <div
              className={`px-3 py-3 text-xs text-sidebar-foreground/55 ${
                isArabic ? "text-right" : "text-left"
              }`}
            >
              {copy.navComingSoon}
            </div>
          ) : groups.map((group) => {
            const isOpen = openGroups[group.label] ?? false;
            const GroupIcon = isOpen ? ChevronDownIcon : isArabic ? ChevronLeftIcon : ChevronRightIcon;

            return (
              <div key={group.label} className="last:border-b-0">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((current) => ({
                      ...current,
                      [group.label]: !isOpen,
                    }))
                  }
                  className={`flex w-full items-center gap-2 px-1 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45 transition hover:text-sidebar-foreground/65 ${
                    isArabic ? "flex-row-reverse text-right" : "text-left"
                  }`}
                >
                  <GroupIcon className="size-3.5 shrink-0" />
                  <span className="flex-1">{group.label}</span>
                </button>

                {isOpen ? (
                  <div className="pb-2">
                    {group.items.length > 0 ? (
                      <div className="space-y-0.5">
                        {group.items.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => onOpenThread(entry.id)}
                            className={`w-full rounded-lg px-2.5 py-2 text-sm leading-6 transition ${
                              entry.id === activeThreadId
                                ? "bg-white/10 text-sidebar-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                                : "text-sidebar-foreground/82 hover:bg-white/6"
                            } ${
                              isArabic ? "text-right" : "text-left"
                            }`}
                          >
                            <span className="block truncate font-medium">
                              {entry.title}
                            </span>
                            <span className="block truncate text-xs text-sidebar-foreground/48">
                              {loadingThreadId === entry.id
                                ? locale === "ar"
                                  ? "جاري التحميل..."
                                  : "Loading..."
                                : entry.preview}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div
                        className={`px-3 pb-2 text-xs text-sidebar-foreground/52 ${
                          isArabic ? "text-right" : "text-left"
                        }`}
                      >
                        {copy.navComingSoon}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SupportPanel({
  locale,
  isArabic,
  infoCards,
}: {
  locale: AppLocale;
  isArabic: boolean;
  infoCards: {
    icon: ComponentType<{ className?: string }>;
    title: string;
    description: string;
  }[];
}) {
  const copy = appCopy[locale];

  return (
    <aside
      dir={isArabic ? "rtl" : "ltr"}
      className={`hidden min-h-0 w-[330px] shrink-0 flex-col bg-white/72 lg:flex ${
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
        <div className="grid gap-3">
          {infoCards.map(({ icon, title, description }) => (
            <InfoCard
              key={title}
              icon={icon}
              title={title}
              description={description}
              isArabic={isArabic}
            />
          ))}
        </div>

        <section className="mt-5 rounded-2xl border border-primary/10 bg-[linear-gradient(180deg,rgba(205,170,72,0.12),rgba(255,255,255,0.82))] p-4">
          <p
            className={`text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 ${
              isArabic ? "text-right" : "text-left"
            }`}
          >
            {copy.starterPromptLabel}
          </p>
          <div className="mt-3 space-y-2">
            {starterPrompts[locale].map((prompt) => (
              <StarterPromptButton
                key={prompt}
                prompt={prompt}
                isArabic={isArabic}
              />
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function StarterPromptButton({
  prompt,
  isArabic,
}: {
  prompt: string;
  isArabic: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const authEnabled = mounted ? isAuthEnabled() : false;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        className={`w-full cursor-not-allowed rounded-2xl border border-white bg-white/70 px-3 py-2 text-sm leading-6 text-slate-400 ${
          isArabic ? "text-right" : "text-left"
        }`}
      >
        {prompt}
      </button>
    );
  }

  if (!authEnabled) {
    return (
      <button
        type="button"
        disabled
        className={`w-full cursor-not-allowed rounded-2xl border border-white bg-white/70 px-3 py-2 text-sm leading-6 text-slate-400 ${
          isArabic ? "text-right" : "text-left"
        }`}
      >
        {prompt}
      </button>
    );
  }

  return <AuthenticatedStarterPrompt prompt={prompt} isArabic={isArabic} />;
}

function AuthenticatedStarterPrompt({
  prompt,
  isArabic,
}: {
  prompt: string;
  isArabic: boolean;
}) {
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];

  if (!account) {
    return (
      <button
        type="button"
        disabled
        className={`w-full cursor-not-allowed rounded-2xl border border-white bg-white/70 px-3 py-2 text-sm leading-6 text-slate-400 ${
          isArabic ? "text-right" : "text-left"
        }`}
      >
        {prompt}
      </button>
    );
  }

  return (
    <ThreadPrimitive.Suggestion prompt={prompt} send asChild>
      <button
        type="button"
        className={`w-full rounded-2xl border border-white bg-white px-3 py-2 text-sm leading-6 text-slate-700 transition hover:border-primary/20 hover:bg-white hover:shadow-sm ${
          isArabic ? "text-right" : "text-left"
        }`}
      >
        {prompt}
      </button>
    </ThreadPrimitive.Suggestion>
  );
}

function NavButton({
  icon: Icon,
  label,
  caption,
  onClick,
  href,
  primary = false,
  isArabic,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  caption?: string;
  onClick?: () => void;
  href?: string;
  primary?: boolean;
  isArabic: boolean;
}) {
  const className = `flex w-full items-center gap-3 rounded-2xl border px-4 py-3 transition ${
    primary
      ? "border-sidebar-primary/50 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
      : "border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground hover:border-sidebar-primary/30 hover:bg-sidebar-accent"
  } ${isArabic ? "flex-row-reverse text-right" : "text-left"}`;

  const content = (
    <>
      <span
        className={`inline-flex size-9 items-center justify-center rounded-2xl ${
          primary ? "bg-primary/18" : "bg-white/10"
        }`}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {caption ? (
          <span
            className={`block text-[11px] ${
              primary ? "text-sidebar-primary-foreground/75" : "text-sidebar-foreground/55"
            }`}
          >
            {caption}
          </span>
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function InfoCard({
  icon: Icon,
  title,
  description,
  isArabic,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  isArabic: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
      <div className={`flex items-start gap-3 ${isArabic ? "flex-row-reverse text-right" : "text-left"}`}>
        <div className="rounded-2xl bg-primary p-2.5 text-primary-foreground">
          <Icon className="size-4" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">{description}</p>
        </div>
      </div>
    </div>
  );
}
