import { env, hasAzureWebSearchConfig } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n";

type WebCitation = {
  title?: string;
  url: string;
};

type ResponsesAnnotation = {
  title?: string;
  url?: string;
};

type ResponsesContent = {
  type?: string;
  text?: string;
  annotations?: ResponsesAnnotation[];
};

type ResponsesOutputItem = {
  type?: string;
  content?: ResponsesContent[];
};

type ResponsesApiPayload = {
  output?: ResponsesOutputItem[];
  output_text?: string;
  error?: {
    message?: string;
  };
};

const contextSizeOptions = new Set(["low", "medium", "high"]);

const dedupeCitations = (citations: WebCitation[]) => {
  const seen = new Set<string>();

  return citations.filter((citation) => {
    if (seen.has(citation.url)) {
      return false;
    }

    seen.add(citation.url);
    return true;
  });
};

const getOutputText = (payload: ResponsesApiPayload) => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text!.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
};

const getCitations = (payload: ResponsesApiPayload) => {
  const citations = (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .flatMap((content) => content.annotations ?? [])
    .filter((annotation): annotation is ResponsesAnnotation & { url: string } =>
      typeof annotation.url === "string" && Boolean(annotation.url),
    )
    .map((annotation) => ({
      title: annotation.title?.trim() || undefined,
      url: annotation.url,
    }));

  return dedupeCitations(citations);
};

export async function searchPublicWeb(args: {
  query: string;
  locale: AppLocale;
}) {
  if (!hasAzureWebSearchConfig) {
    return {
      configured: false,
      query: args.query,
      summary:
        "Azure web search is not configured yet. Set AZURE_OPENAI_WEB_SEARCH_DEPLOYMENT and ensure the Azure OpenAI resource is enabled for web_search_preview.",
      citations: [] satisfies WebCitation[],
    };
  }

  const responsesUrl = `${env.azureOpenAIBaseUrl!}/v1/responses`;
  const languageLabel = args.locale === "ar" ? "Arabic" : "English";
  const contextSize = contextSizeOptions.has(env.azureWebSearchContextSize)
    ? env.azureWebSearchContextSize
    : "medium";

  const response = await fetch(responsesUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": env.azureOpenAIApiKey!,
    },
    body: JSON.stringify({
      model: env.azureOpenAIWebSearchDeployment,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `You are a research helper for ${env.promptProfile === "file-finder" ? "a company document assistant app" : "a legal assistant app"}. Search the public web and return concise factual notes in ${languageLabel}. Focus on trustworthy public sources and keep the result compact. Do not mention internal repositories or SharePoint. Preserve source fidelity because the caller will show citations separately.`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: args.query,
            },
          ],
        },
      ],
      tools: [
        {
          type: "web_search_preview",
          search_context_size: contextSize,
          user_location: {
            type: "approximate",
            country: env.azureWebSearchCountry,
          },
        },
      ],
    }),
  });

  const payload = (await response.json().catch(() => undefined)) as
    | ResponsesApiPayload
    | undefined;

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `Azure web search request failed with status ${response.status}.`;

    throw new Error(message);
  }

  const summary = getOutputText(payload ?? {});
  const citations = getCitations(payload ?? {});

  return {
    configured: true,
    query: args.query,
    summary,
    citations,
  };
}
