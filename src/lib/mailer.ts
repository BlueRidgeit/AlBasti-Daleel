import { env, hasMailConfig } from "@/lib/env";

// Sends mail through Microsoft Graph (app-only, Mail.Send) from the MAIL_FROM mailbox.
// No dependencies: a client-credentials token request plus one sendMail call.

let tokenCache: { token: string; expires: number } | null = null;

async function getGraphMailToken(): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${env.mailTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.mailClientId!,
        client_secret: env.mailClientSecret!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(
      `Could not get a mail token: ${data.error_description?.split("\r")[0] ?? response.status}`,
    );
  }

  tokenCache = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

export type MailResult =
  | { status: "sent" }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

export async function sendMail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<MailResult> {
  if (!hasMailConfig) {
    return { status: "not_configured" };
  }

  try {
    const token = await getGraphMailToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.mailFrom!)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: args.subject,
            body: { contentType: "HTML", content: args.html },
            toRecipients: [{ emailAddress: { address: args.to } }],
          },
          saveToSentItems: false,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      const detail = body.error?.message ?? body.error?.code ?? `HTTP ${response.status}`;
      console.error("Graph sendMail failed", response.status, detail);
      return { status: "failed", error: detail };
    }

    return { status: "sent" };
  } catch (error) {
    console.error("Mail send error", error);
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
