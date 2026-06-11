const trimToUndefined = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeAzureBaseUrl = (value?: string | null) => {
  const trimmed = trimToUndefined(value);

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.endsWith("/openai")) {
    return trimmed;
  }

  return `${trimmed.replace(/\/$/, "")}/openai`;
};

export const env = {
  azureOpenAIBaseUrl: normalizeAzureBaseUrl(
    process.env.AZURE_OPENAI_BASE_URL ?? process.env.AZURE_OPENAI_ENDPOINT,
  ),
  azureOpenAIResourceName: trimToUndefined(
    process.env.AZURE_OPENAI_RESOURCE_NAME,
  ),
  azureOpenAIApiKey: trimToUndefined(process.env.AZURE_OPENAI_API_KEY),
  azureOpenAIApiVersion:
    trimToUndefined(process.env.AZURE_OPENAI_API_VERSION) ?? "v1",
  azureOpenAIChatDeployment:
    trimToUndefined(process.env.AZURE_OPENAI_CHAT_DEPLOYMENT) ??
    trimToUndefined(process.env.AZURE_OPENAI_DEPLOYMENT),
  azureOpenAIWebSearchDeployment:
    trimToUndefined(process.env.AZURE_OPENAI_WEB_SEARCH_DEPLOYMENT) ??
    trimToUndefined(process.env.AZURE_OPENAI_CHAT_DEPLOYMENT) ??
    trimToUndefined(process.env.AZURE_OPENAI_DEPLOYMENT),
  azureSearchEndpoint: trimToUndefined(process.env.AZURE_SEARCH_ENDPOINT),
  azureSearchApiKey: trimToUndefined(process.env.AZURE_SEARCH_API_KEY),
  azureSearchIndexName:
    trimToUndefined(process.env.AZURE_SEARCH_INDEX_NAME) ??
    trimToUndefined(process.env.AZURE_SEARCH_INDEX) ??
    "docs-index",
  azureSearchSemanticConfiguration:
    trimToUndefined(process.env.AZURE_SEARCH_SEMANTIC_CONFIGURATION) ??
    trimToUndefined(process.env.AZURE_SEARCH_SEMANTIC_CONFIG),
  sharePointDriveId: trimToUndefined(process.env.SHAREPOINT_DRIVE_ID),
  sharePointSiteId: trimToUndefined(process.env.SHAREPOINT_SITE_ID),
  indexerBaseUrl:
    trimToUndefined(process.env.INDEXER_BASE_URL) ?? "http://localhost:7071",
  indexerFunctionKey: trimToUndefined(process.env.INDEXER_FUNCTION_KEY),
  nextPublicAzureTenantId: trimToUndefined(
    process.env.NEXT_PUBLIC_AZURE_TENANT_ID,
  ),
  nextPublicAzureClientId: trimToUndefined(
    process.env.NEXT_PUBLIC_AZURE_CLIENT_ID,
  ),
  nextPublicAzureApiScope: trimToUndefined(
    process.env.NEXT_PUBLIC_AZURE_API_SCOPE,
  ),
  nextPublicAzureRedirectPath:
    trimToUndefined(process.env.NEXT_PUBLIC_AZURE_REDIRECT_PATH) ?? "/",
  azureEntraTenantId:
    trimToUndefined(process.env.AZURE_ENTRA_TENANT_ID) ??
    trimToUndefined(process.env.NEXT_PUBLIC_AZURE_TENANT_ID),
  azureEntraClientId: trimToUndefined(process.env.AZURE_ENTRA_CLIENT_ID),
  azureEntraClientSecret: trimToUndefined(process.env.AZURE_ENTRA_CLIENT_SECRET),
  azureEntraApiAudience: trimToUndefined(process.env.AZURE_ENTRA_API_AUDIENCE),
  azureEntraApiScopeName:
    trimToUndefined(process.env.AZURE_ENTRA_API_SCOPE_NAME) ?? "access_as_user",
  azureGraphScopes:
    trimToUndefined(process.env.AZURE_GRAPH_SCOPES)
      ?.split(/\s+/)
      .filter(Boolean) ?? [
      "https://graph.microsoft.com/Files.Read.All",
      "https://graph.microsoft.com/Sites.Read.All",
    ],
  azureCosmosEndpoint: trimToUndefined(process.env.AZURE_COSMOS_ENDPOINT),
  azureCosmosKey: trimToUndefined(process.env.AZURE_COSMOS_KEY),
  azureCosmosDatabase:
    trimToUndefined(process.env.AZURE_COSMOS_DATABASE) ??
    "albasti-search-chat",
  azureCosmosThreadsContainer:
    trimToUndefined(process.env.AZURE_COSMOS_THREADS_CONTAINER) ??
    "chatThreads",
  azureCosmosSessionsContainer:
    trimToUndefined(process.env.AZURE_COSMOS_SESSIONS_CONTAINER) ??
    "sessionLogs",
  azureWebSearchCountry:
    trimToUndefined(process.env.AZURE_WEB_SEARCH_COUNTRY) ?? "AE",
  azureWebSearchContextSize:
    trimToUndefined(process.env.AZURE_WEB_SEARCH_CONTEXT_SIZE) ?? "medium",
};

export const hasAzureOpenAIConfig = Boolean(
  env.azureOpenAIApiKey &&
    env.azureOpenAIChatDeployment &&
    (env.azureOpenAIBaseUrl || env.azureOpenAIResourceName),
);

export const hasAzureSearchConfig = Boolean(
  env.azureSearchEndpoint && env.azureSearchApiKey && env.azureSearchIndexName,
);

export const hasClientAuthConfig = Boolean(
  env.nextPublicAzureTenantId &&
    env.nextPublicAzureClientId &&
    env.nextPublicAzureApiScope,
);

export const hasServerAuthConfig = Boolean(
  env.azureEntraTenantId &&
    env.azureEntraClientId &&
    env.azureEntraClientSecret &&
    (env.azureEntraApiAudience || env.azureEntraClientId),
);

export const hasAzureCosmosConfig = Boolean(
  env.azureCosmosEndpoint &&
    env.azureCosmosKey &&
    env.azureCosmosDatabase &&
    env.azureCosmosThreadsContainer &&
    env.azureCosmosSessionsContainer,
);

export const hasAzureWebSearchConfig = Boolean(
  env.azureOpenAIApiKey &&
    env.azureOpenAIBaseUrl &&
    env.azureOpenAIWebSearchDeployment,
);
