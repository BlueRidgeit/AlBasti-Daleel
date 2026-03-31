"use client";

import { MsalProvider } from "@azure/msal-react";
import { type ReactNode, useEffect, useState } from "react";

import { getMsalInstance, initializeMsal, isAuthEnabled } from "@/lib/auth-client";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isAuthEnabled());
  }, []);

  const instance = enabled ? getMsalInstance() : null;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    initializeMsal().catch((error) => {
      console.error("MSAL initialization failed", error);
    });
  }, [enabled]);

  if (!enabled || !instance) {
    return <>{children}</>;
  }

  return (
    <MsalProvider instance={instance}>
      {children}
    </MsalProvider>
  );
}
