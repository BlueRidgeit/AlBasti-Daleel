# Azure Deployment Guide

This app is ready to deploy as a single Next.js container on Azure Container Apps.

## Recommended Azure Shape

- Azure Container Registry
- Azure Container Apps
- Azure AI Search
- Azure OpenAI
- Microsoft Entra ID
- Microsoft Graph
- Azure Cosmos DB for NoSQL (serverless) for chat history and session logs

## Why this shape

The app includes:

- Next.js frontend
- Next.js API routes
- Entra sign-in
- On-Behalf-Of Graph access
- Azure AI Search
- Azure OpenAI
- Cosmos-backed history/session logging

Keeping everything behind one Container App avoids cross-origin complexity between the UI and API routes.

## 1. Create Azure Container Registry

Create an ACR in the same resource group.

Example image name:

- `albastisearchchat`

## 2. Build and push the image

From the app folder:

```powershell
docker build -t <acr-name>.azurecr.io/albastisearchchat:latest .
az acr login --name <acr-name>
docker push <acr-name>.azurecr.io/albastisearchchat:latest
```

## 3. Create Azure Cosmos DB for NoSQL (serverless)

Create a Cosmos DB for NoSQL account with serverless enabled.

Create:

- database: `albasti-search-chat`
- container: `chatThreads`
- container: `sessionLogs`

Use partition key:

- `/userId`

## 4. Create the Container App

Create a Container App and point it to:

- image: `<acr-name>.azurecr.io/albastisearchchat:latest`
- target port: `3000`

Enable ingress and allow HTTPS.

## 5. Add environment variables and secrets

Set the same values you use locally, plus Cosmos:

- `AZURE_OPENAI_BASE_URL`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_CHAT_DEPLOYMENT`
- `AZURE_SEARCH_ENDPOINT`
- `AZURE_SEARCH_API_KEY`
- `AZURE_SEARCH_INDEX_NAME`
- `AZURE_SEARCH_SEMANTIC_CONFIGURATION`
- `SHAREPOINT_DRIVE_ID`
- `NEXT_PUBLIC_AZURE_TENANT_ID`
- `NEXT_PUBLIC_AZURE_CLIENT_ID`
- `NEXT_PUBLIC_AZURE_API_SCOPE`
- `NEXT_PUBLIC_AZURE_REDIRECT_PATH=/`
- `AZURE_ENTRA_TENANT_ID`
- `AZURE_ENTRA_CLIENT_ID`
- `AZURE_ENTRA_CLIENT_SECRET`
- `AZURE_ENTRA_API_AUDIENCE`
- `AZURE_ENTRA_API_SCOPE_NAME=access_as_user`
- `AZURE_GRAPH_SCOPES`
- `AZURE_COSMOS_ENDPOINT`
- `AZURE_COSMOS_KEY`
- `AZURE_COSMOS_DATABASE=albasti-search-chat`
- `AZURE_COSMOS_THREADS_CONTAINER=chatThreads`
- `AZURE_COSMOS_SESSIONS_CONTAINER=sessionLogs`

Store secret values as Container App secrets.

## 6. Update Entra app registration URLs

For the browser app registration:

- add the deployed app URL under SPA redirect URIs
- example:
  - `https://<your-container-app-domain>/`

Also add the same deployed URL as post-logout redirect if needed.

## 7. CORS note

For the current architecture, the frontend and backend are served from the same Next.js app and same domain.

That means:

- there is no separate app-level CORS requirement between the UI and `/api/*`
- the main "URL update" after deployment is the Entra redirect URI / post-logout URI

If you later split frontend and backend into different domains, then configure CORS on the backend for the frontend origin.

## 8. Verify after deployment

Test in this order:

1. Open the deployed URL.
2. Sign in with Entra.
3. Search for a document.
4. Validate document access.
5. Read a SharePoint document live.
6. Open `/settings`.
7. Return to the workspace and confirm locale persists.
8. Start a few chats and confirm history starts appearing in the sidebar.

## 9. Re-deploy updates

For later releases:

```powershell
docker build -t <acr-name>.azurecr.io/albastisearchchat:latest .
docker push <acr-name>.azurecr.io/albastisearchchat:latest
```

Then refresh/revision-restart the Container App as needed.
