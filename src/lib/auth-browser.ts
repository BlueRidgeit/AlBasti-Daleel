"use client";

import { InteractionRequiredAuthError } from "@azure/msal-browser";

import {
  apiTokenRequest,
  authEnabled,
  getMsalInstance,
  initializeMsal,
  loginRequest,
} from "@/lib/auth-client";

export async function getApiAccessToken() {
  if (!authEnabled) {
    return undefined;
  }

  const instance = await initializeMsal();
  if (!instance || !apiTokenRequest) {
    return undefined;
  }

  let account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];

  if (!account && loginRequest) {
    const loginResult = await instance.loginPopup(loginRequest);
    account = loginResult.account;
    if (account) {
      instance.setActiveAccount(account);
    }
  }

  if (!account) {
    return undefined;
  }

  try {
    const result = await instance.acquireTokenSilent({
      ...apiTokenRequest,
      account,
    });

    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      const result = await instance.acquireTokenPopup({
        ...apiTokenRequest,
        account,
      });

      return result.accessToken;
    }

    throw error;
  }
}
