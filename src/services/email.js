/**
 * Email service. Driver resolution:
 *   - EMAIL_DRIVER=console  → never send (dev)
 *   - EMAIL_DRIVER=resend   → Resend only if RESEND_API_KEY exists
 *   - EMAIL_DRIVER=auto (default) → Resend when RESEND_API_KEY secret is set
 */

import { enqueue } from "../utils/scheduler.js";
import { newId, nowIso } from "../utils/helpers.js";
import { recordEmailToCustomer } from "./customers.js";
import { resolveEmailDriver, isEmailLive } from "../utils/emailDriver.js";
import { getEffectiveConfig } from "./settings.js";

export { resolveEmailDriver, isEmailLive };

function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Send an email now using the configured driver. */
export async function sendEmail(env, message) {
  const driver = resolveEmailDriver(env);
  const cfg = await getEffectiveConfig(env);
  const fromAddr = cfg.EMAIL_FROM || "noreply@example.com";
  const fromName = cfg.EMAIL_FROM_NAME || "Sale Discount";
  const payload = {
    from: message.from || `${fromName} <${fromAddr}>`,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text || htmlToPlainText(message.html),
    reply_to: message.reply_to || fromAddr,
    headers: {
      ...(message.headers || {}),
    },
    tags: message.tags || [{ name: "app", value: "redirect-intelligence" }],
  };

  switch (driver) {
    case "resend":
      return sendViaResend(env, payload);
    case "console":
    default:
      console.log("[EMAIL/console] NOT SENT TO INBOX:", JSON.stringify({
        to: payload.to,
        subject: payload.subject,
        hint: "npx wrangler secret put RESEND_API_KEY (EMAIL_DRIVER=auto varsayılan)",
      }));
      return { ok: true, driver: "console", delivered: false };
  }
}

async function sendViaResend(env, payload) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed (${res.status}): ${body}`);
  }
  return { ok: true, driver: "resend", delivered: true, id: (await res.json()).id };
}

export async function enqueueEmail(env, { dueAt, customerId, kind, message }) {
  const job = {
    id: newId(),
    type: "email",
    kind,
    customerId,
    message,
    enqueuedAt: nowIso(),
  };
  return enqueue(env.EMAIL_QUEUE, dueAt, job);
}

export async function processEmailJob(env, job) {
  await sendEmail(env, job.message);
  if (job.customerId) {
    await recordEmailToCustomer(env, job.customerId, {
      type: job.kind || "generic",
      subject: job.message.subject,
    });
  }
}
