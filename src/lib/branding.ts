// Admin-editable look & feel. Pure helpers shared by the server (SSR theme injection, API
// validation) and the browser (live preview). Nothing here touches the database.

export const COLOR_KEYS = [
  "primary",
  "primaryText",
  "accent",
  "accentText",
  "navBg",
  "navText",
  "pageBgFrom",
  "pageBgTo",
  "text",
  "userBubble",
  "userBubbleText",
  "assistantBubble",
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export const FONT_KEYS = ["cairo", "tajawal", "inter", "system"] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export const LOGO_SLOTS = ["nav", "settings", "favicon"] as const;
export type LogoSlot = (typeof LOGO_SLOTS)[number];

export type Branding = {
  colors: Partial<Record<ColorKey, string>>;
  font?: FontKey;
  appName?: string;
  defaultLocale?: "en" | "ar";
  // Version (upload time, ms) per slot; presence means a custom logo exists.
  logos: Partial<Record<LogoSlot, number>>;
};

// What the built-in theme looks like today, as hex, so pickers can show sensible starting
// values. These are display defaults only: a colour that was never saved is never injected.
export const DEFAULT_COLORS: Record<ColorKey, string> = {
  primary: "#26358b",
  primaryText: "#ffffff",
  accent: "#dab74c",
  accentText: "#ffffff",
  navBg: "#26358b",
  navText: "#ffffff",
  pageBgFrom: "#f6f4f0",
  pageBgTo: "#ece7de",
  text: "#0f172a",
  userBubble: "#26358b",
  userBubbleText: "#ffffff",
  assistantBubble: "#ffffff",
};

export const FONT_STACKS: Record<FontKey, string> = {
  cairo: "var(--font-cairo), system-ui, sans-serif",
  tajawal: "var(--font-tajawal), var(--font-cairo), system-ui, sans-serif",
  inter: "var(--font-inter), var(--font-cairo), system-ui, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

export const FONT_LABELS: Record<FontKey, string> = {
  cairo: "Cairo (default)",
  tajawal: "Tajawal",
  inter: "Inter",
  system: "System font",
};

export const THEME_PRESETS: Array<{
  id: string;
  label: string;
  colors: Partial<Record<ColorKey, string>>;
}> = [
  { id: "default", label: "Default (navy & gold)", colors: {} },
  {
    id: "teal",
    label: "Teal & sand",
    colors: {
      primary: "#0f766e",
      accent: "#d9a441",
      navBg: "#115e59",
      pageBgFrom: "#f5f7f6",
      pageBgTo: "#e4ebe8",
      userBubble: "#0f766e",
    },
  },
  {
    id: "charcoal",
    label: "Charcoal & orange",
    colors: {
      primary: "#1f2937",
      accent: "#f97316",
      navBg: "#111827",
      pageBgFrom: "#f5f5f4",
      pageBgTo: "#e7e5e4",
      userBubble: "#1f2937",
    },
  },
  {
    id: "burgundy",
    label: "Burgundy & gold",
    colors: {
      primary: "#7f1d3a",
      accent: "#c9a227",
      navBg: "#5f1530",
      pageBgFrom: "#f8f4f4",
      pageBgTo: "#eddede",
      userBubble: "#7f1d3a",
    },
  },
  {
    id: "ocean",
    label: "Ocean blue",
    colors: {
      primary: "#0369a1",
      accent: "#06b6d4",
      navBg: "#0c4a6e",
      pageBgFrom: "#f3f8fb",
      pageBgTo: "#e0ecf3",
      userBubble: "#0369a1",
    },
  },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && HEX.test(value);

// Validates untrusted input down to a safe Branding object (anything unknown is dropped).
export function sanitizeBranding(input: unknown): Branding {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const colorsIn = (source.colors && typeof source.colors === "object"
    ? source.colors
    : {}) as Record<string, unknown>;

  const colors: Branding["colors"] = {};
  for (const key of COLOR_KEYS) {
    const value = colorsIn[key];
    if (isHexColor(value)) {
      colors[key] = value.toLowerCase();
    }
  }

  const logosIn = (source.logos && typeof source.logos === "object"
    ? source.logos
    : {}) as Record<string, unknown>;
  const logos: Branding["logos"] = {};
  for (const slot of LOGO_SLOTS) {
    const value = logosIn[slot];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      logos[slot] = Math.floor(value);
    }
  }

  const font = FONT_KEYS.find((candidate) => candidate === source.font);
  const appName =
    typeof source.appName === "string" ? source.appName.trim().slice(0, 60) : "";
  const defaultLocale =
    source.defaultLocale === "en" || source.defaultLocale === "ar"
      ? source.defaultLocale
      : undefined;

  return {
    colors,
    ...(font && font !== "cairo" ? { font } : {}),
    ...(appName ? { appName } : {}),
    ...(defaultLocale ? { defaultLocale } : {}),
    logos,
  };
}

const channel = (value: number) => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

// Black or white, whichever reads better on the given background.
export function readableOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.45 ? "#111827" : "#ffffff";
}

// CSS for the saved theme. Returns "" when nothing is customised, so the stock look is untouched.
export function buildThemeCss(branding: Branding): string {
  const c = branding.colors;
  const vars: string[] = [];
  const set = (name: string, value: string) => vars.push(`${name}:${value}`);

  if (c.primary) {
    const fg = c.primaryText ?? readableOn(c.primary);
    set("--primary", c.primary);
    set("--primary-foreground", fg);
    set("--ring", c.primary);
    set("--chart-1", c.primary);
    set("--bubble-user", c.userBubble ?? c.primary);
    set("--bubble-user-text", c.userBubbleText ?? fg);
    set("--page-glow-1", `color-mix(in srgb, ${c.primary} 12%, transparent)`);
    set("--tint-1", `color-mix(in srgb, ${c.primary} 8%, transparent)`);
  } else if (c.primaryText) {
    set("--primary-foreground", c.primaryText);
  }

  if (c.accent) {
    const fg = c.accentText ?? readableOn(c.accent);
    set("--sidebar-primary", c.accent);
    set("--sidebar-ring", c.accent);
    set("--chart-3", c.accent);
    set("--nav-cta", c.accent);
    set("--nav-cta-text", fg);
    set("--page-glow-2", `color-mix(in srgb, ${c.accent} 18%, transparent)`);
    set("--tint-2", `color-mix(in srgb, ${c.accent} 14%, transparent)`);
  } else if (c.accentText) {
    set("--nav-cta-text", c.accentText);
  }

  if (c.navBg) {
    set("--sidebar", c.navBg);
    set("--sidebar-foreground", c.navText ?? readableOn(c.navBg));
    set("--sidebar-accent", `color-mix(in srgb, ${c.navBg} 80%, black)`);
    set("--sidebar-border", `color-mix(in srgb, ${c.navBg} 85%, black)`);
    set("--sidebar-accent-foreground", c.navText ?? readableOn(c.navBg));
  } else if (c.navText) {
    set("--sidebar-foreground", c.navText);
    set("--sidebar-accent-foreground", c.navText);
  }

  if (c.pageBgFrom) set("--page-bg-from", c.pageBgFrom);
  if (c.pageBgTo) set("--page-bg-to", c.pageBgTo);
  if (c.pageBgFrom && !c.pageBgTo) set("--page-bg-to", c.pageBgFrom);
  if (!c.pageBgFrom && c.pageBgTo) set("--page-bg-from", c.pageBgTo);

  if (c.text) {
    set("--foreground", c.text);
    set("--card-foreground", c.text);
    set("--color-slate-950", c.text);
    set("--color-slate-900", c.text);
    set("--color-slate-800", `color-mix(in srgb, ${c.text} 88%, white)`);
    set("--color-slate-700", `color-mix(in srgb, ${c.text} 78%, white)`);
  }

  if (c.assistantBubble) set("--bubble-assistant", c.assistantBubble);

  if (branding.font) set("--app-font", FONT_STACKS[branding.font]);

  return vars.length > 0 ? `:root{${vars.join(";")}}` : "";
}

export const logoUrl = (slot: LogoSlot, version: number) =>
  `/api/branding/asset/${slot}?v=${version}`;
