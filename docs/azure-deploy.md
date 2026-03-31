# Azure Deployment Guide

This guide is written for the current Azure Portal flow and for this exact app:

- Next.js frontend
- Next.js API routes
- Microsoft Entra sign-in
- On-Behalf-Of Graph access
- Azure AI Search
- Azure OpenAI
- Azure Container Apps
- Azure Cosmos DB for NoSQL for chat history and session logs

## Recommended Azure Shape

Keep these in the same Azure region and usually the same resource group:

- Azure Container Registry
- Azure Container Apps Environment
- Azure Container App
- Azure Cosmos DB for NoSQL

Keep these existing services as they already are:

- Azure AI Search
- Azure OpenAI
- Microsoft Entra app registrations
- SharePoint / Microsoft Graph access

## Important Architecture Note

For this app, the frontend and backend are deployed together in one Azure Container App.

That means:

- you usually do **not** need a separate app CORS rule for the browser to call `/api/*`
- the important production URL update is the **Microsoft Entra redirect URI**

## Tenant and Subscription Split

For this project, use a split model.

### BlueRidge tenant / subscription

Use BlueRidge Azure for the hosted infrastructure because that is where the subscription exists:

- Azure Container Registry
- Azure Container Apps Environment
- Azure Container App
- Azure Cosmos DB for NoSQL
- GitHub deployment identity for CI/CD

### Client tenant

Keep user identity and SharePoint access in the client tenant:

- browser app registration
- backend API app registration
- Microsoft Graph delegated permissions
- `access_as_user` exposed API scope
- SharePoint / Microsoft Graph consent
- actual lawyer sign-in

### Why this split works

The app can be hosted in BlueRidge Azure while still authenticating users against the client tenant and reading SharePoint through On-Behalf-Of in the client tenant.

### What this means for configuration

- Azure resource creation steps in this guide are done in the **BlueRidge tenant/subscription**.
- Microsoft Entra sign-in and Graph configuration steps are done in the **client tenant**.
- The GitHub OIDC deployment identity is created in the **BlueRidge tenant** because it deploys Azure resources there.
- The app environment variables such as `NEXT_PUBLIC_AZURE_TENANT_ID`, `NEXT_PUBLIC_AZURE_CLIENT_ID`, and `AZURE_ENTRA_*` should still point to the **client tenant** values.

## Before You Start

1. Rotate any secrets that were pasted in chat or logs before going live.
2. Make sure the GitHub repo already contains the app code and workflow.
3. Make sure you know these values:
   - Azure subscription
   - Azure tenant ID for BlueRidge hosting
   - Azure tenant ID for the client identity tenant
   - browser app registration client ID from the client tenant
   - backend API app registration client ID from the client tenant
   - backend API client secret from the client tenant
   - Azure OpenAI endpoint and key
   - Azure AI Search endpoint and key
   - SharePoint drive ID

## Step 1: Create or Choose a Resource Group

In the Azure portal:

1. Sign into the **BlueRidge tenant/subscription**.
2. Search for `Resource groups`.
3. Click `Create`.
4. Select your subscription.
5. Resource group name: use something like `rg-albasti-search-chat-dev`.
6. Region: use the same region you plan to use for Container Apps.
7. Click `Review + create`.
8. Click `Create`.

If you already created a resource group for this app, reuse it.

## Step 2: Create Azure Container Registry

In the Azure portal:

1. Stay signed into the **BlueRidge tenant/subscription**.
2. Search for `Container registries`.
3. Click `Create`.
4. Fill in:
   - Subscription: your BlueRidge subscription
   - Resource group: the app resource group
   - Registry name: globally unique, for example `albastisearchacr`
   - Location: same region as the app
   - Pricing plan: `Standard` is the safest default for this setup
5. For `Domain name label scope`, use `Tenant Reuse` unless your security team wants something else.
6. For `Role assignment permissions mode`, keep the default unless your team has a specific policy.
7. Click `Review + create`.
8. Click `Create`.
9. After deployment, open the registry and note the `Login server`, for example `albastisearchacr.azurecr.io`.

## Step 3: Bootstrap One Image into ACR

Do this once so the Container App can be created against a real image that listens on port `3000`.

Use an Azure-side build so you do not need local Docker installed.

From the project folder:

```powershell
az login
az acr build --registry <acr-name> --image albastisearchchat:bootstrap .
```

Replace:

- `<acr-name>` with the registry resource name, for example `albastisearchacr`

This command uploads the current project folder to Azure Container Registry, builds the image in Azure, and stores it as:

- `<acr-name>.azurecr.io/albastisearchchat:bootstrap`

## Step 4: Create the Azure Container App

In the Azure portal:

1. Stay in the **BlueRidge tenant/subscription**.
2. Search for `Container Apps`.
3. Click `Create`.

### Basics tab

4. Fill in:
   - Subscription: your BlueRidge subscription
   - Resource group: the app resource group
   - Container app name: for example `albasti-search-chat`
   - Deployment source: `Container image`
5. For `Container Apps environment`:
   - if you already created one, select it
   - otherwise click `Create new`

### If you click Create new for the environment

6. In the environment window, set:
   - Environment name: for example `albasti-search-env`
   - Region: same region as your resource group
7. In the monitoring/logging section, create or select a Log Analytics workspace.
8. Save the environment.

### Container tab / App settings tab

The exact tab label can vary slightly in the portal, but this is where the image and ingress are configured.

9. Turn off any quickstart image option if it is enabled.
10. Set:
   - Image source: `Azure Container Registry`
   - Registry: your ACR
   - Image: `albastisearchchat`
   - Tag: `bootstrap`
11. Set ingress:
   - Ingress: `Enabled`
   - Ingress traffic: `External`
   - Target port: `3000`
12. Leave scaling/resources at defaults unless you want to tune them now.
13. Click `Review + create`.
14. Click `Create`.

## Step 5: Enable Managed Identity on the Container App

This is important because the Container App should pull private images from ACR using managed identity instead of stored registry credentials.

In the Azure portal:

1. Open the new Container App.
2. In the left menu, click `Identity`.
3. Under `System assigned`, switch it to `On`.
4. Click `Save`.

## Step 6: Give the Container App Permission to Pull from ACR

In the Azure portal:

1. Open the Container App.
2. Go back to `Identity`.
3. Open the `Azure role assignments` area if shown.
4. If the `AcrPull` role is already present for your registry, you are done.
5. If not, go to the ACR resource.
6. In the ACR, open `Access control (IAM)`.
7. Click `Add role assignment`.
8. Role: `AcrPull`.
9. Assign access to: `Managed identity`.
10. Select the Container App system-assigned identity.
11. Save.

## Step 7: Tell the Container App to Use Managed Identity for ACR Pulls

In the Azure portal:

1. Open the Container App.
2. Go to `Containers`.
3. Click `Edit and deploy`.
4. Open the container entry.
5. Confirm or set:
   - Image source: `Azure Container Registry`
   - Registry: your ACR
   - Image: `albastisearchchat`
   - Tag: `bootstrap`
   - Authentication type: `Managed identity`
   - Managed identity: `System assigned`
6. Save.
7. Create the new revision.

If the portal automatically added `AcrPull`, that is fine. If not, complete Step 6 manually.

## Step 8: Add Secrets to the Container App

Use Container App secrets for sensitive values.

In the Azure portal:

1. Open the Container App.
2. In the left menu, click `Secrets`.
3. Add secrets for values such as:
   - `azure-openai-api-key`
   - `azure-search-api-key`
   - `entra-client-secret`
4. You can also add Cosmos secrets later when you enable history.
5. Save.

## Step 9: Add Environment Variables to the Container App

Environment variables are applied through a revision.

In the Azure portal:

1. Open the Container App.
2. Go to `Revisions and replicas`.
3. Click `Create new revision`.
4. Open the current container for editing.
5. In `Environment variables`, add these values.

Use manual values for non-secret values:

- `AZURE_OPENAI_BASE_URL`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_CHAT_DEPLOYMENT`
- `AZURE_SEARCH_ENDPOINT`
- `AZURE_SEARCH_INDEX_NAME`
- `AZURE_SEARCH_SEMANTIC_CONFIGURATION`
- `SHAREPOINT_DRIVE_ID`
- `NEXT_PUBLIC_AZURE_TENANT_ID`
- `NEXT_PUBLIC_AZURE_CLIENT_ID`
- `NEXT_PUBLIC_AZURE_API_SCOPE`
- `NEXT_PUBLIC_AZURE_REDIRECT_PATH=/`
- `AZURE_ENTRA_TENANT_ID`
- `AZURE_ENTRA_CLIENT_ID`
- `AZURE_ENTRA_API_AUDIENCE`
- `AZURE_ENTRA_API_SCOPE_NAME=access_as_user`
- `AZURE_GRAPH_SCOPES`

Use `secretref:` style references for secret-backed values:

- `AZURE_OPENAI_API_KEY=secretref:azure-openai-api-key`
- `AZURE_SEARCH_API_KEY=secretref:azure-search-api-key`
- `AZURE_ENTRA_CLIENT_SECRET=secretref:entra-client-secret`

Important:

- the Azure resources are in the **BlueRidge subscription**
- the `NEXT_PUBLIC_AZURE_*` and `AZURE_ENTRA_*` identity values still point to the **client tenant**

Save and create the new revision.

## Step 10: Update Microsoft Entra Redirect URIs

This step is done in the **client tenant**, not the BlueRidge tenant.

For the browser app registration:

1. Switch to the **client tenant** in the portal.
2. Open `Microsoft Entra ID`.
3. Go to `App registrations`.
4. Open the browser app registration.
5. Click `Authentication`.
6. Under `Platform configurations`, make sure the SPA platform exists.
7. Add the production redirect URI:
   - `https://<your-container-app-url>/`
8. If you use logout return flow, also add the same production URL as the front-channel or post-logout URL where appropriate.
9. Save.

Keep the local redirect URI too:

- `http://localhost:3000/`

## Step 11: Create the GitHub Deployment Identity with OIDC

This is for GitHub Actions to deploy to Azure without storing a password.

This step is done in the **BlueRidge tenant** because the workflow deploys Azure resources there.

In Azure portal:

1. Switch to the **BlueRidge tenant**.
2. Open `Microsoft Entra ID`.
3. Go to `App registrations`.
4. Click `New registration`.
5. Name it something like `github-albasti-search-deploy`.
6. Leave the default single-tenant setting.
7. Register the app.
8. Open the new app registration.
9. Copy:
   - `Application (client) ID`
   - `Directory (tenant) ID`
10. Open `Certificates & secrets`.
11. Click `Federated credentials`.
12. Click `Add credential`.
13. Scenario: `GitHub Actions deploying Azure resources`.
14. Fill in:
   - Organization: `BlueRidgeIT-Al-Basti`
   - Repository: `AlBastiSearch`
   - Entity type: `Branch`
   - GitHub branch name: `main`
   - Name: for example `github-main`
15. Save.

## Step 12: Give the GitHub Deployment Identity Access in Azure

You need the GitHub deployment identity to be able to deploy the Container App and push to ACR.

This step is also done in the **BlueRidge subscription**.

Minimum practical setup:

1. Open the resource group for this app.
2. Go to `Access control (IAM)`.
3. Add role assignment:
   - Role: `Contributor`
   - Assign access to: `User, group, or service principal`
   - Select the `github-albasti-search-deploy` app
4. Save.

Then also grant ACR push access:

5. Open the Azure Container Registry.
6. Go to `Access control (IAM)`.
7. Add role assignment:
   - Role: `AcrPush`
   - Assign access to: `User, group, or service principal`
   - Select the same `github-albasti-search-deploy` app
8. Save.

## Step 13: Add GitHub Actions Secrets

In GitHub:

1. Open the repository.
2. Go to `Settings`.
3. Go to `Secrets and variables` > `Actions`.
4. Add these repository secrets:
   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`
   - `AZURE_CONTAINER_APP_NAME`
   - `AZURE_RESOURCE_GROUP`
   - `AZURE_ACR_NAME`

Use these values:

- `AZURE_CLIENT_ID`: client ID of `github-albasti-search-deploy` from the **BlueRidge tenant**
- `AZURE_TENANT_ID`: BlueRidge Azure tenant ID
- `AZURE_SUBSCRIPTION_ID`: BlueRidge subscription ID
- `AZURE_CONTAINER_APP_NAME`: your Container App name
- `AZURE_RESOURCE_GROUP`: your app resource group name
- `AZURE_ACR_NAME`: your ACR resource name, not the full `azurecr.io` login server

## Step 14: Verify the GitHub Actions Workflow

The workflow is already in the repo:

- `.github/workflows/deploy-container-app.yml`

It is designed to:

- run on pushes to `main`
- log in to Azure using OIDC
- build the Docker image
- push the image to ACR
- deploy a new revision to the Container App

## Step 15: Trigger the First Pipeline Deployment

Do one of these:

- push a tiny follow-up commit to `main`, or
- open the repo `Actions` tab and manually re-run the workflow if GitHub shows it as available

After the workflow finishes:

1. Open the Container App.
2. Confirm a new revision was created.
3. Open the app URL.

## Step 16: Validate the Live App Before Adding the Database

Test in this order:

1. Open the production URL.
2. Sign in with Microsoft Entra.
3. Confirm the redirect returns to the app correctly.
4. Search for a document.
5. Validate document access.
6. Read a SharePoint document live.
7. Change language and verify it persists correctly.
8. Open settings and return to workspace.
9. Sign out and sign back in.

## Step 17: Create Azure Cosmos DB for NoSQL in Serverless Mode

Do this after the app is confirmed live.

This step is done in the **BlueRidge subscription**.

In the Azure portal:

1. Search for `Azure Cosmos DB`.
2. Click `Create`.
3. Choose `Azure Cosmos DB for NoSQL`.
4. Fill in:
   - Subscription: your BlueRidge subscription
   - Resource group: same app resource group
   - Account name: something like `albasti-search-cosmos`
   - Location: same region as the app
5. On any capacity or pricing section, choose `Serverless` if the portal shows the option separately.
6. Review and create.
7. Create.

## Step 18: Create the Database and Containers

In the Cosmos account:

1. Open `Data Explorer`.
2. Click `New Container`.
3. Create:
   - Database id: `albasti-search-chat`
   - Container id: `chatThreads`
   - Partition key: `/userId`
4. Repeat for:
   - Database id: `albasti-search-chat`
   - Container id: `sessionLogs`
   - Partition key: `/userId`

## Step 19: Add Cosmos Secrets and Environment Variables

In the Container App:

1. Go to `Secrets`.
2. Add:
   - `azure-cosmos-key`
3. Save.

Then go to `Revisions and replicas` > `Create new revision` and add:

- `AZURE_COSMOS_ENDPOINT`
- `AZURE_COSMOS_DATABASE=albasti-search-chat`
- `AZURE_COSMOS_THREADS_CONTAINER=chatThreads`
- `AZURE_COSMOS_SESSIONS_CONTAINER=sessionLogs`
- `AZURE_COSMOS_KEY=secretref:azure-cosmos-key`

Create the revision.

## Step 20: Validate Chat History and Session Logging

After the Cosmos-backed revision is live:

1. Start multiple chats.
2. Refresh the app.
3. Confirm history appears in the grouped buckets such as:
   - Today
   - Yesterday
   - Last week
   - Last month
   - Long time ago
4. Confirm only buckets with data appear.
5. Confirm history is tied to the signed-in user.

## Notes for This Project

- Do not remove the local redirect URI from the browser app registration.
- The production issue to update is the Entra redirect URI, not browser CORS.
- For image pulling from ACR, managed identity is preferred over registry passwords.
- If the Container App cannot pull from ACR after GitHub deployment, re-check:
  - Container App system-assigned identity is enabled
  - `AcrPull` is assigned for that identity on the registry
  - the app revision is configured to use managed identity for the registry
- Hosting can stay in BlueRidge Azure even though sign-in and SharePoint access stay in the client tenant.

## Key References

- Azure Container Registry portal quickstart: https://learn.microsoft.com/en-us/azure/container-registry/container-registry-get-started-portal
- Azure Container Apps existing image in portal: https://learn.microsoft.com/en-us/azure/container-apps/get-started-existing-container-image-portal
- Azure Container Apps environment variables: https://learn.microsoft.com/en-us/azure/container-apps/environment-variables
- Azure Container Apps image pull with managed identity: https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull
- GitHub Actions OIDC with Azure Login: https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect
- GitHub Actions for Azure Container Apps: https://learn.microsoft.com/en-us/azure/container-apps/github-actions
- Microsoft Entra redirect URIs: https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri
- Azure Cosmos DB for NoSQL portal quickstart: https://learn.microsoft.com/en-us/azure/cosmos-db/gremlin/how-to-create-container
