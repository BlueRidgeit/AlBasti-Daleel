import { createAzure } from "@ai-sdk/azure";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  JSONSchema7,
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { env, hasAzureOpenAIConfig, hasAzureWebSearchConfig } from "@/lib/env";
import {
  getAuthenticatedUserFromRequest,
  acquireGraphTokenOnBehalfOf,
  getRequestBearerToken,
} from "@/lib/auth-server";
import { logSessionEvent, persistChatThread } from "@/lib/chat-history";
import { legalAgentSystemPrompt } from "@/lib/legal-agent";
import {
  buildLanguageDirective,
  resolveConversationLanguage,
} from "@/lib/language-preference";
import { readDocument, validateDocumentAccess } from "@/lib/read-document";
import { searchDocuments } from "@/lib/search-documents";
import { searchPublicWeb } from "@/lib/web-search";
import {
  collectUploadedDocuments,
  readUploadedDocument,
  sanitizeMessagesForModel,
} from "@/lib/uploaded-documents";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const payload = await req.json();
  const {
    id,
    messages,
    tools,
  }: {
    id?: string;
    messages: UIMessage[];
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  } = {
    id: typeof payload?.id === "string" ? payload.id : undefined,
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    tools: payload?.tools,
  };
  const threadId = id ?? crypto.randomUUID();
  const uploadedDocuments = collectUploadedDocuments(messages);
  const modelMessages = sanitizeMessagesForModel(messages, uploadedDocuments);
  const languageDirective = buildLanguageDirective(messages);
  const locale = resolveConversationLanguage(messages);
  const apiAccessToken = getRequestBearerToken(req);
  const authenticatedUser = apiAccessToken
    ? await getAuthenticatedUserFromRequest(req).catch(() => undefined)
    : undefined;
  let graphAccessToken: string | undefined;
  let graphAccessError: string | undefined;

  if (apiAccessToken) {
    graphAccessToken = await acquireGraphTokenOnBehalfOf(apiAccessToken).catch(
      (error) => {
        console.error("Graph OBO acquisition failed", error);
        graphAccessError =
          error instanceof Error
            ? error.message
            : "Unknown OBO token acquisition error.";
        return undefined;
      },
    );
  }

  if (!hasAzureOpenAIConfig) {
    return Response.json(
      {
        error:
          "Azure OpenAI is not configured yet. Set AZURE_OPENAI_API_KEY plus either AZURE_OPENAI_BASE_URL or AZURE_OPENAI_RESOURCE_NAME, and AZURE_OPENAI_CHAT_DEPLOYMENT.",
      },
      { status: 500 },
    );
  }

  const model = createAzure({
    apiKey: env.azureOpenAIApiKey,
    apiVersion: env.azureOpenAIApiVersion,
    ...(env.azureOpenAIBaseUrl
      ? { baseURL: env.azureOpenAIBaseUrl }
      : { resourceName: env.azureOpenAIResourceName }),
  })(env.azureOpenAIChatDeployment!);

  if (authenticatedUser?.objectId) {
    await persistChatThread({
      userId: authenticatedUser.objectId,
      threadId,
      locale,
      messages,
    }).catch((error) => {
      console.error("Failed to persist initial thread snapshot", error);
    });

    await logSessionEvent({
      userId: authenticatedUser.objectId,
      threadId,
      route: "/api/chat",
      event: "chat_request_started",
      detail: messages.at(-1)?.role === "user" ? "User message received." : undefined,
    }).catch((error) => {
      console.error("Failed to write chat session event", error);
    });
  }

  const result = streamText({
    model,
    system: `${legalAgentSystemPrompt}\n\n## Current Conversation Language\n${languageDirective}`,
    messages: await convertToModelMessages(modelMessages),
    tools: {
      ...frontendTools(tools ?? {}),
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
          readDocument(req, itemId, question, graphAccessToken, graphAccessError),
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
            req,
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
                  .describe(
                    "The public web question or search query to look up.",
                  ),
              }),
              execute: async ({ query }) =>
                searchPublicWeb({
                  query,
                  locale,
                }),
            }),
          }
        : {}),
      ...(uploadedDocuments.length > 0
        ? {
            read_uploaded_document: tool({
              description:
                "Read a supported document uploaded in the current chat. Use this when the user asks about an attached file in this conversation.",
              inputSchema: z.object({
                documentId: z
                  .string()
                  .optional()
                  .describe(
                    "The uploaded chat document id when available, such as <message-id>:1.",
                  ),
                filename: z
                  .string()
                  .optional()
                  .describe(
                    "The uploaded filename when the user refers to a specific attached file by name.",
                  ),
                question: z
                  .string()
                  .optional()
                  .describe(
                    "The specific question or angle to focus on while reading the uploaded document.",
                  ),
              }),
              execute: async ({ documentId, filename, question }) =>
                readUploadedDocument(messages, {
                  documentId,
                  filename,
                  question,
                }),
            }),
          }
        : {}),
    },
    stopWhen: stepCountIs(12),
    onFinish: async (event) => {
      if (!authenticatedUser?.objectId) {
        return;
      }

      await persistChatThread({
        userId: authenticatedUser.objectId,
        threadId,
        locale,
        messages,
        assistantText: event.text,
      }).catch((error) => {
        console.error("Failed to persist completed thread snapshot", error);
      });

      await logSessionEvent({
        userId: authenticatedUser.objectId,
        threadId,
        route: "/api/chat",
        event: "chat_request_completed",
        detail: event.finishReason,
      }).catch((error) => {
        console.error("Failed to write completed chat session event", error);
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
