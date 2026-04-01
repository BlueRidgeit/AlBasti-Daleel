import { CosmosClient, type Container } from "@azure/cosmos";
import type { UIMessage } from "ai";

import { env, hasAzureCosmosConfig } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n";

type StoredMessage = {
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
  messages: StoredMessage[];
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
  items: Array<{
    id: string;
    title: string;
    updatedAt: string;
    preview: string;
  }>;
};

let cosmosClient: CosmosClient | null = null;
let resourcePromise: Promise<{
  threads: Container;
  sessions: Container;
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

const ensureContainers = async () => {
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

      return { threads, sessions };
    })();
  }

  return resourcePromise;
};

const truncate = (value: string, max = 140) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

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

export const historyStorageEnabled = hasAzureCosmosConfig;

export async function persistChatThread(args: {
  userId: string;
  threadId: string;
  locale: AppLocale;
  messages: UIMessage[];
  assistantText?: string;
}) {
  const resources = await ensureContainers();
  if (!resources) {
    return;
  }

  const { threads } = resources;
  const storedMessages = toStoredMessages(args.messages, args.assistantText);
  const existing = await threads.item(args.threadId, args.userId).read<ThreadDocument>().catch(() => undefined);
  const createdAt = existing?.resource?.createdAt ?? new Date().toISOString();
  const updatedAt = new Date().toISOString();

  const document: ThreadDocument = {
    id: args.threadId,
    userId: args.userId,
    type: "thread",
    locale: args.locale,
    title: getThreadTitle(storedMessages),
    preview: getThreadPreview(storedMessages),
    createdAt,
    updatedAt,
    messageCount: storedMessages.length,
    messages: storedMessages,
  };

  await threads.items.upsert(document);
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

  await resources.sessions.items.create(document);
}

export async function listThreadHistory(args: {
  userId: string;
  locale: AppLocale;
}) {
  const resources = await ensureContainers();
  if (!resources) {
    return [] satisfies HistoryGroup[];
  }

  const { resources: threads } = await resources.threads.items
    .query<ThreadDocument>(
      {
        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'thread'",
        parameters: [{ name: "@userId", value: args.userId }],
      },
      {
        partitionKey: args.userId,
      },
    )
    .fetchAll();

  const sortedThreads = [...threads].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  const grouped = new Map<string, HistoryGroup["items"]>();

  for (const thread of sortedThreads) {
    const label = getLocalizedBucket(new Date(thread.updatedAt), args.locale);
    const items = grouped.get(label) ?? [];
    items.push({
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt,
      preview: thread.preview,
    });
    grouped.set(label, items);
  }

  return Array.from(grouped.entries()).map(([label, items]) => ({
    label,
    items,
  }));
}
