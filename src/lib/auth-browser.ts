"use client";

import { InteractionRequiredAuthError } from "@azure/msal-browser";

import {
  getApiTokenRequest,
  getMsalInstance,
  initializeMsal,
  getLoginRequest,
  isAuthEnabled,
} from "@/lib/auth-client";

export async function getApiAccessToken() {
  if (!isAuthEnabled()) {
    return undefined;
  }

  const instance = await initializeMsal();
  const apiTokenRequest = getApiTokenRequest();
  const loginRequest = getLoginRequest();

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
