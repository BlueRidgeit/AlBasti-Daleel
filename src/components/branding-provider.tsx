"use client";

import { createContext, useContext, type ReactNode } from "react";

export type PublicBranding = {
  appName?: string;
  logos: { nav?: string; settings?: string };
};

const BrandingContext = createContext<PublicBranding>({ logos: {} });

// Filled on the server by the root layout, so the right logo is in the first HTML (no flash).
export function BrandingProvider({
  value,
  children,
}: {
  value: PublicBranding;
  children: ReactNode;
}) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);
