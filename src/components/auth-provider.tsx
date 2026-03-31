"use client";

import { MsalProvider } from "@azure/msal-react";
import { type ReactNode, useEffect } from "react";

import { authEnabled, getMsalInstance, initializeMsal } from "@/lib/auth-client";

export function AuthProvider({ children }: { children: ReactNode }) {
  const instance = getMsalInstance();

  useEffect(() => {
    if (!authEnabled) {
      return;
    }

    initializeMsal().catch((error) => {
      console.error("MSAL initialization failed", error);
    });
  }, []);

  if (!authEnabled || !instance) {
    return <>{children}</>;
  }

  return (
    <MsalProvider instance={instance}>
      {children}
    </MsalProvider>
  );
}
