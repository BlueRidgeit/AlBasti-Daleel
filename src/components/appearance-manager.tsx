"use client";

import { useEffect, useRef, useState } from "react";
import { PaletteIcon, UploadIcon, Undo2Icon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getApiAccessToken } from "@/lib/auth-browser";
import {
  DEFAULT_COLORS,
  FONT_KEYS,
  FONT_LABELS,
  LOGO_SLOTS,
  THEME_PRESETS,
  buildThemeCss,
  logoUrl,
  type Branding,
  type ColorKey,
  type FontKey,
  type LogoSlot,
} from "@/lib/branding";
import type { AppLocale } from "@/lib/i18n";

const t = (isArabic: boolean, ar: string, en: string) => (isArabic ? ar : en);

const COLOR_GROUPS: Array<{
  title: [string, string];
  keys: Array<{ key: ColorKey; label: [string, string] }>;
}> = [
  {
    title: ["الأزرار والألوان الرئيسية", "Buttons & main colour"],
    keys: [
      { key: "primary", label: ["لون الأزرار والروابط", "Buttons & links"] },
      { key: "primaryText", label: ["نص الأزرار", "Button text"] },
      { key: "accent", label: ["لون التمييز (زر محادثة جديدة)", "Accent (New chat button)"] },
      { key: "accentText", label: ["نص لون التمييز", "Accent text"] },
    ],
  },
  {
    title: ["القائمة الجانبية", "Side navigation"],
    keys: [
      { key: "navBg", label: ["خلفية القائمة", "Background"] },
      { key: "navText", label: ["نص القائمة", "Text"] },
    ],
  },
  {
    title: ["الصفحة والنصوص", "Page & text"],
    keys: [
      { key: "pageBgFrom", label: ["خلفية الصفحة (أعلى)", "Page background (top)"] },
      { key: "pageBgTo", label: ["خلفية الصفحة (أسفل)", "Page background (bottom)"] },
      { key: "text", label: ["لون النص الرئيسي", "Main text"] },
    ],
  },
  {
    title: ["المحادثة", "Chat"],
    keys: [
      { key: "userBubble", label: ["خلفية رسالتك", "Your message background"] },
      { key: "userBubbleText", label: ["نص رسالتك", "Your message text"] },
      { key: "assistantBubble", label: ["خلفية الإجابة", "Answer background"] },
    ],
  },
];

const LOGO_LABELS: Record<LogoSlot, [string, string]> = {
  nav: ["شعار القائمة الجانبية", "Side navigation logo"],
  settings: ["شعار صفحة الإعدادات والحساب", "Settings / account page logo"],
  favicon: ["أيقونة المتصفح", "Browser tab icon"],
};

type Draft = Pick<Branding, "colors" | "font" | "appName" | "defaultLocale">;

export function AppearanceManager({
  isArabic,
}: {
  locale: AppLocale;
  isArabic: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [draft, setDraft] = useState<Draft>({ colors: {} });
  const [logos, setLogos] = useState<Branding["logos"]>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const savedRef = useRef(false);
  const fileInputs = useRef<Partial<Record<LogoSlot, HTMLInputElement | null>>>({});

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await getApiAccessToken().catch(() => undefined);
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fail = (err: unknown, fallback: string) =>
    setError(err instanceof Error && err.message ? err.message : fallback);

  const applyBranding = (branding: Branding) => {
    setDraft({
      colors: branding.colors,
      font: branding.font,
      appName: branding.appName,
      defaultLocale: branding.defaultLocale,
    });
    setLogos(branding.logos);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/branding", { headers: await authHeaders() });
      const data = (await response.json().catch(() => ({}))) as {
        enabled?: boolean;
        branding?: Branding;
        error?: string;
      };
      if (!response.ok || !data.branding) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setEnabled(data.enabled !== false);
      applyBranding(data.branding);
    } catch (err) {
      fail(err, t(isArabic, "تعذّر تحميل الإعدادات.", "Could not load the settings."));
    } finally {
      setLoading(false);
    }
  };

  // Live preview: the draft theme is applied to this page immediately. Closing without saving
  // removes it; after a save it stays until the next page load picks up the saved theme.
  useEffect(() => {
    const id = "branding-preview";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!open && !savedRef.current) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = buildThemeCss({ ...draft, colors: draft.colors, logos: {} });
  }, [draft, open]);

  const setColor = (key: ColorKey, value: string | undefined) =>
    setDraft((current) => {
      const colors = { ...current.colors };
      if (value) colors[key] = value;
      else delete colors[key];
      return { ...current, colors };
    });

  const save = async () => {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(draft),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      savedRef.current = true;
      setNotice(
        t(
          isArabic,
          "تم الحفظ. سيرى المستخدمون التغييرات عند تحديث الصفحة.",
          "Saved. Other users will see the changes when they refresh.",
        ),
      );
    } catch (err) {
      fail(err, t(isArabic, "تعذّر الحفظ.", "Could not save."));
    } finally {
      setBusy(null);
    }
  };

  const resetAll = () => {
    if (
      !window.confirm(
        t(
          isArabic,
          "إعادة الألوان والخط والاسم إلى الإعدادات الافتراضية؟ (لن تُحذف الشعارات.) اضغط حفظ للتأكيد.",
          "Reset colours, font and name to the defaults? (Logos are kept.) Press Save to confirm.",
        ),
      )
    ) {
      return;
    }
    setDraft({ colors: {} });
  };

  const uploadLogo = async (slot: LogoSlot, file: File | undefined) => {
    if (!file) return;
    setBusy(`logo:${slot}`);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("slot", slot);
      form.set("file", file);
      const response = await fetch("/api/admin/branding/logo", {
        method: "POST",
        headers: await authHeaders(),
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        branding?: Branding;
        error?: string;
      };
      if (!response.ok || !data.branding) throw new Error(data.error ?? `HTTP ${response.status}`);
      setLogos(data.branding.logos);
      setNotice(t(isArabic, "تم رفع الشعار.", "Logo uploaded."));
    } catch (err) {
      fail(err, t(isArabic, "تعذّر رفع الشعار.", "Could not upload the logo."));
    } finally {
      setBusy(null);
      const input = fileInputs.current[slot];
      if (input) input.value = "";
    }
  };

  const resetLogo = async (slot: LogoSlot) => {
    setBusy(`logo:${slot}`);
    setError(null);
    try {
      const response = await fetch(`/api/admin/branding/logo?slot=${slot}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const data = (await response.json().catch(() => ({}))) as {
        branding?: Branding;
        error?: string;
      };
      if (!response.ok || !data.branding) throw new Error(data.error ?? `HTTP ${response.status}`);
      setLogos(data.branding.logos);
    } catch (err) {
      fail(err, t(isArabic, "تعذّرت الإعادة.", "Could not reset the logo."));
    } finally {
      setBusy(null);
    }
  };

  const inputClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger
        className={`flex w-full items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-primary transition hover:border-primary/30 hover:bg-primary/10 ${
          isArabic ? "flex-row-reverse text-right" : "text-left"
        }`}
      >
        <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
          <PaletteIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">
          {t(isArabic, "المظهر والشعارات", "Appearance & logos")}
        </span>
      </DialogTrigger>

      <DialogContent
        className="max-h-[88vh] overflow-y-auto sm:max-w-2xl"
        dir={isArabic ? "rtl" : "ltr"}
      >
        <DialogHeader className={isArabic ? "text-right" : "text-left"}>
          <DialogTitle>{t(isArabic, "المظهر والشعارات", "Appearance & logos")}</DialogTitle>
          <DialogDescription>
            {t(
              isArabic,
              "خصّص الألوان والخط والشعارات. تظهر المعاينة فورًا هنا؛ اضغط حفظ لتطبيقها على الجميع.",
              "Customise colours, font and logos. The preview updates here immediately; press Save to apply it for everyone.",
            )}
          </DialogDescription>
        </DialogHeader>

        {!enabled ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {t(
              isArabic,
              "هذه الميزة تتطلب قاعدة بيانات Postgres لم تُهيَّأ بعد.",
              "This needs the Postgres database, which is not configured yet.",
            )}
          </p>
        ) : loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">…</p>
        ) : (
          <div className="space-y-6">
            {/* Presets */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t(isArabic, "قوالب جاهزة", "Quick themes")}</h3>
              <div className="flex flex-wrap gap-2">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, colors: { ...preset.colors } }))}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-primary hover:text-primary"
                  >
                    <span
                      className="inline-block size-3.5 rounded-full border border-black/10"
                      style={{ background: preset.colors.primary ?? DEFAULT_COLORS.primary }}
                    />
                    {preset.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Colours */}
            {COLOR_GROUPS.map((group) => (
              <section key={group.title[1]}>
                <h3 className="mb-2 text-sm font-semibold">{t(isArabic, group.title[0], group.title[1])}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.keys.map(({ key, label }) => {
                    const value = draft.colors[key];
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2"
                      >
                        <input
                          type="color"
                          value={value ?? DEFAULT_COLORS[key]}
                          onChange={(event) => setColor(key, event.target.value)}
                          className="size-9 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                          aria-label={t(isArabic, label[0], label[1])}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-slate-800">
                            {t(isArabic, label[0], label[1])}
                          </div>
                          <div dir="ltr" className="text-[11px] text-muted-foreground">
                            {value ?? t(isArabic, "افتراضي", "default")}
                          </div>
                        </div>
                        {value ? (
                          <button
                            type="button"
                            onClick={() => setColor(key, undefined)}
                            title={t(isArabic, "العودة للافتراضي", "Back to default")}
                            className="rounded-full p-1.5 text-slate-500 transition hover:bg-white hover:text-primary"
                          >
                            <Undo2Icon className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {/* Font, name, language */}
            <section className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">{t(isArabic, "الخط", "Font")}</span>
                <select
                  value={draft.font ?? "cairo"}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      font: event.target.value === "cairo" ? undefined : (event.target.value as FontKey),
                    }))
                  }
                  className={inputClass}
                >
                  {FONT_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {FONT_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">{t(isArabic, "اسم التطبيق", "App name")}</span>
                <input
                  type="text"
                  maxLength={60}
                  value={draft.appName ?? ""}
                  placeholder="Daleel"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, appName: event.target.value || undefined }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">{t(isArabic, "اللغة الافتراضية", "Default language")}</span>
                <select
                  value={draft.defaultLocale ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      defaultLocale: (event.target.value || undefined) as "en" | "ar" | undefined,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="">{t(isArabic, "افتراضي التطبيق", "App default")}</option>
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </label>
            </section>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy === "save"}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {busy === "save" ? t(isArabic, "جارٍ الحفظ…", "Saving…") : t(isArabic, "حفظ", "Save")}
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {t(isArabic, "استعادة الافتراضي", "Reset to defaults")}
              </button>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

            {/* Logos */}
            <section>
              <h3 className="mb-1 text-sm font-semibold">{t(isArabic, "الشعارات", "Logos")}</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                {t(
                  isArabic,
                  "PNG أو JPEG أو WebP أو SVG، حتى 1 ميجابايت. تُطبَّق الشعارات فور رفعها.",
                  "PNG, JPEG, WebP or SVG, up to 1 MB. Logos apply as soon as they are uploaded.",
                )}
              </p>
              <div className="space-y-2">
                {LOGO_SLOTS.map((slot) => {
                  const version = logos[slot];
                  return (
                    <div
                      key={slot}
                      className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2"
                    >
                      <div className="flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                        {version ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logoUrl(slot, version)}
                            alt=""
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="px-1 text-center text-[10px] text-muted-foreground">
                            {t(isArabic, "الشعار الافتراضي", "Built-in")}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-xs font-medium text-slate-800">
                        {t(isArabic, LOGO_LABELS[slot][0], LOGO_LABELS[slot][1])}
                      </div>
                      <input
                        ref={(element) => {
                          fileInputs.current[slot] = element;
                        }}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(event) => void uploadLogo(slot, event.target.files?.[0])}
                      />
                      <button
                        type="button"
                        disabled={busy === `logo:${slot}`}
                        onClick={() => fileInputs.current[slot]?.click()}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/5 disabled:opacity-60"
                      >
                        <UploadIcon className="size-3.5" />
                        {t(isArabic, "رفع", "Upload")}
                      </button>
                      {version ? (
                        <button
                          type="button"
                          disabled={busy === `logo:${slot}`}
                          onClick={() => void resetLogo(slot)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-white disabled:opacity-60"
                        >
                          <Undo2Icon className="size-3.5" />
                          {t(isArabic, "افتراضي", "Reset")}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
