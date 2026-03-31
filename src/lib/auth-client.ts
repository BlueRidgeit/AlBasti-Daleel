import {
  EventType,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";

import { env } from "@/lib/env";

declare global {
  interface Window {
    __ALBASTI_PUBLIC_ENV__?: {
      nextPublicAzureTenantId?: string;
      nextPublicAzureClientId?: string;
      nextPublicAzureApiScope?: string;
      nextPublicAzureRedirectPath?: string;
    };
  }
}

let clientApplication: PublicClientApplication | null = null;
let initialized = false;

const getPublicAuthConfig = () => {
  const runtime =
    typeof window !== "undefined" ? window.__ALBASTI_PUBLIC_ENV__ : undefined;

  return {
    tenantId: runtime?.nextPublicAzureTenantId ?? env.nextPublicAzureTenantId,
    clientId: runtime?.nextPublicAzureClientId ?? env.nextPublicAzureClientId,
    apiScope: runtime?.nextPublicAzureApiScope ?? env.nextPublicAzureApiScope,
    redirectPath:
      runtime?.nextPublicAzureRedirectPath ?? env.nextPublicAzureRedirectPath ?? "/",
  };
};

export const authEnabled = Boolean(
  getPublicAuthConfig().tenantId &&
    getPublicAuthConfig().clientId &&
    getPublicAuthConfig().apiScope,
);

const getRedirectUri = () => {
  const config = getPublicAuthConfig();

  if (typeof window === "undefined") {
    return config.redirectPath;
  }

  return new URL(
    config.redirectPath,
    window.location.origin,
  ).toString();
};

export const getMsalInstance = () => {
  if (!authEnabled) {
    return null;
  }

  if (!clientApplication) {
    const config = getPublicAuthConfig();

    clientApplication = new PublicClientApplication({
      auth: {
        clientId: config.clientId!,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        redirectUri: getRedirectUri(),
        postLogoutRedirectUri: getRedirectUri(),
      },
      cache: {
        cacheLocation: "sessionStorage",
      },
    });

    clientApplication.addEventCallback((event) => {
      if (
        event.eventType === EventType.LOGIN_SUCCESS &&
        event.payload &&
        "account" in event.payload &&
        event.payload.account
      ) {
        clientApplication?.setActiveAccount(event.payload.account as AccountInfo);
      }
    });
  }

  return clientApplication;
};

export const initializeMsal = async () => {
  const instance = getMsalInstance();

  if (!instance || initialized) {
    return instance;
  }

  await instance.initialize();
  const redirectResult = await instance.handleRedirectPromise();

  if (redirectResult?.account) {
    instance.setActiveAccount(redirectResult.account);
  } else if (!instance.getActiveAccount()) {
    const account = instance.getAllAccounts()[0];
    if (account) {
      instance.setActiveAccount(account);
    }
  }

  initialized = true;
  return instance;
};

export const loginRequest = authEnabled
  ? {
      scopes: [
        "openid",
        "profile",
        "offline_access",
        getPublicAuthConfig().apiScope!,
      ],
    }
  : undefined;

export const apiTokenRequest = authEnabled
  ? {
      scopes: [getPublicAuthConfig().apiScope!],
    }
  : undefined;
