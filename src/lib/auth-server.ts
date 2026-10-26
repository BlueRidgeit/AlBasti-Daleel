import { ConfidentialClientApplication } from "@azure/msal-node";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { env, hasServerAuthConfig } from "@/lib/env";
import { resolveAccessRole, type AccessRole } from "@/lib/access";
import { isAppAdmin } from "@/lib/app-admins";

let confidentialClient: ConfidentialClientApplication | null = null;
let signingKeys:
  | ReturnType<typeof createRemoteJWKSet>
  | null = null;

const getAuthority = () =>
  `https://login.microsoftonline.com/${env.azureEntraTenantId}`;

const getAcceptedIssuers = () => {
  const tenantId = env.azureEntraTenantId;

  return [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ];
};

const getAcceptedAudiences = () => {
  const clientId = env.azureEntraClientId;
  const configuredAudience = env.azureEntraApiAudience;

  return [
    configuredAudience,
    clientId,
    clientId ? `api://${clientId}` : undefined,
  ].filter(Boolean) as string[];
};

const getJwks = () => {
  if (!signingKeys) {
    signingKeys = createRemoteJWKSet(
      new URL(`${getAuthority()}/discovery/v2.0/keys`),
    );
  }

  return signingKeys;
};

const getConfidentialClient = () => {
  if (!confidentialClient) {
    confidentialClient = new ConfidentialClientApplication({
      auth: {
        clientId: env.azureEntraClientId!,
        clientSecret: env.azureEntraClientSecret!,
        authority: getAuthority(),
      },
    });
  }

  return confidentialClient;
};

export const getRequestBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorization.slice("Bearer ".length).trim();
};

export async function validateApiAccessToken(token: string) {
  if (!hasServerAuthConfig) {
    throw new Error(
      "Server auth is not configured. Set AZURE_ENTRA_TENANT_ID, AZURE_ENTRA_CLIENT_ID, AZURE_ENTRA_CLIENT_SECRET, and AZURE_ENTRA_API_AUDIENCE.",
    );
  }

  const audiences = getAcceptedAudiences();

  const result = await jwtVerify(token, getJwks(), {
    issuer: getAcceptedIssuers(),
    audience: audiences,
  });

  const scopes = String(result.payload.scp ?? "")
    .split(" ")
    .filter(Boolean);

  if (
    env.azureEntraApiScopeName &&
    scopes.length > 0 &&
    !scopes.includes(env.azureEntraApiScopeName)
  ) {
    throw new Error(
      `The access token is missing the required API scope '${env.azureEntraApiScopeName}'.`,
    );
  }

  return result.payload;
}

export async function acquireGraphTokenOnBehalfOf(token: string) {
  if (!hasServerAuthConfig) {
    return undefined;
  }

  await validateApiAccessToken(token);
  const result = await getConfidentialClient().acquireTokenOnBehalfOf({
    oboAssertion: token,
    scopes: env.azureGraphScopes,
    skipCache: false,
  });

  if (!result?.accessToken) {
    throw new Error("Failed to acquire a Microsoft Graph token on behalf of the user.");
  }

  return result.accessToken;
}

// App-only (client-credentials) Graph token — used by admin endpoints to enumerate
// SharePoint document libraries (drives) with the app's Application permissions.
export async function acquireGraphAppToken() {
  if (!hasServerAuthConfig) {
    return undefined;
  }

  const result = await getConfidentialClient().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  if (!result?.accessToken) {
    throw new Error("Failed to acquire an app-only Microsoft Graph token.");
  }

  return result.accessToken;
}

const GLOBAL_ADMIN_ROLE_TEMPLATE_ID = "62e90394-69f5-4237-9190-012177145e10";

// Detect the Entra "Global Administrator" directory role from the token's `wids` claim
// (the list of tenant-wide role template ids assigned to the signed-in user).
export const isGlobalAdminPayload = (payload?: JWTPayload): boolean => {
  if (!payload) {
    return false;
  }

  const wids = (payload as { wids?: unknown }).wids;
  if (!Array.isArray(wids)) {
    return false;
  }

  return wids.some(
    (value) =>
      typeof value === "string" &&
      value.toLowerCase() === GLOBAL_ADMIN_ROLE_TEMPLATE_ID,
  );
};

export type AuthenticatedUser = {
  displayName?: string;
  email?: string;
  objectId?: string;
  isGlobalAdmin?: boolean;
  // Set by getAuthenticatedUserFromRequest: admin, user (allowed) or none (blocked by access control).
  accessRole?: AccessRole;
};

export const mapAuthenticatedUser = (
  payload?: JWTPayload,
): AuthenticatedUser | undefined => {
  if (!payload) {
    return undefined;
  }

  const upn = String(payload.preferred_username ?? payload.upn ?? "").toLowerCase();

  return {
    displayName: String(payload.name ?? "") || undefined,
    email:
      String(payload.preferred_username ?? payload.upn ?? "") || undefined,
    objectId: String(payload.oid ?? payload.sub ?? "") || undefined,
    isGlobalAdmin:
      isGlobalAdminPayload(payload) ||
      (upn.length > 0 && env.adminUpns.includes(upn)),
  };
};

export async function getAuthenticatedUserFromRequest(
  request: Request,
  options?: { includeBlocked?: boolean },
) {
  const token = getRequestBearerToken(request);

  if (!token) {
    return undefined;
  }

  const payload = await validateApiAccessToken(token);
  const user = mapAuthenticatedUser(payload);

  // Third admin source (after the tenant Global Admin role and the ADMIN_UPNS env list):
  // the UI-managed app-admin allowlist in Cosmos. Only consult it when the token itself did
  // not already establish admin, so we skip the Cosmos read for tenant/env admins.
  if (user && !user.isGlobalAdmin && user.email) {
    if (await isAppAdmin(user.email).catch(() => false)) {
      user.isGlobalAdmin = true;
    }
  }

  if (user) {
    // Optional access control (Postgres-backed user list). A no-op unless restriction is on.
    user.accessRole = await resolveAccessRole(user).catch(() => "none" as AccessRole);
    if (user.accessRole === "none" && !options?.includeBlocked) {
      return undefined;
    }
  }

  return user;
}
