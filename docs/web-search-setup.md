# Azure Web Search Setup Guide

This guide explains how to enable the app's new `web_search` backend tool using the Azure OpenAI / Foundry Responses API with `web_search_preview`.

This is the fastest Microsoft-native external web search path for the current app architecture because it keeps:

- the existing custom UI
- the existing custom backend
- SharePoint / Graph / OBO security

while adding a separate public-web search tool.

## Important Compliance Warning

As of `2026-04-01`, Microsoft's current docs say web search / Grounding with Bing has special terms and does **not** stay inside the normal Azure compliance boundary.

Read these before enabling it:

- [Responses API web search](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/web-search)
- [Web grounding overview](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/web-overview)
- [Grounding with Bing tools](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/bing-tools)

For this app, keep web search limited to:

- public internet questions
- current public information
- external reference sites

Do **not** treat it like internal firm knowledge or SharePoint search.

## Tenant / Subscription Placement

Use the same split already used by this app:

### BlueRidge tenant / subscription

Put the web-search-capable Azure OpenAI / Foundry resource here.

This is where:

- Azure hosting lives
- billing lives
- deployment lives
- the new web-search tool runs

### Client tenant

Keep these where they already are:

- browser app registration
- backend API app registration
- Microsoft Graph consent
- SharePoint permissions

## How This App Uses Web Search

The app now exposes a backend tool named:

- `web_search`

It is wired in:

- `src/app/api/chat/route.ts`
- `src/lib/web-search.ts`
- `src/lib/legal-agent.ts`

The tool calls the Azure Responses API with `web_search_preview`.

## Prerequisites

You need:

1. A BlueRidge-hosted Azure OpenAI / Foundry resource
2. A model deployment that supports the Responses API web search flow
3. A valid API key
4. The app already deployed to Azure Container Apps

## Step 1: Decide Whether to Reuse the Existing Deployment

Fastest option:

- reuse your current chat deployment if it supports the Responses API with `web_search_preview`

Cleaner option:

- create a separate deployment just for web search

Recommended:

- if you are just getting started, reuse the existing deployment first
- move to a separate deployment later if you want cleaner separation

## Step 2: Enable Web Search Access for the Subscription

This step is done in the **BlueRidge Azure subscription**.

Microsoft's current docs use an Azure CLI command to enable web search by removing the subscription-level block.

Open:

- Azure Cloud Shell
- or your local terminal with Azure CLI logged into the BlueRidge subscription

Run:

```powershell
az account set --subscription "<your-blueridge-subscription-id-or-name>"
az feature unregister --namespace Microsoft.CognitiveServices --name OpenAI.BlockedTools.web_search
```

Then verify:

```powershell
az feature show --namespace Microsoft.CognitiveServices --name OpenAI.BlockedTools.web_search
```

If propagation takes time, wait a few minutes and check again.

Official reference:

- [Responses API web search](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/web-search)

## Step 3: Confirm the Azure OpenAI Base URL and Key

In Azure Portal:

1. Open your BlueRidge-hosted Azure OpenAI / Foundry resource
2. Go to `Keys and Endpoint`
3. Confirm:
   - endpoint looks like `https://<resource>.openai.azure.com`
   - you have a valid API key

You do **not** need to add the tool in the Foundry portal for this app, because the app is calling the Responses API directly from its own backend.

## Step 4: Choose the Deployment Name

Use one of these:

- your current deployment name, such as `gpt-4o`
- or a separate deployment you created specifically for web search

This deployment name goes into:

- `AZURE_OPENAI_WEB_SEARCH_DEPLOYMENT`

If you leave that variable blank in the app, the code falls back to:

- `AZURE_OPENAI_CHAT_DEPLOYMENT`

## Step 5: Add the New Environment Variables to the Container App

In Azure Portal:

1. Open the Container App
2. Go to `Revisions and replicas`
3. Create a new revision
4. Open the container settings
5. Add these plain environment variables:

| Variable | Suggested value |
| --- | --- |
| `AZURE_OPENAI_WEB_SEARCH_DEPLOYMENT` | your deployment name, or leave blank to reuse chat deployment |
| `AZURE_WEB_SEARCH_COUNTRY` | `AE` |
| `AZURE_WEB_SEARCH_CONTEXT_SIZE` | `medium` |

Notes:

- These are **plain env vars**, not secrets
- The app reuses your existing:
  - `AZURE_OPENAI_BASE_URL`
  - `AZURE_OPENAI_API_KEY`
  - `AZURE_OPENAI_API_VERSION`

## Step 6: Save the Revision

After saving:

1. let the new revision become active
2. verify it is serving traffic

## Step 7: Test the Tool in the Live App

After the new revision is live, ask something clearly external and public, for example:

- `What is the latest public UAE policy on <topic>?`
- `Search the web for the latest public information about <topic>.`

The app should now be able to use:

- `web_search`

while still using:

- `search_documents` for internal repository search
- `read_document` for SharePoint files

## Step 8: Verify the Tool Is Actually Enabled

If the model does not use it, check:

1. the env vars are present in the active revision
2. the Azure OpenAI key is valid
3. the deployment name is correct
4. the subscription feature change propagated

## Troubleshooting

### The app still does not use `web_search`

Check the active revision env vars:

- `AZURE_OPENAI_WEB_SEARCH_DEPLOYMENT`
- `AZURE_WEB_SEARCH_COUNTRY`
- `AZURE_WEB_SEARCH_CONTEXT_SIZE`

Also make sure the base Azure OpenAI vars are still valid:

- `AZURE_OPENAI_BASE_URL`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_API_VERSION`

### The tool returns a subscription / blocked-tools error

The subscription-level feature may still be blocking web search.

Re-run:

```powershell
az feature show --namespace Microsoft.CognitiveServices --name OpenAI.BlockedTools.web_search
```

### The tool returns an authentication or endpoint error

Check:

- Azure OpenAI key
- base URL
- deployment name

### The tool works but you do not want it used too often

That is controlled by prompt policy in:

- `src/lib/legal-agent.ts`

The app already treats web search as a public external source, not as internal firm knowledge.

## Current App-Side Result

Once configured, the app can:

- keep internal firm search separate
- keep SharePoint access separate
- call Azure-backed public web search only when needed

without refactoring the whole app into Foundry Agent Service.
