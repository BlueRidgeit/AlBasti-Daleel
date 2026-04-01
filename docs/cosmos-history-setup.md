# Cosmos History Setup Guide

This guide is the step-by-step runbook for enabling:

- chat history
- session logging
- per-user history buckets such as `Today` and `Yesterday`

for this exact app.

It is written to match the code that already exists in:

- `src/lib/chat-history.ts`
- `src/app/api/history/route.ts`
- `src/app/api/chat/route.ts`

## What This Feature Stores

Once enabled, the app will store two kinds of data in Azure Cosmos DB for NoSQL:

### Chat threads

Stored in the `chatThreads` container.

Each thread stores:

- thread id
- user id
- locale
- title
- preview
- created time
- updated time
- message count
- message list

### Session events

Stored in the `sessionLogs` container.

Each session event stores:

- event id
- user id
- thread id
- route
- event name
- created time
- optional detail

Examples of session events already written by the app:

- `chat_request_started`
- `chat_request_completed`

## Important Architecture Note

For this project:

- Azure Cosmos DB is created in the **BlueRidge subscription**
- user identity still comes from the **client tenant**
- history is partitioned by the signed-in user's `objectId`

That means:

- one user should only see their own thread history
- the storage account stays in BlueRidge Azure

## Before You Start

Make sure these are already working first:

1. the Azure Container App is live
2. sign-in works in production
3. Azure OpenAI works in production
4. the app can read SharePoint documents

Do not enable history until the base deployment is healthy.

## Step 1: Create Azure Cosmos DB for NoSQL

In the Azure portal:

1. Stay in the **BlueRidge tenant/subscription**.
2. Search for `Azure Cosmos DB`.
3. Click `Create`.
4. Choose `Azure Cosmos DB for NoSQL`.
5. On the create screen, fill in:
   - Subscription: your BlueRidge subscription
   - Resource group: the same resource group as the Container App
   - Account name: something like `albasti-search-cosmos`
   - Location: the same region as the Container App
6. For capacity mode, choose `Serverless`.
7. Leave the rest at the default unless your team has a specific requirement.
8. Click `Review + create`.
9. Click `Create`.

## Step 2: Open Data Explorer

After deployment finishes:

1. Open the new Cosmos DB account.
2. In the left menu, click `Data Explorer`.

## Step 3: Create the Database

In `Data Explorer`:

1. Click `New Container`.
2. For `Database id`, enter:
   - `albasti-search-chat`
3. Do not create a second database for session logs. Both containers should live in the same database.

## Step 4: Create the chatThreads Container

Still in the `New Container` flow:

1. Container id:
   - `chatThreads`
2. Partition key:
   - `/userId`
3. Leave throughput on the serverless/default flow.
4. Create the container.

This container stores the actual saved chat threads and message previews.

## Step 5: Create the sessionLogs Container

Create the second container in the same database:

1. Database id:
   - `albasti-search-chat`
2. Container id:
   - `sessionLogs`
3. Partition key:
   - `/userId`
4. Create the container.

This container stores user activity/session events.

## Step 6: Get the Cosmos Endpoint and Key

In the Cosmos DB account:

1. Open `Keys`.
2. Copy:
   - the `URI`
   - one of the account keys

You will use them as:

- `AZURE_COSMOS_ENDPOINT`
- `AZURE_COSMOS_KEY`

## Step 7: Add the Cosmos Secret to the Container App

In the Azure portal:

1. Open the Azure Container App.
2. In the left menu, click `Secrets`.
3. Click `Add`.
4. Add a secret:
   - Key: `azure-cosmos-key`
   - Type: `Container Apps Secret`
   - Value: paste the Cosmos DB key
5. Save.

## Step 8: Add the Cosmos Environment Variables

In the Azure portal:

1. Open the Azure Container App.
2. Go to `Revisions and replicas`.
3. Create a new revision.
4. Open the container settings.
5. In `Environment variables`, add these values.

### Plain environment variables

- `AZURE_COSMOS_ENDPOINT`
- `AZURE_COSMOS_DATABASE`
- `AZURE_COSMOS_THREADS_CONTAINER`
- `AZURE_COSMOS_SESSIONS_CONTAINER`

Use these exact values:

- `AZURE_COSMOS_ENDPOINT = <your-cosmos-uri>`
- `AZURE_COSMOS_DATABASE = albasti-search-chat`
- `AZURE_COSMOS_THREADS_CONTAINER = chatThreads`
- `AZURE_COSMOS_SESSIONS_CONTAINER = sessionLogs`

### Secret-backed environment variable

Add:

- `AZURE_COSMOS_KEY = secretref:azure-cosmos-key`

Save and create the revision.

## Step 9: Confirm the New Revision Is Active

In the Container App:

1. Open `Revisions and replicas`.
2. Confirm the newest revision is:
   - active
   - receiving traffic

If needed, make sure traffic is pointed to the new revision.

## Step 10: Verify the App Sees Cosmos Config

Open a running replica console and run:

```sh
env | sort | grep AZURE_COSMOS
```

You should see:

- `AZURE_COSMOS_ENDPOINT`
- `AZURE_COSMOS_DATABASE`
- `AZURE_COSMOS_THREADS_CONTAINER`
- `AZURE_COSMOS_SESSIONS_CONTAINER`
- `AZURE_COSMOS_KEY`

## Step 11: Test Chat History

In the live app:

1. Sign in.
2. Start a new chat.
3. Send a message.
4. Refresh the page.
5. Open the history tree in the sidebar.

You should start seeing grouped history such as:

- `Today`
- `Yesterday`
- `Last week`
- `Last month`
- `Long time ago`

Only groups with actual data should appear.

## Step 12: Test Per-User Separation

To confirm the storage is user-scoped:

1. Sign in as one user and create a few chats.
2. Sign out.
3. Sign in as a different user.
4. Confirm the second user does not see the first user's thread history.

This should work because the app stores and queries history by `userId`.

## Step 13: Verify Session Logs Are Being Written

In Cosmos DB:

1. Open `Data Explorer`.
2. Open the `sessionLogs` container.
3. Query for recent records.

You should see documents containing fields like:

- `userId`
- `threadId`
- `route`
- `event`
- `createdAt`
- `detail`

## Expected Data Shape

### chatThreads example

```json
{
  "id": "thread-id",
  "userId": "entra-object-id",
  "type": "thread",
  "locale": "en",
  "title": "Find a file related to civil execution",
  "preview": "Find a file related to civil execution and include the original link.",
  "createdAt": "2026-04-01T10:00:00.000Z",
  "updatedAt": "2026-04-01T10:02:00.000Z",
  "messageCount": 4,
  "messages": [
    {
      "id": "message-1",
      "role": "user",
      "text": "Find a file related to civil execution."
    }
  ]
}
```

### sessionLogs example

```json
{
  "id": "event-id",
  "userId": "entra-object-id",
  "type": "session",
  "threadId": "thread-id",
  "route": "/api/chat",
  "event": "chat_request_started",
  "createdAt": "2026-04-01T10:00:00.000Z",
  "detail": "User message received."
}
```

## Troubleshooting

### History does not appear

Check:

1. Cosmos env vars exist in the active revision
2. the Cosmos secret is correctly mapped with `secretref:azure-cosmos-key`
3. the signed-in user is authenticated
4. the app can create new chats after Cosmos was enabled

### Session logs are empty

Check:

1. the app is actually sending chat requests after the Cosmos revision went live
2. the `sessionLogs` container exists
3. its partition key is exactly `/userId`

### The app crashes after enabling Cosmos

Check:

1. `AZURE_COSMOS_ENDPOINT` is the Cosmos account URI
2. `AZURE_COSMOS_KEY` is a valid key
3. the database/container names match exactly:
   - `albasti-search-chat`
   - `chatThreads`
   - `sessionLogs`

## Current Code Expectations

These are the exact app expectations:

- Database name:
  - `albasti-search-chat`
- Threads container:
  - `chatThreads`
- Sessions container:
  - `sessionLogs`
- Partition key for both:
  - `/userId`

Do not rename these unless you also update the app environment variables.

## Recommended Next Hardening Steps

After the first working version is live, consider:

1. retention rules for old threads and logs
2. whether to redact or minimize sensitive content in stored messages
3. admin-only reporting views for session activity
4. optional restore/open-existing-thread behavior from the sidebar

## Key References

- Azure Cosmos DB for NoSQL quickstart: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/quickstart-portal
- Azure Cosmos DB create container guidance: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/how-to-create-container
- Azure Container Apps environment variables: https://learn.microsoft.com/en-us/azure/container-apps/environment-variables
