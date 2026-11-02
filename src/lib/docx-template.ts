import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

// Fills a Word template (.docx) with text. The template author writes:
//   {{FieldName}}  anywhere (body, headers, footers) - replaced with the matching field value
//   {{BODY}}       on a paragraph of its own - replaced by the generated content, using the
//                  template's own styles (Heading 1-3, List Bullet, List Number, Table Grid)
// so the result keeps the template's letterhead, logo, fonts, headers and footers.

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "table"; header?: string[]; rows: string[][] };

export type FillResult = {
  buffer: Buffer;
  bodyPlaced: boolean;
  unreplaced: string[];
};

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;
const ARABIC = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const MAX_BLOCKS = 500;
const MAX_CHARS = 250_000;

type El = Element;
type Doc = Document;

const parse = (xml: string): Doc => new DOMParser().parseFromString(xml, "text/xml") as unknown as Doc;
const serialize = (doc: Doc): string => new XMLSerializer().serializeToString(doc as never);

const byTag = (root: El | Doc, tag: string): El[] =>
  Array.from((root as El).getElementsByTagName(tag) as unknown as ArrayLike<El>);

const paragraphText = (p: El): string =>
  byTag(p, "w:t")
    .map((t) => t.textContent ?? "")
    .join("");

// Put the whole paragraph text into its first text run (keeping that run's formatting) and
// empty the others. Placeholders are often split over several runs by Word's editing history.
const setParagraphText = (p: El, text: string) => {
  const texts = byTag(p, "w:t");
  if (texts.length === 0) return;
  texts[0].textContent = text;
  texts[0].setAttribute("xml:space", "preserve");
  for (let i = 1; i < texts.length; i++) texts[i].textContent = "";
};

const cleanValue = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();

const todayText = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function replaceFields(doc: Doc, fields: Map<string, string>, leftover: Set<string>) {
  for (const p of byTag(doc, "w:p")) {
    const text = paragraphText(p);
    if (!text.includes("{{")) continue;
    // The BODY marker paragraph is handled separately.
    if (/^\s*\{\{\s*BODY\s*\}\}\s*$/i.test(text)) continue;
    let changed = false;
    const next = text.replace(PLACEHOLDER, (whole, name: string) => {
      const value = fields.get(name.trim().toLowerCase());
      if (value === undefined) {
        leftover.add(name.trim());
        return whole;
      }
      changed = true;
      return value;
    });
    if (changed) setParagraphText(p, next);
  }
}

// ---------------------------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------------------------

type StyleIds = {
  heading: Partial<Record<1 | 2 | 3, string>>;
  bullet?: string;
  numbered?: string;
  table?: string;
};

function readStyles(stylesXml: string | undefined): StyleIds {
  const ids: StyleIds = { heading: {} };
  if (!stylesXml) return ids;
  const doc = parse(stylesXml);
  for (const style of byTag(doc, "w:style")) {
    const id = style.getAttribute("w:styleId");
    const nameEl = byTag(style, "w:name")[0];
    const name = nameEl?.getAttribute("w:val")?.toLowerCase();
    if (!id || !name) continue;
    if (name === "heading 1") ids.heading[1] = id;
    else if (name === "heading 2") ids.heading[2] = id;
    else if (name === "heading 3") ids.heading[3] = id;
    else if (name === "list bullet") ids.bullet = id;
    else if (name === "list number") ids.numbered = id;
    else if (name === "table grid") ids.table = id;
  }
  return ids;
}

// ---------------------------------------------------------------------------------------------
// Block -> WordprocessingML
// ---------------------------------------------------------------------------------------------

const el = (doc: Doc, tag: string, attrs: Record<string, string> = {}): El => {
  const node = doc.createElementNS(W, tag) as unknown as El;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

// **bold** inline markers -> runs
function runs(doc: Doc, text: string, opts: { rtl: boolean; forceBold?: boolean; size?: number }): El[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((part) => part !== "");
  return parts.map((part) => {
    const bold = /^\*\*[^*]+\*\*$/.test(part);
    const run = el(doc, "w:r");
    const rPr = el(doc, "w:rPr");
    if (bold || opts.forceBold) rPr.appendChild(el(doc, "w:b"));
    if (opts.size) rPr.appendChild(el(doc, "w:sz", { "w:val": String(opts.size) }));
    if (opts.rtl) rPr.appendChild(el(doc, "w:rtl"));
    if (rPr.childNodes.length > 0) run.appendChild(rPr);
    const t = el(doc, "w:t");
    t.setAttribute("xml:space", "preserve");
    t.textContent = bold ? part.slice(2, -2) : part;
    run.appendChild(t);
    return run;
  });
}

function paragraph(
  doc: Doc,
  text: string,
  opts: { styleId?: string; forceBold?: boolean; size?: number; indent?: boolean } = {},
): El {
  const rtl = ARABIC.test(text);
  const p = el(doc, "w:p");
  const pPr = el(doc, "w:pPr");
  if (opts.styleId) pPr.appendChild(el(doc, "w:pStyle", { "w:val": opts.styleId }));
  if (opts.indent) pPr.appendChild(el(doc, "w:ind", { "w:left": "720", "w:hanging": "360" }));
  if (rtl) pPr.appendChild(el(doc, "w:bidi"));
  if (pPr.childNodes.length > 0) p.appendChild(pPr);
  for (const run of runs(doc, text, { rtl, forceBold: opts.forceBold, size: opts.size })) p.appendChild(run);
  return p;
}

function table(doc: Doc, block: Extract<Block, { type: "table" }>, styles: StyleIds): El[] {
  const tbl = el(doc, "w:tbl");
  const tblPr = el(doc, "w:tblPr");
  if (styles.table) {
    tblPr.appendChild(el(doc, "w:tblStyle", { "w:val": styles.table }));
  } else {
    const borders = el(doc, "w:tblBorders");
    for (const side of ["top", "left", "bottom", "right", "insideH", "insideV"]) {
      borders.appendChild(el(doc, `w:${side}`, { "w:val": "single", "w:sz": "4", "w:space": "0", "w:color": "999999" }));
    }
    tblPr.appendChild(borders);
  }
  tblPr.appendChild(el(doc, "w:tblW", { "w:w": "5000", "w:type": "pct" }));
  tbl.appendChild(tblPr);

  const width = Math.max(block.header?.length ?? 0, ...block.rows.map((r) => r.length), 1);
  tbl.appendChild(
    (() => {
      const grid = el(doc, "w:tblGrid");
      for (let i = 0; i < width; i++) grid.appendChild(el(doc, "w:gridCol", { "w:w": String(Math.floor(9000 / width)) }));
      return grid;
    })(),
  );

  const addRow = (cells: string[], header: boolean) => {
    const tr = el(doc, "w:tr");
    if (header) {
      const trPr = el(doc, "w:trPr");
      trPr.appendChild(el(doc, "w:tblHeader"));
      tr.appendChild(trPr);
    }
    for (let i = 0; i < width; i++) {
      const tc = el(doc, "w:tc");
      const tcPr = el(doc, "w:tcPr");
      tcPr.appendChild(el(doc, "w:tcW", { "w:w": String(Math.floor(9000 / width)), "w:type": "dxa" }));
      if (header) tcPr.appendChild(el(doc, "w:shd", { "w:val": "clear", "w:color": "auto", "w:fill": "E7E6E6" }));
      tc.appendChild(tcPr);
      tc.appendChild(paragraph(doc, cells[i] ?? "", { forceBold: header }));
      tr.appendChild(tc);
    }
    tbl.appendChild(tr);
  };

  if (block.header && block.header.length > 0) addRow(block.header, true);
  for (const row of block.rows) addRow(row, false);
  // A table must be followed by a paragraph.
  return [tbl, el(doc, "w:p")];
}

function buildBlocks(doc: Doc, blocks: Block[], styles: StyleIds): El[] {
  const out: El[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const styleId = styles.heading[block.level];
        out.push(
          paragraph(doc, block.text, {
            styleId,
            forceBold: !styleId,
            size: styleId ? undefined : block.level === 1 ? 32 : block.level === 2 ? 28 : 24,
          }),
        );
        break;
      }
      case "paragraph":
        out.push(paragraph(doc, block.text));
        break;
      case "bullets":
        for (const item of block.items) {
          out.push(
            styles.bullet
              ? paragraph(doc, item, { styleId: styles.bullet })
              : paragraph(doc, `• ${item}`, { indent: true }),
          );
        }
        break;
      case "numbered":
        block.items.forEach((item, index) => {
          out.push(
            styles.numbered
              ? paragraph(doc, item, { styleId: styles.numbered })
              : paragraph(doc, `${index + 1}. ${item}`, { indent: true }),
          );
        });
        break;
      case "table":
        out.push(...table(doc, block, styles));
        break;
    }
  }
  return out;
}

export function validateBlocks(blocks: Block[]) {
  if (blocks.length > MAX_BLOCKS) throw new Error(`Too many content blocks (maximum ${MAX_BLOCKS}).`);
  const chars = JSON.stringify(blocks).length;
  if (chars > MAX_CHARS) throw new Error("The document content is too long.");
}

// Short human-readable outline of the content, shown to the user before they confirm.
export function outlineOf(blocks: Block[]): string[] {
  const lines: string[] = [];
  let paragraphs = 0;
  let bullets = 0;
  let tables = 0;
  for (const block of blocks) {
    if (block.type === "heading") lines.push(`${"  ".repeat(block.level - 1)}${block.text}`);
    else if (block.type === "paragraph") paragraphs += 1;
    else if (block.type === "table") tables += 1;
    else bullets += block.items.length;
  }
  lines.push(`(${paragraphs} paragraphs, ${bullets} list items, ${tables} tables)`);
  return lines;
}

export async function fillTemplate(
  template: Buffer,
  input: { fields: Record<string, string>; blocks: Block[] },
): Promise<FillResult> {
  validateBlocks(input.blocks);

  const zip = await JSZip.loadAsync(template);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("This file is not a valid Word (.docx) document.");

  const fields = new Map<string, string>();
  fields.set("date", todayText());
  for (const [name, value] of Object.entries(input.fields)) {
    fields.set(name.trim().toLowerCase(), cleanValue(String(value ?? "")));
  }

  const styles = readStyles(await zip.file("word/styles.xml")?.async("string"));
  const leftover = new Set<string>();

  // Headers / footers: fields only.
  const partNames = Object.keys(zip.files).filter((name) => /^word\/(header|footer)\d*\.xml$/.test(name));
  for (const name of partNames) {
    const doc = parse(await zip.file(name)!.async("string"));
    replaceFields(doc, fields, leftover);
    zip.file(name, serialize(doc));
  }

  // Main document: fields, then the BODY marker.
  const doc = parse(await documentFile.async("string"));
  replaceFields(doc, fields, leftover);

  const content = buildBlocks(doc, input.blocks, styles);
  let bodyPlaced = false;
  for (const p of byTag(doc, "w:p")) {
    if (/^\s*\{\{\s*BODY\s*\}\}\s*$/i.test(paragraphText(p))) {
      const parent = p.parentNode!;
      for (const node of content) parent.insertBefore(node, p);
      parent.removeChild(p);
      bodyPlaced = true;
      break;
    }
  }
  if (!bodyPlaced) {
    // No marker: append before the final section properties so the content is not lost.
    const body = byTag(doc, "w:body")[0];
    const sect = Array.from(body.childNodes as unknown as ArrayLike<Node>).find(
      (node) => (node as El).nodeName === "w:sectPr",
    );
    for (const node of content) {
      if (sect) body.insertBefore(node, sect);
      else body.appendChild(node);
    }
  }
  zip.file("word/document.xml", serialize(doc));

  return {
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    bodyPlaced,
    unreplaced: Array.from(leftover).filter((name) => name.toLowerCase() !== "body"),
  };
}
