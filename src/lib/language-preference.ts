import type { UIMessage } from "ai";

export type ConversationLanguage = "ar" | "en";

const englishPatterns = [
  /\benglish\b/i,
  /\bspeak in english\b/i,
  /\breply in english\b/i,
  /\brespond in english\b/i,
  /\bin english\b/i,
  /بالانجليزي/i,
  /بالإنجليزي/i,
  /باللغة الإنجليزية/i,
];

const arabicPatterns = [
  /\barabic\b/i,
  /\bspeak in arabic\b/i,
  /\breply in arabic\b/i,
  /\brespond in arabic\b/i,
  /\bin arabic\b/i,
  /بالعربي/i,
  /بالعربية/i,
  /باللغة العربية/i,
];

const extractUserText = (message: UIMessage) => {
  if (message.role !== "user") {
    return "";
  }

  const parts = Array.isArray((message as UIMessage & { parts?: unknown[] }).parts)
    ? ((message as UIMessage & { parts?: unknown[] }).parts as unknown[])
    : [];

  const textFromParts = parts
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      const candidate = part as { type?: string; text?: string };
      return candidate.type === "text" ? candidate.text ?? "" : "";
    })
    .join("\n")
    .trim();

  if (textFromParts) {
    return textFromParts;
  }

  const content = (message as UIMessage & { content?: unknown }).content;
  return typeof content === "string" ? content : "";
};

const detectLanguageInText = (text: string): ConversationLanguage | undefined => {
  if (!text.trim()) {
    return undefined;
  }

  if (englishPatterns.some((pattern) => pattern.test(text))) {
    return "en";
  }

  if (arabicPatterns.some((pattern) => pattern.test(text))) {
    return "ar";
  }

  return undefined;
};

export const resolveConversationLanguage = (
  messages: UIMessage[],
): ConversationLanguage => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = extractUserText(messages[index]);
    const detected = detectLanguageInText(text);

    if (detected) {
      return detected;
    }
  }

  return "ar";
};

export const buildLanguageDirective = (messages: UIMessage[]) => {
  const language = resolveConversationLanguage(messages);

  if (language === "en") {
    return [
      "Current conversation response language: English.",
      "The user explicitly requested English most recently, so answer entirely in English unless the user later switches back to Arabic.",
      "If the latest user message only changes the language, respond with a brief English acknowledgment and continue in English on later turns.",
      "When returning source links, print the full raw URL on its own line instead of markdown link text.",
    ].join(" ");
  }

  return [
    "Current conversation response language: Arabic.",
    "Answer entirely in Arabic unless the user later explicitly requests English.",
    "If the latest user message only changes the language, respond with a brief Arabic acknowledgment and continue in Arabic on later turns.",
    "When returning source links, print the full raw URL on its own line instead of markdown link text.",
  ].join(" ");
};
