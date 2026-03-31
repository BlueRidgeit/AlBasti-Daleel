import { ConfidentialClientApplication } from "@azure/msal-node";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { env, hasServerAuthConfig } from "@/lib/env";

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

export type AuthenticatedUser = {
  displayName?: string;
  email?: string;
  objectId?: string;
};

export const mapAuthenticatedUser = (
  payload?: JWTPayload,
): AuthenticatedUser | undefined => {
  if (!payload) {
    return undefined;
  }

  return {
    displayName: String(payload.name ?? "") || undefined,
    email:
      String(payload.preferred_username ?? payload.upn ?? "") || undefined,
    objectId: String(payload.oid ?? payload.sub ?? "") || undefined,
  };
};

export async function getAuthenticatedUserFromRequest(request: Request) {
  const token = getRequestBearerToken(request);

  if (!token) {
    return undefined;
  }

  const payload = await validateApiAccessToken(token);
  return mapAuthenticatedUser(payload);
}
