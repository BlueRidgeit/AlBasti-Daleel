import { CosmosClient } from "@azure/cosmos";
import type { UIMessage } from "ai";

import { cosmosDocStore, postgresDocStore, type DocStore } from "@/lib/doc-store";
import { env, hasAzureCosmosConfig, hasDatabaseConfig } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n";

export type StoredMessage = {
  id: string;
  role: string;
  text: string;
};

type ThreadDocument = {
  id: string;
  userId: string;
  type: "thread";
  locale: AppLocale;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  pinned?: boolean;
  pinnedOrder?: number;
  projectId?: string;
  titleCustom?: boolean;
  messages: StoredMessage[];
};

type ProjectDocument = {
  id: string;
  userId: string;
  type: "project";
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type ThreadHistoryItem = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
  pinned: boolean;
  pinnedOrder?: number;
  projectId?: string;
  projectName?: string;
};

type SessionDocument = {
  id: string;
  userId: string;
  type: "session";
  threadId: string;
  route: string;
  event: string;
  createdAt: string;
  detail?: string;
};

export type HistoryGroup = {
  label: string;
  items: ThreadHistoryItem[];
};

export type RestoredThread = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  locale: AppLocale;
  messages: StoredMessage[];
};

let cosmosClient: CosmosClient | null = null;
let resourcePromise: Promise<{
  threads: DocStore;
  sessions: DocStore;
}> | null = null;

const getCosmosClient = () => {
  if (!hasAzureCosmosConfig) {
    return null;
  }

  if (!cosmosClient) {
    cosmosClient = new CosmosClient({
      endpoint: env.azureCosmosEndpoint!,
      key: env.azureCosmosKey!,
    });
  }

  return cosmosClient;
};

const postgresStores = {
  threads: postgresDocStore("threads"),
  sessions: postgresDocStore("sessions"),
};

const ensureContainers = async () => {
  // Opt-in Postgres store wins when DALEEL_DATABASE_URL is set.
  if (hasDatabaseConfig) {
    return postgresStores;
  }

  if (!hasAzureCosmosConfig) {
    return null;
  }

  if (!resourcePromise) {
    resourcePromise = (async () => {
      const client = getCosmosClient()!;
      const { database } = await client.databases.createIfNotExists({
        id: env.azureCosmosDatabase,
      });

      const { container: threads } = await database.containers.createIfNotExists(
        {
          id: env.azureCosmosThreadsContainer,
          partitionKey: {
            paths: ["/userId"],
          },
        },
      );

      const { container: sessions } =
        await database.containers.createIfNotExists({
          id: env.azureCosmosSessionsContainer,
          partitionKey: {
            paths: ["/userId"],
          },
        });

      return { threads: cosmosDocStore(threads), sessions: cosmosDocStore(sessions) };
    })();
  }

  return resourcePromise;
};

const truncate = (value: string, max = 140) =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`;

const extractMessageText = (message: UIMessage | StoredMessage) => {
  if ("text" in message) {
    return message.text;
  }

  const parts = Array.isArray(message.parts) ? message.parts : [];

  return parts
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      if ("type" in part && part.type === "text" && "text" in part) {
        return typeof part.text === "string" ? part.text : "";
      }

      if ("type" in part && part.type === "tool-call" && "toolName" in part) {
        return `[Tool: ${String(part.toolName)}]`;
      }

      return "";
    })
    .join("\n")
    .trim();
};

const toStoredMessages = (
  messages: UIMessage[],
  assistantText?: string,
): StoredMessage[] => {
  const stored = messages
    .map((message, index) => ({
      id: message.id ?? `message-${index + 1}`,
      role: message.role,
      text: extractMessageText(message),
    }))
    .filter((message) => message.text);

  if (assistantText?.trim()) {
    const lastStored = stored.at(-1);
    if (!lastStored || lastStored.role !== "assistant" || lastStored.text !== assistantText.trim()) {
      stored.push({
        id: `assistant-${stored.length + 1}`,
        role: "assistant",
        text: assistantText.trim(),
      });
    }
  }

  return stored;
};

const getThreadTitle = (messages: StoredMessage[]) => {
  const firstUserMessage =
    messages.find((message) => message.role === "user")?.text ??
    messages[0]?.text ??
    "Untitled chat";

  return truncate(firstUserMessage, 72);
};

const getThreadPreview = (messages: StoredMessage[]) => {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.text ??
    messages.at(-1)?.text ??
    "";

  return truncate(latestUserMessage, 120);
};

const getLocalizedBucket = (date: Date, locale: AppLocale) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000,
  );

  if (diffDays <= 0) {
    return locale === "ar" ? "اليوم" : "Today";
  }

  if (diffDays === 1) {
    return locale === "ar" ? "أمس" : "Yesterday";
  }

  if (diffDays <= 7) {
    return locale === "ar" ? "الأسبوع الماضي" : "Last week";
  }

  if (diffDays <= 31) {
    return locale === "ar" ? "الشهر الماضي" : "Last month";
  }

  return locale === "ar" ? "منذ فترة طويلة" : "Long time ago";
};

export const historyStorageEnabled = hasAzureCosmosConfig || hasDatabaseConfig;

export async function persistChatThread(args: {
  userId: string;
  threadId: string;
  locale: AppLocale;
  messages: UIMessage[];
  assistantText?: string;
  projectId?: string;
}) {
  const resources = await ensureContainers();
  if (!resources) {
    return;
  }

  const { threads } = resources;
  const storedMessages = toStoredMessages(args.messages, args.assistantText);
  const prev = await threads.read<ThreadDocument>(args.threadId, args.userId);
  const createdAt = prev?.createdAt ?? new Date().toISOString();
  const updatedAt = new Date().toISOString();

  const document: ThreadDocument = {
    id: args.threadId,
    userId: args.userId,
    type: "thread",
    locale: args.locale,
    // A user-renamed title sticks; otherwise it tracks the first message.
    title: prev?.titleCustom ? prev.title : getThreadTitle(storedMessages),
    preview: getThreadPreview(storedMessages),
    createdAt,
    updatedAt,
    messageCount: storedMessages.length,
    // Persist overwrites the whole doc, so carry forward pin/order/project/rename state.
    pinned: prev?.pinned ?? false,
    pinnedOrder: prev?.pinnedOrder,
    // A project passed on the request (new chat started from a project) takes effect; otherwise preserved.
    projectId: args.projectId ?? prev?.projectId,
    titleCustom: prev?.titleCustom ?? false,
    messages: storedMessages,
  };

  await threads.upsert(document, args.userId);
}

// Read a thread doc, apply a change, upsert it. Returns false if the thread is missing.
async function patchThread(
  userId: string,
  threadId: string,
  apply: (doc: ThreadDocument) => ThreadDocument,
) {
  const resources = await ensureContainers();
  if (!resources) {
    return false;
  }

  const existing = await resources.threads.read<ThreadDocument>(threadId, userId);

  if (!existing) {
    return false;
  }

  await resources.threads.upsert(apply(existing), userId);
  return true;
}

export async function setThreadPinned(args: {
  userId: string;
  threadId: string;
  pinned: boolean;
}) {
  // Newly pinned chats float to the top of the Pinned group (smallest order, sorted asc).
  return patchThread(args.userId, args.threadId, (doc) => ({
    ...doc,
    pinned: args.pinned,
    pinnedOrder: args.pinned ? -Date.now() : undefined,
  }));
}

export async function renameThread(args: {
  userId: string;
  threadId: string;
  title: string;
}) {
  const title = args.title.trim();
  if (!title) {
    return false;
  }
  return patchThread(args.userId, args.threadId, (doc) => ({
    ...doc,
    title: title.slice(0, 120),
    titleCustom: true,
  }));
}

export async function setThreadProject(args: {
  userId: string;
  threadId: string;
  projectId: string | null;
}) {
  return patchThread(args.userId, args.threadId, (doc) => {
    const next = { ...doc };
    if (args.projectId) {
      next.projectId = args.projectId;
    } else {
      delete next.projectId;
    }
    return next;
  });
}

export async function setThreadOrder(args: {
  userId: string;
  threadId: string;
  pinnedOrder: number;
}) {
  return patchThread(args.userId, args.threadId, (doc) => ({
    ...doc,
    pinnedOrder: args.pinnedOrder,
  }));
}

export async function logSessionEvent(args: {
  userId: string;
  threadId: string;
  route: string;
  event: string;
  detail?: string;
}) {
  const resources = await ensureContainers();
  if (!resources) {
    return;
  }

  const document: SessionDocument = {
    id: crypto.randomUUID(),
    userId: args.userId,
    type: "session",
    threadId: args.threadId,
    route: args.route,
    event: args.event,
    detail: args.detail,
    createdAt: new Date().toISOString(),
  };

  await resources.sessions.upsert(document, args.userId);
}

async function queryThreadDocumentsForUser(userId: string) {
  const resources = await ensureContainers();
  if (!resources) {
    return [] satisfies ThreadDocument[];
  }

  return resources.threads.list<ThreadDocument>(userId, "thread");
}

const toRestoredThread = (thread: ThreadDocument) =>
  ({
    id: thread.id,
    title: thread.title,
    preview: thread.preview,
    updatedAt: thread.updatedAt,
    locale: thread.locale,
    messages: thread.messages,
  }) satisfies RestoredThread;

export async function listThreadHistory(args: {
  userId: string;
  locale: AppLocale;
}) {
  const [threads, projects] = await Promise.all([
    queryThreadDocumentsForUser(args.userId),
    listProjects(args.userId),
  ]);
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  const sortedThreads = [...threads].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  const pinnedItems: ThreadHistoryItem[] = [];
  const grouped = new Map<string, ThreadHistoryItem[]>();

  for (const thread of sortedThreads) {
    const item: ThreadHistoryItem = {
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt,
      preview: thread.preview,
      pinned: thread.pinned ?? false,
      pinnedOrder: thread.pinnedOrder,
      projectId: thread.projectId,
      projectName: thread.projectId
        ? projectNameById.get(thread.projectId)
        : undefined,
    };

    // Pinned chats float to a dedicated group at the top, regardless of age.
    if (thread.pinned) {
      pinnedItems.push(item);
      continue;
    }

    const label = getLocalizedBucket(new Date(thread.updatedAt), args.locale);
    const items = grouped.get(label) ?? [];
    items.push(item);
    grouped.set(label, items);
  }

  // Manual pin order (asc); newly pinned chats use a small (negative) order to sit on top.
  pinnedItems.sort((a, b) => (a.pinnedOrder ?? 0) - (b.pinnedOrder ?? 0));

  const dateGroups = Array.from(grouped.entries()).map(([label, items]) => ({
    label,
    items,
  }));

  const pinnedLabel = args.locale === "ar" ? "المثبتة" : "Pinned";
  return pinnedItems.length > 0
    ? [{ label: pinnedLabel, items: pinnedItems }, ...dateGroups]
    : dateGroups;
}

export async function getThreadById(args: {
  userId: string;
  threadId: string;
}) {
  const threads = await queryThreadDocumentsForUser(args.userId);
  const thread = threads.find((entry) => entry.id === args.threadId);

  if (!thread) {
    return undefined;
  }

  return toRestoredThread(thread);
}

export async function deleteThreadById(args: {
  userId: string;
  threadId: string;
}) {
  const resources = await ensureContainers();
  if (!resources) {
    return false;
  }

  const existing = await getThreadById(args);

  if (!existing) {
    return false;
  }

  await resources.threads.remove(args.threadId, args.userId);
  return true;
}

// ---------------------------------------------------------------------------
// Projects (stored as type:"project" docs in the same per-user threads container)
// ---------------------------------------------------------------------------

const toProjectSummary = (doc: ProjectDocument): ProjectSummary => ({
  id: doc.id,
  name: doc.name,
  description: doc.description,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const resources = await ensureContainers();
  if (!resources) {
    return [];
  }

  const projects = await resources.threads.list<ProjectDocument>(userId, "project");

  return projects
    .map(toProjectSummary)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createProject(
  userId: string,
  name: string,
  description?: string,
) {
  const resources = await ensureContainers();
  if (!resources) {
    return undefined;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return undefined;
  }

  const now = new Date().toISOString();
  const desc = description?.trim();
  const doc: ProjectDocument = {
    id: crypto.randomUUID(),
    userId,
    type: "project",
    name: trimmed.slice(0, 80),
    description: desc ? desc.slice(0, 500) : undefined,
    createdAt: now,
    updatedAt: now,
  };

  await resources.threads.upsert(doc, userId);
  return toProjectSummary(doc);
}

export async function updateProject(
  userId: string,
  projectId: string,
  fields: { name?: string; description?: string },
) {
  const resources = await ensureContainers();
  if (!resources) {
    return false;
  }

  const existing = await resources.threads.read<ProjectDocument>(projectId, userId);

  if (!existing || existing.type !== "project") {
    return false;
  }

  const next: ProjectDocument = {
    ...existing,
    updatedAt: new Date().toISOString(),
  };
  if (fields.name?.trim()) {
    next.name = fields.name.trim().slice(0, 80);
  }
  if (fields.description !== undefined) {
    const desc = fields.description.trim();
    if (desc) {
      next.description = desc.slice(0, 500);
    } else {
      delete next.description;
    }
  }

  await resources.threads.upsert(next, userId);
  return true;
}

export async function deleteProject(
  userId: string,
  projectId: string,
  deleteChats = false,
) {
  const resources = await ensureContainers();
  if (!resources) {
    return false;
  }

  const existing = await resources.threads.read<ProjectDocument>(projectId, userId);

  if (!existing || existing.type !== "project") {
    return false;
  }

  // Either delete the project's chats too, or just detach them (keep, unassigned).
  const members = await queryThreadDocumentsForUser(userId);
  for (const thread of members) {
    if (thread.projectId !== projectId) {
      continue;
    }
    if (deleteChats) {
      await resources.threads.remove(thread.id, userId).catch(() => {});
    } else {
      const next = { ...thread };
      delete next.projectId;
      await resources.threads.upsert(next, userId);
    }
  }

  await resources.threads.remove(projectId, userId);
  return true;
}
