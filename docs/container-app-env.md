# Container App Environment Variables

This file is the deployment companion to `.env.local` and `.env.example`.

Use it when configuring the Azure Container App so you know:

- which values should be stored as **Container App secrets**
- which values should be plain **environment variables**
- which values come from the **BlueRidge Azure subscription**
- which values still come from the **client tenant**

## Important Note

In Azure Container Apps:

- sensitive values should be created under **Container App -> Secrets**
- app settings should then reference secrets with `secretref:<secret-name>`

For example:

- Secret name: `azure-openai-api-key`
- Environment variable value: `secretref:azure-openai-api-key`

## Where To Enter These In Azure

### Secrets

Azure Portal path:

1. Open the Container App
2. Click `Secrets`
3. Add the secret names listed below
4. Save

### Environment variables

Azure Portal path:

1. Open the Container App
2. Click `Revisions and replicas`
3. Click `Create new revision`
4. Open the container settings
5. Add the environment variables listed below
6. Save and create the revision

## Secrets

These should be stored as **Container App secrets**.

| App env var | Suggested secret name | Why it is secret |
| --- | --- | --- |
| `AZURE_OPENAI_API_KEY` | `azure-openai-api-key` | Azure OpenAI key |
| `AZURE_SEARCH_API_KEY` | `azure-search-api-key` | Azure AI Search key |
| `AZURE_ENTRA_CLIENT_SECRET` | `entra-client-secret` | Backend API confidential client secret |
| `AZURE_COSMOS_KEY` | `azure-cosmos-key` | Cosmos DB account key |

## Non-Secret Environment Variables

These should be added as plain **environment variables**.

| App env var | Example / notes | Tenant / source |
| --- | --- | --- |
| `AZURE_OPENAI_BASE_URL` | `https://<resource>.openai.azure.com` | BlueRidge Azure resource |
| `AZURE_OPENAI_RESOURCE_NAME` | Leave blank if using `AZURE_OPENAI_BASE_URL` | BlueRidge Azure resource |
| `AZURE_OPENAI_API_VERSION` | `v1` | App config |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | Example: `gpt-4o` | BlueRidge Azure OpenAI deployment |
| `AZURE_SEARCH_ENDPOINT` | `https://<service>.search.windows.net` | BlueRidge Azure resource |
| `AZURE_SEARCH_INDEX_NAME` | Usually `docs-index` | App/search config |
| `AZURE_SEARCH_SEMANTIC_CONFIGURATION` | Usually `legal-semantic` | App/search config |
| `SHAREPOINT_DRIVE_ID` | SharePoint document library drive ID | Client tenant / SharePoint |
| `NEXT_PUBLIC_AZURE_TENANT_ID` | Client tenant ID | Client tenant |
| `NEXT_PUBLIC_AZURE_CLIENT_ID` | Browser app registration client ID | Client tenant |
| `NEXT_PUBLIC_AZURE_API_SCOPE` | `api://<backend-client-id>/access_as_user` | Client tenant |
| `NEXT_PUBLIC_AZURE_REDIRECT_PATH` | `/` | App config |
| `AZURE_ENTRA_TENANT_ID` | Usually same as `NEXT_PUBLIC_AZURE_TENANT_ID` | Client tenant |
| `AZURE_ENTRA_CLIENT_ID` | Backend API app registration client ID | Client tenant |
| `AZURE_ENTRA_API_AUDIENCE` | Backend client ID or App ID URI | Client tenant |
| `AZURE_ENTRA_API_SCOPE_NAME` | `access_as_user` | Client tenant |
| `AZURE_GRAPH_SCOPES` | `https://graph.microsoft.com/Files.Read.All https://graph.microsoft.com/Sites.Read.All` | Client tenant / Graph |
| `AZURE_COSMOS_ENDPOINT` | Cosmos account endpoint | BlueRidge Azure resource |
| `AZURE_COSMOS_DATABASE` | `albasti-search-chat` | App config |
| `AZURE_COSMOS_THREADS_CONTAINER` | `chatThreads` | App config |
| `AZURE_COSMOS_SESSIONS_CONTAINER` | `sessionLogs` | App config |

## Exact Container App Mapping

Use these exact environment variable values in the Container App.

### Secret-backed values

| Environment variable | Value to enter in Container App |
| --- | --- |
| `AZURE_OPENAI_API_KEY` | `secretref:azure-openai-api-key` |
| `AZURE_SEARCH_API_KEY` | `secretref:azure-search-api-key` |
| `AZURE_ENTRA_CLIENT_SECRET` | `secretref:entra-client-secret` |
| `AZURE_COSMOS_KEY` | `secretref:azure-cosmos-key` |

### Plain values

| Environment variable | Value |
| --- | --- |
| `AZURE_OPENAI_BASE_URL` | your Azure OpenAI base URL |
| `AZURE_OPENAI_RESOURCE_NAME` | blank unless you intentionally use resource-name mode |
| `AZURE_OPENAI_API_VERSION` | `v1` |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | your deployment name |
| `AZURE_SEARCH_ENDPOINT` | your Azure AI Search endpoint |
| `AZURE_SEARCH_INDEX_NAME` | `docs-index` |
| `AZURE_SEARCH_SEMANTIC_CONFIGURATION` | `legal-semantic` |
| `SHAREPOINT_DRIVE_ID` | your SharePoint drive ID |
| `NEXT_PUBLIC_AZURE_TENANT_ID` | client tenant ID |
| `NEXT_PUBLIC_AZURE_CLIENT_ID` | browser app client ID |
| `NEXT_PUBLIC_AZURE_API_SCOPE` | `api://<backend-client-id>/access_as_user` |
| `NEXT_PUBLIC_AZURE_REDIRECT_PATH` | `/` |
| `AZURE_ENTRA_TENANT_ID` | client tenant ID |
| `AZURE_ENTRA_CLIENT_ID` | backend API client ID |
| `AZURE_ENTRA_API_AUDIENCE` | backend API client ID or App ID URI |
| `AZURE_ENTRA_API_SCOPE_NAME` | `access_as_user` |
| `AZURE_GRAPH_SCOPES` | `https://graph.microsoft.com/Files.Read.All https://graph.microsoft.com/Sites.Read.All` |
| `AZURE_COSMOS_ENDPOINT` | your Cosmos endpoint |
| `AZURE_COSMOS_DATABASE` | `albasti-search-chat` |
| `AZURE_COSMOS_THREADS_CONTAINER` | `chatThreads` |
| `AZURE_COSMOS_SESSIONS_CONTAINER` | `sessionLogs` |

## Current Recommended Order

If you want to go live before enabling history, use this order:

1. Add all non-Cosmos values first
2. Deploy and verify sign-in and live document reading
3. Create Cosmos DB
4. Add the Cosmos secret and Cosmos env vars
5. Create a new revision
6. Verify chat history and session logging

## Sanity Check

Before saving the revision, confirm:

- BlueRidge Azure values point to BlueRidge-hosted resources
- `NEXT_PUBLIC_AZURE_*` values point to the **client tenant**
- `AZURE_ENTRA_*` values point to the **client tenant**
- `AZURE_ENTRA_CLIENT_SECRET` is from the **client tenant backend API app**
- `SHAREPOINT_DRIVE_ID` is from the **client SharePoint**
- secret values use `secretref:...` and are not pasted directly into plain env vars
