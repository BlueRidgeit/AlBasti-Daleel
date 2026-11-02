import { tool } from "ai";
import { z } from "zod";

import { signPlan, verifyPlan } from "@/lib/create-confirm";
import { fillTemplate, outlineOf, validateBlocks, type Block } from "@/lib/docx-template";
import {
  downloadItem,
  ensureFolder,
  findTemplate,
  itemAt,
  listTemplates,
  missingFolders,
  parseFolderPath,
  resolveLibrary,
  sanitizeDocxName,
  SharePointError,
  uploadNewFile,
} from "@/lib/sharepoint-write";

// The "create" tools offered to the model when DALEEL_ENABLE_CREATE=true. Every creation is a
// two-step call: a preview that returns a plan + signed token, then (only after the user has
// replied in a new message) the same call again with that token.

type Context = {
  // Gets a Graph token with write permission for the signed-in user (on-behalf-of).
  acquireWriteToken: () => Promise<string>;
  userId: string;
  messageCount: number;
  audit: (event: string, detail: string) => Promise<void>;
};

const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: z.string().min(1) }),
  z.object({ type: z.literal("paragraph"), text: z.string().min(1) }),
  z.object({ type: z.literal("bullets"), items: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal("numbered"), items: z.array(z.string().min(1)).min(1) }),
  z.object({
    type: z.literal("table"),
    header: z.array(z.string()).optional(),
    rows: z.array(z.array(z.string())).min(1),
  }),
]);

const locationText = (library: string, segments: string[]) => [library, ...segments].join(" / ");

const NEEDS_CONFIRMATION =
  "Show this plan to the user (location, file name, template, an outline of the content, and anything listed under warnings) and ask them to confirm. Do NOT call this tool again until the user has replied in a new message. Then call it again with exactly the same arguments plus confirmationToken.";

export function buildCreateTools(ctx: Context) {
  let writeToken: string | undefined;
  let writeTokenError: string | undefined;

  const getToken = async (): Promise<string | undefined> => {
    if (writeToken) return writeToken;
    if (writeTokenError) return undefined;
    try {
      writeToken = await ctx.acquireWriteToken();
    } catch (error) {
      console.error("Graph write token (OBO) failed", error);
      writeTokenError =
        "Daleel has not been granted permission to create files yet. An administrator needs to grant the Files.ReadWrite.All permission to the Daleel app.";
    }
    return writeToken;
  };

  const run = async <T>(fn: (token: string) => Promise<T>) => {
    const token = await getToken();
    if (!token) return { status: "not_permitted" as const, message: writeTokenError };
    try {
      return await fn(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (!(error instanceof SharePointError)) console.error("create tool failed", error);
      return { status: "error" as const, message };
    }
  };

  return {
    list_templates: tool({
      description:
        "List the Word templates (.docx) available for creating new documents. Call this before create_document when the user has not named a template.",
      inputSchema: z.object({}),
      execute: async () =>
        run(async (token) => {
          const { location, templates } = await listTemplates(token);
          return {
            status: "ok" as const,
            location,
            templates: templates.map((t) => ({ name: t.name, url: t.webUrl })),
            message:
              templates.length === 0
                ? `No templates found in ${location}. Ask the user to add a Word template there.`
                : undefined,
          };
        }),
    }),

    create_folder: tool({
      description:
        "Create a folder (and any missing parent folders) in a document library, as the signed-in user. Two steps: call without confirmationToken to get a plan, ask the user to confirm, then call again with the token.",
      inputSchema: z.object({
        library: z.string().min(1).describe("Library name, e.g. Proposals, Projects or Marketing."),
        folderPath: z.string().min(1).describe("Folder path inside the library, e.g. 2026/Acme Trading."),
        confirmationToken: z.string().optional().describe("Only after the user confirmed the plan."),
      }),
      execute: async ({ library, folderPath, confirmationToken }) =>
        run(async (token) => {
          const segments = parseFolderPath(folderPath);
          if (segments.length === 0) throw new SharePointError("Give a folder path to create.");
          const lib = await resolveLibrary(library);
          const missing = await missingFolders(token, lib.driveId, segments);
          if (missing.length === 0) {
            const existing = await itemAt(token, lib.driveId, segments);
            return {
              status: "nothing_to_do" as const,
              message: "That folder already exists.",
              url: existing?.webUrl,
            };
          }

          const plan = { action: "create_folder", library: lib.label, folder: segments };
          const where = locationText(lib.label, segments);

          if (!confirmationToken) {
            return {
              status: "confirmation_required" as const,
              plan: { location: where, foldersToCreate: missing },
              confirmationToken: signPlan(plan, ctx),
              message: NEEDS_CONFIRMATION,
            };
          }

          const verified = verifyPlan(confirmationToken, plan, ctx);
          if (!verified.ok) return { status: "confirmation_invalid" as const, message: verified.reason };

          const result = await ensureFolder(token, lib.driveId, segments);
          await ctx.audit("create_folder", where);
          return { status: "created" as const, location: where, createdFolders: result.created, url: result.webUrl };
        }),
    }),

    create_document: tool({
      description:
        "Create a new Word document from a template, in a document library folder (missing folders are created), as the signed-in user. Never overwrites. Two steps: call without confirmationToken to get a plan, ask the user to confirm, then call again with the same arguments plus the token. Template placeholders: {{FieldName}} are filled from `fields`; {{Date}} is automatic; {{BODY}} receives `blocks`.",
      inputSchema: z.object({
        library: z.string().min(1).describe("Library name, e.g. Proposals."),
        folderPath: z.string().default("").describe("Folder path inside the library, e.g. 2026/Acme Trading."),
        fileName: z.string().min(1).describe("File name, e.g. Acme Proposal.docx."),
        templateName: z.string().min(1).describe("Template name from list_templates."),
        fields: z
          .record(z.string(), z.string())
          .default({})
          .describe("Values for the template's {{FieldName}} placeholders, e.g. Title, ClientName, Reference."),
        blocks: z.array(blockSchema).min(1).describe("The document content, in order."),
        confirmationToken: z.string().optional().describe("Only after the user confirmed the plan."),
      }),
      execute: async ({ library, folderPath, fileName, templateName, fields, blocks, confirmationToken }) =>
        run(async (token) => {
          const typedBlocks = blocks as Block[];
          validateBlocks(typedBlocks);
          const segments = parseFolderPath(folderPath);
          const name = sanitizeDocxName(fileName);
          const lib = await resolveLibrary(library);
          const template = await findTemplate(token, templateName);

          const normalisedFields = Object.fromEntries(
            Object.entries(fields)
              .map(([k, v]) => [k.trim(), String(v)] as const)
              .sort(([a], [b]) => a.localeCompare(b)),
          );
          const plan = {
            action: "create_document",
            library: lib.label,
            folder: segments,
            fileName: name,
            template: template.name,
            fields: normalisedFields,
            blocks: typedBlocks,
          };
          const where = locationText(lib.label, segments);

          // Build the document up front so problems show in the preview, not after the user confirms.
          const templateBytes = await downloadItem(token, template.driveId, template.id);
          const filled = await fillTemplate(templateBytes, { fields: normalisedFields, blocks: typedBlocks });
          const warnings: string[] = [];
          if (!filled.bodyPlaced) warnings.push("The template has no {{BODY}} marker, so the content will be added at the end.");
          if (filled.unreplaced.length > 0) {
            warnings.push(
              `These template fields have no value and will stay as {{...}} text: ${filled.unreplaced.join(", ")}. Ask the user for them or pass them in fields.`,
            );
          }

          if (!confirmationToken) {
            const missing = await missingFolders(token, lib.driveId, segments);
            const taken = await itemAt(token, lib.driveId, [...segments, name]);
            if (taken) warnings.push(`A file named "${name}" already exists there; the new document will get a numbered name and the existing one will not be touched.`);
            return {
              status: "confirmation_required" as const,
              plan: {
                location: where,
                fileName: name,
                template: template.name,
                foldersToCreate: missing,
                fieldsFilled: normalisedFields,
                outline: outlineOf(typedBlocks),
                warnings,
              },
              confirmationToken: signPlan(plan, ctx),
              message: NEEDS_CONFIRMATION,
            };
          }

          const verified = verifyPlan(confirmationToken, plan, ctx);
          if (!verified.ok) return { status: "confirmation_invalid" as const, message: verified.reason };

          const folder = await ensureFolder(token, lib.driveId, segments);
          const file = await uploadNewFile(token, lib.driveId, segments, name, filled.buffer);
          await ctx.audit("create_document", `${where} / ${file.name}`);
          return {
            status: "created" as const,
            location: where,
            fileName: file.name,
            createdFolders: folder.created,
            url: file.webUrl,
            warnings,
          };
        }),
    }),
  };
}
