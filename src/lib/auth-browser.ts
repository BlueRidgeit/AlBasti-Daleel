"use client";

import {
  getApiTokenRequest,
  getMsalInstance,
  initializeMsal,
  isAuthEnabled,
} from "@/lib/auth-client";

export async function getApiAccessToken() {
  if (!isAuthEnabled()) {
    return undefined;
  }

  const instance = await initializeMsal();
  const apiTokenRequest = getApiTokenRequest();

  if (!instance || !apiTokenRequest) {
    return undefined;
  }

  let account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];

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
    console.warn("Silent API token acquisition failed", error);
    return undefined;
  }
}
