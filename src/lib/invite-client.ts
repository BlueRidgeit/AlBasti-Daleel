import { getApiAccessToken } from "@/lib/auth-browser";

export type InviteResult = {
  status: "sent" | "not_configured" | "failed" | "skipped";
  error?: string;
};

// Human-readable outcome of an invitation attempt (shown under the add form).
export function describeInvite(isArabic: boolean, invite: InviteResult | undefined, email: string) {
  switch (invite?.status) {
    case "sent":
      return {
        ok: true,
        text: isArabic ? `تم إرسال دعوة بالبريد إلى ${email}.` : `Invitation email sent to ${email}.`,
      };
    case "not_configured":
      return {
        ok: false,
        text: isArabic
          ? "تمت الإضافة، لكن البريد الإلكتروني غير مُهيّأ بعد فلم تُرسل دعوة."
          : "Added, but email is not set up yet, so no invitation was sent.",
      };
    case "failed":
      return {
        ok: false,
        text: isArabic
          ? `تمت الإضافة، لكن تعذّر إرسال البريد: ${invite.error ?? ""}`
          : `Added, but the email could not be sent: ${invite.error ?? "unknown error"}`,
      };
    default:
      return { ok: true, text: "" };
  }
}

export async function resendInvite(args: {
  email: string;
  displayName?: string;
  role: "user" | "admin";
}): Promise<InviteResult> {
  const token = await getApiAccessToken().catch(() => undefined);
  const response = await fetch("/api/admin/invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(args),
  });
  const data = (await response.json().catch(() => ({}))) as {
    invite?: InviteResult;
    error?: string;
  };
  if (!response.ok && !data.invite) {
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
  return data.invite ?? { status: "failed", error: data.error };
}
