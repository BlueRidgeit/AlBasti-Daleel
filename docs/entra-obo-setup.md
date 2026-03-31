# Entra OBO Setup

This app uses:

- a public client app registration for the browser sign-in
- a confidential client app registration for the backend API
- Microsoft Graph On-Behalf-Of (OBO) so live SharePoint reads run with the signed-in lawyer's own permissions

## What this enables

- `read_document` can open the original SharePoint file live as the signed-in lawyer
- the UI can show who is signed in

## What this does not solve yet

- `search_documents` still queries a shared Azure AI Search index
- the index does not yet contain ACL/security-trimming metadata
- repository-wide search results are therefore not yet filtered per lawyer

## App Registration 1: Browser Client

Create a Microsoft Entra app registration for the frontend.

1. Go to `Azure Portal -> Microsoft Entra ID -> App registrations -> New registration`.
2. Name it something like `Albasti Search Chat Web`.
3. Set the supported account type to your tenant only.
4. Add a redirect URI:
   - Platform: `Single-page application`
   - URI for local dev: `http://localhost:3000/`
5. Save the registration.
6. Copy:
   - `Application (client) ID`
   - `Directory (tenant) ID`

## App Registration 2: Backend API

Create a second app registration for the backend.

1. Go to `Azure Portal -> Microsoft Entra ID -> App registrations -> New registration`.
2. Name it something like `Albasti Search Chat API`.
3. Set the supported account type to your tenant only.
4. Do not add a redirect URI for this app.
5. Save the registration.
6. Copy:
   - `Application (client) ID`
   - `Directory (tenant) ID`

## Assign Owners to Both App Registrations

This step matters more than it looks.

1. Open the browser client app registration.
2. Go to `Owners`.
3. Add yourself or the admin account performing the setup.
4. Open the backend API app registration.
5. Go to `Owners`.
6. Add yourself or the admin account performing the setup.

If an owner is not assigned to both the API app and the client app, the API may not appear when adding API permissions.

## Expose the Backend API Scope

On the backend API app:

1. Open `Expose an API`.
2. Set the Application ID URI, for example:
   - `api://<backend-client-id>`
3. Click `Add a scope`.
4. Use:
   - Scope name: `access_as_user`
   - Who can consent: `Admins and users`
   - Admin consent display name: `Access Albasti Search Chat API`
   - Admin consent description: `Allow the app to call the Albasti Search Chat API on behalf of the signed-in user`
   - User consent display name: `Access Albasti Search Chat API`
   - User consent description: `Allow the app to call the Albasti Search Chat API on your behalf`
   - State: `Enabled`

The scope value will be:

- `api://<backend-client-id>/access_as_user`

## Allow the Browser App to Request the Backend Scope

On the browser client app:

1. Open `API permissions`.
2. Click `Add a permission`.
3. First try `APIs my organization uses`.
4. Select the backend API app.
5. Choose the delegated permission:
   - `access_as_user`
6. Add the permission.
7. Grant admin consent if your tenant requires it.

If the backend API does not appear:

1. Confirm the backend API app has an `Application ID URI` under `Expose an API`.
2. Confirm the backend API app has an enabled scope named `access_as_user`.
3. Confirm both app registrations have owners assigned.
4. Check `My APIs` as a secondary tab if `APIs my organization uses` is empty in your tenant view.

In current Entra documentation and portal behavior, Microsoft shows both patterns in different guides. In practice, many tenants now surface custom app APIs under `APIs my organization uses`, while `My APIs` can remain empty depending on ownership and portal context.

## Optional: Pre-Authorize the Browser Client

On the backend API app:

1. Open `Expose an API`.
2. Under `Authorized client applications`, click `Add a client application`.
3. Enter the browser app `Application (client) ID`.
4. Select the `access_as_user` scope.
5. Save.

This does not replace OBO, but it can reduce consent friction for the browser client.

## Add Microsoft Graph Delegated Permissions to the Backend API App

On the backend API app:

1. Open `API permissions`.
2. Click `Add a permission`.
3. Choose `Microsoft Graph`.
4. Choose `Delegated permissions`.
5. Add:
   - `Files.Read.All`
   - `Sites.Read.All`
6. Grant admin consent if required.

These delegated Graph scopes are used during OBO when the signed-in lawyer opens a SharePoint document through `read_document`.

## Create a Client Secret for the Backend API App

On the backend API app:

1. Open `Certificates & secrets`.
2. Create a new client secret.
3. Copy the secret value immediately.

## Fill `.env.local`

Use these values:

```env
NEXT_PUBLIC_AZURE_TENANT_ID=<tenant-id>
NEXT_PUBLIC_AZURE_CLIENT_ID=<browser-client-id>
NEXT_PUBLIC_AZURE_API_SCOPE=api://<backend-client-id>/access_as_user
NEXT_PUBLIC_AZURE_REDIRECT_PATH=/

AZURE_ENTRA_TENANT_ID=<tenant-id>
AZURE_ENTRA_CLIENT_ID=<backend-client-id>
AZURE_ENTRA_CLIENT_SECRET=<backend-client-secret>
AZURE_ENTRA_API_AUDIENCE=<backend-client-id-or-app-id-uri>
AZURE_ENTRA_API_SCOPE_NAME=access_as_user
AZURE_GRAPH_SCOPES=https://graph.microsoft.com/Files.Read.All https://graph.microsoft.com/Sites.Read.All
```

## Local Validation

1. Start the app with `npm run dev`.
2. Open `http://localhost:3000`.
3. Click `Sign in`.
4. Ask the app to:
   - find a document
   - read that specific document in detail
5. Confirm the `read_document` result uses live SharePoint reading instead of indexed fallback.

## Production Notes

- Deploy the frontend/backend app to Azure Container Apps, App Service, or another Azure-hosted runtime.
- Add the production redirect URI to the browser client app registration.
- Add the production origin if CORS changes are introduced later.
- If you want search results themselves to respect each lawyer's permissions, the Azure AI Search index must be extended with ACL metadata and queried with security trimming.
