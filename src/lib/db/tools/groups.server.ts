/**
 * Group management tools.
 * Single Responsibility: group lifecycle (create, list, invite, join, leave, members).
 */

import { z } from "zod";
import { getClientForApiKey, getAnonClient, getServiceClient } from "../supabase.server";
import { jwtSubject, jwtPayload } from "../jwt.server";
import { withPendingHint, toolError } from "../pending-hint.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolResponse = Record<string, any>;

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(["trip", "family", "team", "personal_mirror"]).default("trip"),
});

const GroupIdSchema = z.object({
  group_id: z.string().uuid(),
});

const CreateGroupInviteSchema = z.object({
  group_id: z.string().uuid(),
  expires_in_days: z.number().int().min(1).max(90).default(7),
});

const SendGroupInviteSchema = z.object({
  group_id: z.string().uuid(),
  emails: z.union([z.string().email(), z.array(z.string().email())]),
  expires_in_days: z.number().int().min(1).max(90).default(7),
});

const RedeemGroupInviteSchema = z.object({
  invite_code: z.string().min(1).max(100),
});

export async function createGroup(
  apiKey: string,
  name: string,
  kind = "trip",
): Promise<ToolResponse> {
  const parsed = CreateGroupSchema.safeParse({ name, kind });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_create_group", {
      p_name: parsed.data.name,
      p_kind: parsed.data.kind,
    });
    if (error) return { result: toolError(`fn_create_group: ${error.message}`) };
    return withPendingHint({ status: "success", group_id: data as string }, ac) as ToolResponse;
  } catch (e) {
    return { result: toolError(`fn_create_group: ${String(e)}`) };
  }
}

export async function listMyGroups(apiKey: string): Promise<ToolResponse> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const uid = jwtSubject(ac.accessToken);

    const { data: memberships, error: memErr } = await ac.client
      .from("group_members")
      .select("group_id,role")
      .eq("user_id", uid);

    if (memErr) return { result: toolError(`list_my_groups: ${memErr.message}`) };

    const gids = (memberships ?? []).map((r) => r.group_id as string);
    if (gids.length === 0) return withPendingHint([], ac) as ToolResponse;

    const roleMap: Record<string, string> = {};
    for (const m of memberships ?? []) roleMap[m.group_id as string] = m.role as string;

    const { data: groups, error: grpErr } = await ac.client
      .from("groups")
      .select("id,name,kind,created_at,settings")
      .in("id", gids);

    if (grpErr) return { result: toolError(`list_my_groups: ${grpErr.message}`) };

    // Attach the current user's role to each group
    const enriched = (groups ?? []).map((g) => ({ ...g, role: roleMap[g.id as string] ?? "member" }));
    return withPendingHint(enriched, ac) as ToolResponse;
  } catch (e) {
    return { result: toolError(`list_my_groups: ${String(e)}`) };
  }
}

export async function createGroupInvite(
  apiKey: string,
  groupId: string,
  expiresInDays = 7,
): Promise<ToolResponse> {
  const parsed = CreateGroupInviteSchema.safeParse({ group_id: groupId, expires_in_days: expiresInDays });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_create_group_invite", {
      p_group_id: parsed.data.group_id,
      p_expires_in_days: parsed.data.expires_in_days,
    });
    if (error) return { result: toolError(`fn_create_group_invite: ${error.message}`) };
    return withPendingHint({ status: "success", invite_code: data as string }, ac) as ToolResponse;
  } catch (e) {
    return { result: toolError(`fn_create_group_invite: ${String(e)}`) };
  }
}

/**
 * sendGroupInvite — generates an invite code and attempts to send it via email.
 *
 * Email delivery strategy (in order of priority):
 *  1. Resend HTTP API      — set RESEND_API_KEY in .env (requires verified domain)
 *  2. Gmail SMTP           — set GMAIL_USER + GMAIL_APP_PASSWORD in .env (no domain needed)
 *  3. Supabase OTP         — last resort, existing users only, 3/hour rate limit
 *  4. Code-only fallback   — always returns invite_link so user can share manually
 *
 * Quickest setup: Gmail App Password
 *   1. myaccount.google.com/apppasswords → create password
 *   2. Add to .env:
 *        GMAIL_USER=you@gmail.com
 *        GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
 */
export async function sendGroupInvite(
  apiKey: string,
  groupId: string,
  emails: string | string[],
  expiresInDays = 7,
): Promise<ToolResponse> {
  const parsed = SendGroupInviteSchema.safeParse({ group_id: groupId, emails, expires_in_days: expiresInDays });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };

  try {
    const ac = await getClientForApiKey(apiKey);

    // 1. Get group name + sender name in parallel
    //    Sender name comes from the JWT user_metadata (set at registration) — no extra DB query.
    const { data: groupData, error: groupErr } = await ac.client
      .from("groups")
      .select("name")
      .eq("id", parsed.data.group_id)
      .single();
    if (groupErr) return { result: toolError(`sendGroupInvite: ${groupErr.message}`) };
    const groupName: string = (groupData as { name: string })?.name ?? "the group";

    const jwtClaims = jwtPayload(ac.accessToken);
    const meta = (jwtClaims.user_metadata ?? {}) as Record<string, unknown>;
    const senderName: string =
      (meta.full_name as string | undefined)?.trim() ||
      (meta.name as string | undefined)?.trim() ||
      (jwtClaims.email as string | undefined)?.split("@")[0] ||
      "Someone";

    // 2. Generate invite code
    const { data: inviteCode, error: inviteErr } = await ac.client.rpc("fn_create_group_invite", {
      p_group_id: parsed.data.group_id,
      p_expires_in_days: parsed.data.expires_in_days,
    });
    if (inviteErr) return { result: toolError(`sendGroupInvite: ${inviteErr.message}`) };
    const code = inviteCode as string;

    // 3. Normalise emails to array
    const emailList = Array.isArray(parsed.data.emails)
      ? parsed.data.emails
      : parsed.data.emails.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);

    if (emailList.length === 0) {
      return { result: toolError("No valid email addresses provided") };
    }

    const appUrl = (process.env.APP_URL ?? "http://localhost:8080").replace(/\/$/, "");
    const inviteLink = `${appUrl}/login?invite_code=${encodeURIComponent(code)}&group=${encodeURIComponent(groupName)}`;
    const results: Array<{ email: string; status: string; error?: string }> = [];

    // 4a. Resend HTTP API (requires verified domain at resend.com/domains)
    const resendKey = process.env.RESEND_API_KEY;
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (resendKey) {
      for (const email of emailList) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL ?? "PromptLedger <invites@resend.dev>",
              to: [email],
              subject: `${senderName} invited you to join "${groupName}" on PromptLedger`,
              html: buildInviteEmailHtml({ groupName, senderName, code, inviteLink, expiresInDays: parsed.data.expires_in_days }),
              text: buildInviteEmailText({ groupName, senderName, code, inviteLink, expiresInDays: parsed.data.expires_in_days }),
            }),
          });
          if (res.ok) {
            results.push({ email, status: "sent" });
          } else {
            const body = await res.json().catch(() => ({})) as { message?: string };
            results.push({ email, status: "failed", error: body.message ?? `Resend error ${res.status}` });
          }
        } catch (e) {
          results.push({ email, status: "failed", error: String(e) });
        }
      }
    } else if (gmailUser && gmailPass) {
      // 4b. Gmail SMTP via nodemailer — no domain ownership required.
      //     Needs a Gmail App Password (not your regular password).
      //     Setup: myaccount.google.com/apppasswords
      //     Works for @gmail.com and Google Workspace (@p99soft.com) accounts.
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass.replace(/\s/g, "") },
      });

      for (const email of emailList) {
        try {
          await transporter.sendMail({
            from: `${senderName} via PromptLedger <${gmailUser}>`,
            to: email,
            replyTo: gmailUser,
            subject: `${senderName} invited you to join "${groupName}" on PromptLedger`,
            html: buildInviteEmailHtml({ groupName, senderName, code, inviteLink, expiresInDays: parsed.data.expires_in_days }),
            text: buildInviteEmailText({ groupName, senderName, code, inviteLink, expiresInDays: parsed.data.expires_in_days }),
          });
          results.push({ email, status: "sent" });
        } catch (e) {
          // Surface full error including Gmail auth failure reason
          const errMsg = e instanceof Error
            ? `${e.message}${(e as NodeJS.ErrnoException).code ? ` [${(e as NodeJS.ErrnoException).code}]` : ""}`
            : String(e);
          results.push({ email, status: "failed", error: errMsg });
        }
      }
    } else {
      // 4c. Supabase signInWithOtp — last resort.
      //     Only works for existing Supabase users, 3 emails/hour on free tier.
      const anonClient = getAnonClient();
      for (const email of emailList) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: otpErr } = await (anonClient.auth as any).signInWithOtp({
            email,
            options: { emailRedirectTo: inviteLink },
          });
          if (otpErr) {
            results.push({ email, status: "code_only", error: otpErr.message });
          } else {
            results.push({ email, status: "sent" });
          }
        } catch (e) {
          results.push({ email, status: "code_only", error: String(e) });
        }
      }
    }

    const sentCount = results.filter((r) => r.status === "sent").length;
    const failedResults = results.filter((r) => r.status !== "sent");

    // Build a human-readable status message that surfaces errors clearly
    let message: string;
    if (sentCount === emailList.length) {
      message = `Invite email sent successfully to ${sentCount} recipient${sentCount > 1 ? "s" : ""}.`;
    } else if (sentCount > 0) {
      message = `Invite sent to ${sentCount}/${emailList.length} recipients. Failed for: ${failedResults.map((r) => `${r.email} (${r.error})`).join(", ")}. Share the code manually for those: ${code}`;
    } else {
      const firstError = failedResults[0]?.error ?? "unknown error";
      const isResendTestingLimit = firstError.toLowerCase().includes("testing") || firstError.toLowerCase().includes("own email");
      const hint = isResendTestingLimit
        ? " The Resend test sender (onboarding@resend.dev) can only deliver to your own Resend account email. To send to anyone, verify a domain at resend.com/domains and update RESEND_FROM_EMAIL in .env."
        : !resendKey && !gmailUser
          ? " To enable email: add GMAIL_USER + GMAIL_APP_PASSWORD to .env (get App Password at myaccount.google.com/apppasswords)."
          : "";
      message = `Email delivery failed: ${firstError}.${hint} Share this invite link manually instead: ${inviteLink}`;
    }

    return withPendingHint({
      status: "success",
      invite_code: code,
      invite_link: inviteLink,
      group_name: groupName,
      expires_in_days: parsed.data.expires_in_days,
      emails_sent: sentCount,
      emails_failed: emailList.length - sentCount,
      results,
      message,
      instructions: `Share this link to invite people: ${inviteLink}\nOr they can enter code "${code}" under Groups → Redeem Invite.`,
    }, ac) as ToolResponse;
  } catch (e) {
    return { result: toolError(`sendGroupInvite: ${String(e)}`) };
  }
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function buildInviteEmailHtml(p: {
  groupName: string;
  senderName: string;
  code: string;
  inviteLink: string;
  expiresInDays: number;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0f0f0f;color:#e5e5e5;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#1a1a1a;border-radius:12px;padding:32px;border:1px solid #2a2a2a">
    <h2 style="margin:0 0 8px;color:#a78bfa">You're invited! 🎉</h2>
    <p style="color:#a0a0a0;margin:0 0 24px">
      <strong style="color:#e5e5e5">${p.senderName}</strong> has invited you to join
      <strong style="color:#e5e5e5">${p.groupName}</strong> on PromptLedger — an AI-powered expense tracker.
    </p>
    <a href="${p.inviteLink}"
       style="display:inline-block;background:#a78bfa;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
      Accept Invite →
    </a>
    <p style="margin:24px 0 8px;color:#a0a0a0;font-size:14px">
      Or enter this code manually in the app under <strong>Groups → Redeem Invite</strong>:
    </p>
    <code style="display:inline-block;background:#2a2a2a;padding:8px 16px;border-radius:6px;font-size:18px;letter-spacing:2px;color:#a78bfa">
      ${p.code}
    </code>
    <p style="margin:24px 0 0;color:#666;font-size:12px">
      This invite expires in ${p.expiresInDays} day${p.expiresInDays !== 1 ? "s" : ""}.
      If you weren't expecting this, you can ignore this email.
    </p>
  </div>
</body>
</html>`;
}

function buildInviteEmailText(p: {
  groupName: string;
  senderName: string;
  code: string;
  inviteLink: string;
  expiresInDays: number;
}): string {
  return `${p.senderName} has invited you to join "${p.groupName}" on PromptLedger.

Accept the invite: ${p.inviteLink}

Or enter this code in the app under Groups → Redeem Invite:
${p.code}

This invite expires in ${p.expiresInDays} day${p.expiresInDays !== 1 ? "s" : ""}.
If you weren't expecting this, you can ignore this email.`;
}

export async function redeemGroupInvite(
  apiKey: string,
  inviteCode: string,
): Promise<ToolResponse> {
  const parsed = RedeemGroupInviteSchema.safeParse({ invite_code: inviteCode });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_redeem_group_invite", {
      p_code: parsed.data.invite_code.trim().toLowerCase(),
    });
    if (error) return { result: toolError(`redeem_group_invite: ${error.message}`) };
    return withPendingHint({ status: "success", group_id: data as string }, ac) as ToolResponse;
  } catch (e) {
    return { result: toolError(`redeem_group_invite: ${String(e)}`) };
  }
}

export async function listGroupMembers(
  apiKey: string,
  groupId: string,
): Promise<ToolResponse> {
  const parsed = GroupIdSchema.safeParse({ group_id: groupId });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client
      .from("group_members")
      .select("user_id,role,joined_at")
      .eq("group_id", parsed.data.group_id);
    if (error) return { result: toolError(`list_group_members: ${error.message}`) };

    const members = data ?? [];
    const userIds = members.map((m) => m.user_id as string).filter(Boolean);
    let emailMap: Record<string, string> = {};

    // Try service client to get emails from auth.users
    const svc = getServiceClient();
    if (svc && userIds.length > 0) {
      try {
        const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 });
        for (const u of users ?? []) {
          if (userIds.includes(u.id) && u.email) emailMap[u.id] = u.email;
        }
      } catch { /* service key not available, skip */ }
    }

    const enriched = members.map((m) => {
      const email = emailMap[m.user_id as string] ?? null;
      return {
        ...m,
        email,
        display_name: email ? email.split("@")[0] : null,
      };
    });

    return withPendingHint(enriched, ac) as ToolResponse;
  } catch (e) {
    return { result: toolError(`list_group_members: ${String(e)}`) };
  }
}

export async function leaveGroup(
  apiKey: string,
  groupId: string,
): Promise<ToolResponse> {
  const parsed = GroupIdSchema.safeParse({ group_id: groupId });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_leave_group", { p_group_id: parsed.data.group_id });
    if (error) return { result: toolError(`leave_group: ${error.message}`) };
    return withPendingHint(
      typeof data === "object" && data !== null ? data : { status: "success" },
      ac,
    ) as ToolResponse;
  } catch (e) {
    return { result: toolError(`leave_group: ${String(e)}`) };
  }
}
