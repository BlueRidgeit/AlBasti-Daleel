import { createAzure } from "@ai-sdk/azure";
import {
  convertToModelMessages,
  generateText,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { env, hasAzureOpenAIConfig, hasAzureWebSearchConfig } from "@/lib/env";
import {
  acquireGraphTokenOnBehalfOf,
  getAuthenticatedUserFromRequest,
  getRequestBearerToken,
} from "@/lib/auth-server";
import { logSessionEvent, persistChatThread } from "@/lib/chat-history";
import { legalAgentSystemPrompt } from "@/lib/legal-agent";
import {
  buildLanguageDirective,
  resolveConversationLanguage,
  type ConversationLanguage,
} from "@/lib/language-preference";
import { readDocument, validateDocumentAccess } from "@/lib/read-document";
import { searchDocuments } from "@/lib/search-documents";
import { searchPublicWeb } from "@/lib/web-search";

export const runtime = "nodejs";

type IntegrationMessage = {
  id?: string;
  role?: string;
  content?: string;
};

const toUiMessages = (messages: IntegrationMessage[]) =>
  messages
    .filter((message) => typeof message.content === "string" && message.content.trim())
    .map((message, index) => ({
      id: message.id ?? `message-${index + 1}`,
      role:
        message.role === "assistant" || message.role === "system"
          ? message.role
          : "user",
      parts: [
        {
          type: "text" as const,
          text: message.content!.trim(),
        },
      ],
    })) satisfies UIMessage[];

const getLocale = (
  requestedLocale: unknown,
  messages: UIMessage[],
): ConversationLanguage => {
  if (requestedLocale === "en" || requestedLocale === "ar") {
    return requestedLocale;
  }

  return resolveConversationLanguage(messages);
};

const extractText = (message: UIMessage) =>
  (Array.isArray(message.parts) ? message.parts : [])
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      if ("type" in part && part.type === "text" && "text" in part) {
        return typeof part.text === "string" ? part.text : "";
      }

      return "";
    })
    .join("\n")
    .trim();

export async function POST(request: Request) {
  if (!hasAzureOpenAIConfig) {
    return Response.json(
      {
        error:
          "Azure OpenAI is not configured yet. Set AZURE_OPENAI_API_KEY plus either AZURE_OPENAI_BASE_URL or AZURE_OPENAI_RESOURCE_NAME, and AZURE_OPENAI_CHAT_DEPLOYMENT.",
      },
      { status: 500 },
    );
  }

  const payload = await request.json().catch(() => undefined);
  const integrationMessages = Array.isArray(payload?.messages)
    ? (payload.messages as IntegrationMessage[])
    : [];
  const messages = toUiMessages(integrationMessages);

  if (messages.length === 0) {
    return Response.json(
      { error: "At least one non-empty message is required." },
      { status: 400 },
    );
  }

  const authenticatedUser = await getAuthenticatedUserFromRequest(request).catch(
    () => undefined,
  );

  if (!authenticatedUser?.objectId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const locale = getLocale(payload?.locale, messages);
  const selectedLibraries = Array.isArray(payload?.selectedLibraries)
    ? (payload.selectedLibraries as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : undefined;
  const languageDirective = buildLanguageDirective(messages);
  const threadId =
    typeof payload?.id === "string" && payload.id.trim()
      ? payload.id
      : crypto.randomUUID();

  const apiAccessToken = getRequestBearerToken(request);
  let graphAccessToken: string | undefined;
  let graphAccessError: string | undefined;

  if (apiAccessToken) {
    graphAccessToken = await acquireGraphTokenOnBehalfOf(apiAccessToken).catch(
      (error) => {
        console.error("Graph OBO acquisition failed for integration chat", error);
        graphAccessError =
          error instanceof Error
            ? error.message
            : "Unknown OBO token acquisition error.";
        return undefined;
      },
    );
  }

  await persistChatThread({
    userId: authenticatedUser.objectId,
    threadId,
    locale,
    messages,
  }).catch((error) => {
    console.error("Failed to persist integration thread snapshot", error);
  });

  await logSessionEvent({
    userId: authenticatedUser.objectId,
    threadId,
    route: "/api/integration/chat",
    event: "integration_chat_request_started",
    detail: messages.at(-1)?.role === "user" ? "User message received." : undefined,
  }).catch((error) => {
    console.error("Failed to write integration chat start event", error);
  });

  const model = createAzure({
    apiKey: env.azureOpenAIApiKey,
    apiVersion: env.azureOpenAIApiVersion,
    ...(env.azureOpenAIBaseUrl
      ? { baseURL: env.azureOpenAIBaseUrl }
      : { resourceName: env.azureOpenAIResourceName }),
  })(env.azureOpenAIChatDeployment!);

  try {
    const result = await generateText({
      model,
      system: `${legalAgentSystemPrompt}\n\n## Current Conversation Language\n${languageDirective}`,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(12),
      tools: {
        search_documents: tool({
          description:
            "Search the indexed legal document repository and return matching files, cases, and source links.",
          inputSchema: z.object({
            query: z
              .string()
              .min(1)
              .describe("The user query to search for in the legal repository."),
            top: z
              .number()
              .int()
              .min(1)
              .max(12)
              .optional()
              .describe("Maximum number of distinct documents to return."),
          }),
          execute: async ({ query, top }) =>
            searchDocuments(query, {
              top,
              libraries: selectedLibraries,
            }),
        }),
        read_document: tool({
          description:
            "Read a specific document in more detail. Prefer this tool for summaries or close analysis of a chosen file.",
        inputSchema: z.object({
          itemId: z
            .string()
            .min(1)
            .describe(
              "The exact itemId returned by search_documents for the target file, or a resolvable document reference such as the exact indexed filename.",
            ),
            question: z
              .string()
              .optional()
              .describe("The specific question or angle to focus on while reading."),
          }),
          execute: async ({ itemId, question }) =>
            readDocument(
              request,
              itemId,
              question,
              graphAccessToken,
              graphAccessError,
            ),
        }),
        validate_document_access: tool({
          description:
            "Validate whether the current signed-in user can access a specific SharePoint document.",
        inputSchema: z.object({
          itemId: z
            .string()
            .min(1)
            .describe(
              "The exact itemId returned by search_documents for the target file, or a resolvable document reference such as the exact indexed filename.",
            ),
        }),
          execute: async ({ itemId }) =>
            validateDocumentAccess(
              request,
              itemId,
              graphAccessToken,
              graphAccessError,
            ),
        }),
        ...(hasAzureWebSearchConfig
          ? {
              web_search: tool({
                description:
                  "Search the public web for current or external information. Use this only for public internet questions, not for internal repository or SharePoint document retrieval.",
                inputSchema: z.object({
                  query: z
                    .string()
                    .min(1)
                    .describe("The public web question or search query to look up."),
                }),
                execute: async ({ query }) =>
                  searchPublicWeb({
                    query,
                    locale,
                  }),
              }),
            }
          : {}),
      },
    });

    const assistantText = result.text.trim() || "No response generated.";
    const assistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: assistantText,
      createdAt: new Date().toISOString(),
    };

    await persistChatThread({
      userId: authenticatedUser.objectId,
      threadId,
      locale,
      messages,
      assistantText,
    }).catch((error) => {
      console.error("Failed to persist completed integration thread snapshot", error);
    });

    await logSessionEvent({
      userId: authenticatedUser.objectId,
      threadId,
      route: "/api/integration/chat",
      event: "integration_chat_request_completed",
      detail: result.finishReason,
    }).catch((error) => {
      console.error("Failed to write integration chat complete event", error);
    });

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const latestUserText = latestUserMessage
      ? extractText(latestUserMessage) || "New chat"
      : "New chat";

    return Response.json({
      threadId,
      title:
        latestUserText.length > 72
          ? `${latestUserText.slice(0, 69)}...`
          : latestUserText,
      message: assistantMessage,
    });
  } catch (error) {
    console.error("Integration chat generation failed", error);

    await logSessionEvent({
      userId: authenticatedUser.objectId,
      threadId,
      route: "/api/integration/chat",
      event: "integration_chat_request_failed",
      detail: error instanceof Error ? error.message : "Unknown error",
    }).catch((sessionError) => {
      console.error("Failed to write integration chat failure event", sessionError);
    });

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected integration chat error occurred.",
      },
      { status: 500 },
    );
  }
}
