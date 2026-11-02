import { tool } from "ai";
import { z } from "zod";

import { checkPending, clearPending, savePending } from "@/lib/create-confirm";
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

// The "create" tools offered to the model when DALEEL_ENABLE_CREATE=true. Creation is always two
// steps: create_document / create_folder only PREPARE a plan (stored on the server), and
// confirm_creation carries out the last plan, but only once the user has replied in a new message.

type Context = {
  // Gets a Graph token with write permission for the signed-in user (on-behalf-of).
  acquireWriteToken: () => Promise<string>;
  userId: string;
  threadId: string;
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
  "Nothing has been created yet. Show this plan to the user (location, file name, template, an outline of the content, and anything listed under warnings) and ask them to confirm. When the user replies with their confirmation, call confirm_creation (no arguments). Do not call confirm_creation in this same turn.";

type FolderParams = { driveId: string; library: string; folder: string[] };
type DocumentParams = {
  driveId: string;
  library: string;
  folder: string[];
  fileName: string;
  templateId: string;
  templateDriveId: string;
  templateName: string;
  fields: Record<string, string>;
  blocks: Block[];
};

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
        "PREPARE the creation of a folder (and any missing parent folders) in a document library. Nothing is created by this call: it returns a plan to show the user. After the user confirms in a later message, call confirm_creation.",
      inputSchema: z.object({
        library: z.string().min(1).describe("Library name, e.g. Proposals, Projects or Marketing."),
        folderPath: z.string().min(1).describe("Folder path inside the library, e.g. 2026/Acme Trading."),
      }),
      execute: async ({ library, folderPath }) =>
        run(async (token) => {
          const segments = parseFolderPath(folderPath);
          if (segments.length === 0) throw new SharePointError("Give a folder path to create.");
          const lib = await resolveLibrary(library);
          const missing = await missingFolders(token, lib.driveId, segments);
          if (missing.length === 0) {
            const existing = await itemAt(token, lib.driveId, segments);
            return { status: "nothing_to_do" as const, message: "That folder already exists.", url: existing?.webUrl };
          }
          const where = locationText(lib.label, segments);
          const planId = await savePending<FolderParams>(ctx, {
            action: "create_folder",
            params: { driveId: lib.driveId, library: lib.label, folder: segments },
            summary: where,
            messageCount: ctx.messageCount,
          });
          return {
            status: "confirmation_required" as const,
            planId,
            plan: { location: where, foldersToCreate: missing },
            message: NEEDS_CONFIRMATION,
          };
        }),
    }),

    create_document: tool({
      description:
        "PREPARE a new Word document made from a template, in a document library folder (missing folders are created). Nothing is created by this call: it returns a plan (location, file name, outline, warnings) to show the user. After the user confirms in a later message, call confirm_creation. Template placeholders: {{FieldName}} are filled from `fields`; {{Date}} is automatic; {{BODY}} receives `blocks`. Never overwrites.",
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
      }),
      execute: async ({ library, folderPath, fileName, templateName, fields, blocks }) =>
        run(async (token) => {
          const typedBlocks = blocks as Block[];
          validateBlocks(typedBlocks);
          const segments = parseFolderPath(folderPath);
          const name = sanitizeDocxName(fileName);
          const lib = await resolveLibrary(library);
          const template = await findTemplate(token, templateName);
          const cleanFields = Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [k.trim(), String(v)] as const),
          );

          // Build the document now so any problem shows in the plan, not after the user confirms.
          const templateBytes = await downloadItem(token, template.driveId, template.id);
          const filled = await fillTemplate(templateBytes, { fields: cleanFields, blocks: typedBlocks });
          const warnings: string[] = [];
          if (!filled.bodyPlaced) {
            warnings.push(
              `The template has no {{BODY}} marker, so the content will be added at the end of the document. Placeholders found in the template: ${filled.placeholdersFound.join(", ") || "none"}.`,
            );
          }
          if (filled.unreplaced.length > 0) {
            warnings.push(
              `These template fields have no value and will stay as {{...}} text: ${filled.unreplaced.join(", ")}. Ask the user for them, then prepare the plan again with those fields.`,
            );
          }
          const missing = await missingFolders(token, lib.driveId, segments);
          const taken = await itemAt(token, lib.driveId, [...segments, name]);
          if (taken) {
            warnings.push(`A file named "${name}" already exists there; the new document will get a numbered name and the existing one will not be touched.`);
          }

          const where = locationText(lib.label, segments);
          const planId = await savePending<DocumentParams>(ctx, {
            action: "create_document",
            params: {
              driveId: lib.driveId,
              library: lib.label,
              folder: segments,
              fileName: name,
              templateId: template.id,
              templateDriveId: template.driveId,
              templateName: template.name,
              fields: cleanFields,
              blocks: typedBlocks,
            },
            summary: `${where} / ${name}`,
            messageCount: ctx.messageCount,
          });
          return {
            status: "confirmation_required" as const,
            planId,
            plan: {
              location: where,
              fileName: name,
              template: template.name,
              foldersToCreate: missing,
              fieldsFilled: cleanFields,
              outline: outlineOf(typedBlocks),
              warnings,
            },
            message: NEEDS_CONFIRMATION,
          };
        }),
    }),

    confirm_creation: tool({
      description:
        "Carry out the plan that the user has just confirmed (the most recent create_document or create_folder plan). Call this with no arguments ONLY after the user has replied with their confirmation in a NEW message. If the user wants changes, prepare a new plan instead.",
      inputSchema: z.object({
        planId: z.string().optional().describe("The planId of the plan being confirmed (optional)."),
      }),
      execute: async ({ planId }) =>
        run(async (token) => {
          const checked = await checkPending<FolderParams | DocumentParams>(ctx, planId);
          if (!checked.ok) return { status: "confirmation_invalid" as const, message: checked.reason };
          const plan = checked.plan;

          if (plan.action === "create_folder") {
            const params = plan.params as FolderParams;
            const result = await ensureFolder(token, params.driveId, params.folder);
            await clearPending(ctx.userId, ctx.threadId);
            await ctx.audit("create_folder", plan.summary);
            return { status: "created" as const, location: plan.summary, createdFolders: result.created, url: result.webUrl };
          }

          const params = plan.params as DocumentParams;
          const templateBytes = await downloadItem(token, params.templateDriveId, params.templateId);
          const filled = await fillTemplate(templateBytes, { fields: params.fields, blocks: params.blocks });
          const folder = await ensureFolder(token, params.driveId, params.folder);
          const file = await uploadNewFile(token, params.driveId, params.folder, params.fileName, filled.buffer);
          await clearPending(ctx.userId, ctx.threadId);
          await ctx.audit("create_document", `${plan.summary} -> ${file.name}`);
          return {
            status: "created" as const,
            location: locationText(params.library, params.folder),
            fileName: file.name,
            createdFolders: folder.created,
            url: file.webUrl,
          };
        }),
    }),
  };
}
