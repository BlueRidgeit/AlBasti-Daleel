import {
  EventType,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";

import { env, hasClientAuthConfig } from "@/lib/env";

let clientApplication: PublicClientApplication | null = null;
let initialized = false;

export const authEnabled = hasClientAuthConfig;

const getRedirectUri = () => {
  if (typeof window === "undefined") {
    return env.nextPublicAzureRedirectPath ?? "/";
  }

  return new URL(
    env.nextPublicAzureRedirectPath ?? "/",
    window.location.origin,
  ).toString();
};

export const getMsalInstance = () => {
  if (!authEnabled) {
    return null;
  }

  if (!clientApplication) {
    clientApplication = new PublicClientApplication({
      auth: {
        clientId: env.nextPublicAzureClientId!,
        authority: `https://login.microsoftonline.com/${env.nextPublicAzureTenantId}`,
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
      scopes: ["openid", "profile", "offline_access", env.nextPublicAzureApiScope!],
    }
  : undefined;

export const apiTokenRequest = authEnabled
  ? {
      scopes: [env.nextPublicAzureApiScope!],
    }
  : undefined;
