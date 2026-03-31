"use client";

import { Thread } from "@/components/thread";
import type { AppLocale } from "@/lib/i18n";

export const Assistant = ({ locale }: { locale: AppLocale }) => {
  return (
    <div className="h-full min-h-0">
      <Thread locale={locale} />
    </div>
  );
};
