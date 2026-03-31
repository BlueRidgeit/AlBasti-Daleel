import {
  extractTextFromDocument,
  pickRelevantSections,
} from "@/lib/document-extract";
import { env, hasServerAuthConfig } from "@/lib/env";
import { readIndexedDocument } from "@/lib/search-documents";

type GraphItemMetadata = {
  id: string;
  name: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  file?: {
    mimeType?: string;
  };
};

export type ReadDocumentResult = {
  itemId: string;
  title?: string;
  url?: string;
  lastModified?: string;
  strategy: "live-sharepoint" | "indexed-retrieval-fallback";
  excerpts: string[];
  caveats: string[];
};

export type ValidateDocumentAccessResult = {
  itemId: string;
  title?: string;
  url?: string;
  lastModified?: string;
  canAccess: boolean;
  method?:
    | "direct-drive-route"
    | "share-link-route"
    | "graph-token-unavailable"
    | "configuration-missing";
  reason: string;
  details?: string[];
};

const graphBaseUrl = "https://graph.microsoft.com/v1.0";

const toShareToken = (url: string) =>
  `u!${Buffer.from(url, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")}`;

const appendCaveat = async (
  itemId: string,
  question: string | undefined,
  caveat: string,
) => {
  const fallback = await readIndexedDocument(itemId, question);

  return {
    ...fallback,
    caveats: [...fallback.caveats, caveat],
  };
};

const readLiveDocument = async ({
  accessToken,
  metadataPath,
  contentPath,
  itemId,
  question,
}: {
  accessToken: string;
  metadataPath: string;
  contentPath: string;
  itemId: string;
  question?: string;
}) => {
  const metadata = await fetchGraphJson<GraphItemMetadata>(
    metadataPath,
    accessToken,
  );

  const content = await fetchGraphFile(contentPath, accessToken);

  const extractedText = await extractTextFromDocument(
    content,
    metadata.name,
    metadata.file?.mimeType,
  );

  return {
    itemId,
    title: metadata.name,
    url: metadata.webUrl,
    lastModified: metadata.lastModifiedDateTime,
    strategy: "live-sharepoint" as const,
    excerpts: pickRelevantSections(extractedText, question),
    caveats: [],
  };
};

const fetchDocumentMetadata = async ({
  accessToken,
  metadataPath,
}: {
  accessToken: string;
  metadataPath: string;
}) => {
  return fetchGraphJson<GraphItemMetadata>(metadataPath, accessToken);
};

const getGraphAccessToken = (request: Request, graphAccessToken?: string) => {
  if (graphAccessToken?.trim()) {
    return graphAccessToken.trim();
  }

  const forwardedToken = request.headers.get("x-ms-graph-access-token")?.trim();
  if (forwardedToken) {
    return forwardedToken;
  }

  return undefined;
};

const fetchGraphJson = async <T,>(
  path: string,
  accessToken: string,
): Promise<T> => {
  const response = await fetch(`${graphBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Microsoft Graph request failed (${response.status}): ${details}`);
  }

  return (await response.json()) as T;
};

const fetchGraphFile = async (path: string, accessToken: string) => {
  const response = await fetch(`${graphBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Microsoft Graph file download failed (${response.status}): ${details}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

export async function readDocument(
  request: Request,
  itemId: string,
  question?: string,
  graphAccessToken?: string,
  graphAccessError?: string,
): Promise<ReadDocumentResult> {
  const accessToken = getGraphAccessToken(request, graphAccessToken);

  if (!env.sharePointDriveId) {
    return appendCaveat(
      itemId,
      question,
      "Live SharePoint reading is not configured because SHAREPOINT_DRIVE_ID is missing.",
    );
  }

  if (!accessToken) {
    return appendCaveat(
      itemId,
      question,
      graphAccessError
        ? `Live SharePoint reading could not start because Microsoft Graph access could not be acquired for the signed-in user. ${graphAccessError}`
        : hasServerAuthConfig
          ? "Live SharePoint reading requires the user to sign in so the app can request Microsoft Graph access on their behalf."
          : "Live SharePoint reading is not configured yet, so this answer is based on indexed retrieval fallback.",
    );
  }

  try {
    return await readLiveDocument({
      accessToken,
      metadataPath: `/drives/${env.sharePointDriveId}/items/${itemId}?$select=id,name,webUrl,lastModifiedDateTime,file`,
      contentPath: `/drives/${env.sharePointDriveId}/items/${itemId}/content`,
      itemId,
      question,
    });
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Unknown SharePoint read error.";

    const indexedMetadata = await readIndexedDocument(itemId, undefined).catch(
      () => undefined,
    );

    if (indexedMetadata?.url) {
      try {
        const shareToken = toShareToken(indexedMetadata.url);

        return await readLiveDocument({
          accessToken,
          metadataPath: `/shares/${shareToken}/driveItem?$select=id,name,webUrl,lastModifiedDateTime,file`,
          contentPath: `/shares/${shareToken}/driveItem/content`,
          itemId,
          question,
        });
      } catch (shareError) {
        const shareDetails =
          shareError instanceof Error
            ? shareError.message
            : "Unknown SharePoint share-link read error.";

        const combinedCaveat =
          details.includes("(401)") || details.includes("(403)")
            ? `The signed-in user could not open this SharePoint file through the direct drive route, and the share-link route also failed. Direct route: ${details} Share-link route: ${shareDetails}`
            : `A live SharePoint read failed on both the direct drive route and the share-link route. Direct route: ${details} Share-link route: ${shareDetails}`;

        return appendCaveat(itemId, question, combinedCaveat);
      }
    }

    const accessCaveat =
      details.includes("(401)") || details.includes("(403)")
        ? "The signed-in user could not open this SharePoint file with their current permissions, so the answer fell back to indexed retrieval."
        : `A live SharePoint read failed, so the answer fell back to indexed retrieval. Details: ${details}`;

    return appendCaveat(itemId, question, accessCaveat);
  }
}

export async function validateDocumentAccess(
  request: Request,
  itemId: string,
  graphAccessToken?: string,
  graphAccessError?: string,
): Promise<ValidateDocumentAccessResult> {
  const accessToken = getGraphAccessToken(request, graphAccessToken);

  if (!env.sharePointDriveId) {
    return {
      itemId,
      canAccess: false,
      method: "configuration-missing",
      reason:
        "Live SharePoint access validation is not configured because SHAREPOINT_DRIVE_ID is missing.",
    };
  }

  if (!accessToken) {
    return {
      itemId,
      canAccess: false,
      method: "graph-token-unavailable",
      reason: graphAccessError
        ? `Microsoft Graph access could not be acquired for the signed-in user. ${graphAccessError}`
        : "Microsoft Graph access is not available for the current request.",
    };
  }

  const metadataPath = `/drives/${env.sharePointDriveId}/items/${itemId}?$select=id,name,webUrl,lastModifiedDateTime,file`;

  try {
    const metadata = await fetchDocumentMetadata({
      accessToken,
      metadataPath,
    });

    return {
      itemId,
      title: metadata.name,
      url: metadata.webUrl,
      lastModified: metadata.lastModifiedDateTime,
      canAccess: true,
      method: "direct-drive-route",
      reason:
        "The signed-in user can access this SharePoint document through the direct drive route.",
    };
  } catch (directError) {
    const directDetails =
      directError instanceof Error ? directError.message : "Unknown direct-route error.";

    const indexedMetadata = await readIndexedDocument(itemId, undefined).catch(
      () => undefined,
    );

    if (indexedMetadata?.url) {
      try {
        const shareToken = toShareToken(indexedMetadata.url);
        const metadata = await fetchDocumentMetadata({
          accessToken,
          metadataPath: `/shares/${shareToken}/driveItem?$select=id,name,webUrl,lastModifiedDateTime,file`,
        });

        return {
          itemId,
          title: metadata.name,
          url: metadata.webUrl,
          lastModified: metadata.lastModifiedDateTime,
          canAccess: true,
          method: "share-link-route",
          reason:
            "The signed-in user can access this SharePoint document through the share-link route.",
          details: [directDetails],
        };
      } catch (shareError) {
        const shareDetails =
          shareError instanceof Error
            ? shareError.message
            : "Unknown share-link-route error.";

        return {
          itemId,
          title: indexedMetadata.title,
          url: indexedMetadata.url,
          lastModified: indexedMetadata.lastModified,
          canAccess: false,
          method: "share-link-route",
          reason:
            "The signed-in user could not access this SharePoint file through either the direct drive route or the share-link route.",
          details: [directDetails, shareDetails],
        };
      }
    }

    return {
      itemId,
      canAccess: false,
      method: "direct-drive-route",
      reason:
        "The signed-in user could not access this SharePoint file through the direct drive route, and no indexed SharePoint link was available for a secondary check.",
      details: [directDetails],
    };
  }
}
