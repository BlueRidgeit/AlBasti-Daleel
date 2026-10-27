import { readableOn } from "@/lib/branding";
import { getBranding } from "@/lib/branding-server";
import { logoUrl } from "@/lib/branding";
import { env } from "@/lib/env";
import { sendMail, type MailResult } from "@/lib/mailer";

const FONT = "'Segoe UI',Arial,sans-serif";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

// Public address of this app (for links and the logo): APP_BASE_URL, else the request's host.
export function getPublicOrigin(request: Request) {
  if (env.appBaseUrl) {
    return env.appBaseUrl;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

export type InviteRole = "user" | "admin";

export async function sendInvitation(args: {
  request: Request;
  to: string;
  displayName?: string;
  role: InviteRole;
  invitedBy?: string;
}): Promise<MailResult> {
  const branding = await getBranding();
  const origin = getPublicOrigin(args.request);
  const appName = escapeHtml(branding.appName ?? "Daleel");
  const headerBg = branding.colors.navBg ?? "#26358b";
  const buttonBg = branding.colors.primary ?? "#26358b";
  const buttonText = branding.colors.primaryText ?? readableOn(buttonBg);
  // The built-in logos are white artwork meant for the navy header band used below.
  const logo = branding.logos.nav
    ? `${origin}${logoUrl("nav", branding.logos.nav)}`
    : `${origin}/daleel-logo-en.png`;

  const name = args.displayName?.trim() ? escapeHtml(args.displayName.trim()) : "";
  const inviter = args.invitedBy ? escapeHtml(args.invitedBy) : "";
  const roleEn = args.role === "admin" ? "an administrator" : "a user";
  const roleAr = args.role === "admin" ? "كمسؤول" : "كمستخدم";
  const link = escapeHtml(origin);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>body,td,p,a{font-family:${FONT}}</style></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td align="center" bgcolor="${headerBg}" style="background:${headerBg};padding:22px 24px"><img src="${escapeHtml(logo)}" alt="${appName}" width="220" style="display:block;max-width:220px;height:auto;border:0"></td></tr>
<tr><td style="padding:28px 28px 8px;font-size:15px;line-height:1.6;font-family:${FONT}">
<p style="margin:0 0 12px">Hello${name ? ` ${name}` : ""},</p>
<p style="margin:0 0 12px">${inviter ? `${inviter} has given you access` : "You have been given access"} to <strong>${appName}</strong> as ${roleEn}.</p>
<p style="margin:0 0 20px">Sign in with your Microsoft work account (${escapeHtml(args.to)}).</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px"><tr><td align="center" bgcolor="${buttonBg}" style="background-color:${buttonBg};border-radius:8px;padding:12px 28px;font-family:${FONT}"><a href="${link}" style="color:${buttonText};text-decoration:none;font-weight:bold;font-size:15px;font-family:${FONT}">Open ${appName}</a></td></tr></table>
</td></tr>
<tr><td dir="rtl" style="padding:0 28px 24px;font-size:15px;line-height:1.7;text-align:right;border-top:1px solid #e5e7eb;font-family:${FONT}">
<p style="margin:16px 0 8px">مرحبًا${name ? ` ${name}` : ""}،</p>
<p style="margin:0 0 8px">تم منحك صلاحية الوصول إلى <strong>${appName}</strong> ${roleAr}. سجّل الدخول باستخدام حساب Microsoft الخاص بعملك.</p>
<p style="margin:0"><a href="${link}" style="color:${buttonBg}">${link}</a></p>
</td></tr>
<tr><td style="background:#f9fafb;padding:12px 28px;font-size:12px;color:#6b7280;text-align:center;font-family:${FONT}">If you did not expect this message you can ignore it.</td></tr>
</table></td></tr></table></body></html>`;

  return sendMail({
    to: args.to,
    subject: `You've been invited to ${branding.appName ?? "Daleel"} | دعوة للانضمام`,
    html,
  });
}
