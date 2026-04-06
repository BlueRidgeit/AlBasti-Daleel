import mammoth from "mammoth";

const getFileExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot === -1 ? "" : fileName.slice(lastDot).toLowerCase();
};

export const isSupportedDocument = (
  fileName: string,
  mimeType?: string,
) => {
  const extension = getFileExtension(fileName);

  return (
    mimeType?.startsWith("text/") === true ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/pdf" ||
    extension === ".txt" ||
    extension === ".docx" ||
    extension === ".pdf"
  );
};

export const extractTextFromDocument = async (
  buffer: Buffer,
  fileName: string,
  mimeType?: string,
) => {
  const extension = getFileExtension(fileName);

  if (mimeType?.startsWith("text/") || extension === ".txt") {
    return new TextDecoder("utf-8").decode(buffer);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType === "application/pdf" || extension === ".pdf") {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse: (source: Buffer) => Promise<{ text: string }> =
      "default" in pdfParseModule
        ? (pdfParseModule.default as (source: Buffer) => Promise<{ text: string }>)
        : (pdfParseModule as unknown as (
            source: Buffer,
          ) => Promise<{ text: string }>);
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }

  throw new Error(
    `Unsupported file type for document reads: ${mimeType ?? extension ?? "unknown"}.`,
  );
};

const splitIntoSections = (text: string) => {
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const sections: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= 1400) {
      current = next;
      continue;
    }

    if (current) {
      sections.push(current);
    }

    current = paragraph;
  }

  if (current) {
    sections.push(current);
  }

  return sections.length > 0 ? sections : [normalized];
};

const scoreSection = (section: string, query: string) => {
  const haystack = section.toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);

  if (terms.length === 0) {
    return 0;
  }

  return terms.reduce((score, term) => {
    if (!haystack.includes(term)) {
      return score;
    }

    return score + 1 + haystack.split(term).length - 1;
  }, 0);
};

export const pickRelevantSections = (text: string, question?: string) => {
  const sections = splitIntoSections(text);

  if (sections.length === 0) {
    return [];
  }

  if (!question?.trim()) {
    return sections.slice(0, 3);
  }

  return [...sections]
    .map((section) => ({
      section,
      score: scoreSection(section, question),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => entry.section);
};
