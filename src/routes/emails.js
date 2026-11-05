/**
 * /api/emails — peek at the email queue + send ad-hoc emails.
 */

import { ok, badRequest, serverError } from "../utils/response.js";
import { requireAdmin } from "../utils/security.js";
import { parseJsonBody, ValidationError, requireEmail, requireString } from "../utils/validation.js";
import { sendEmail, enqueueEmail } from "../services/email.js";
import {
  listEmailQueueDetailed,
  listEmailQueueByCustomer,
  getQueueJob,
  updateQueueJob,
  cancelQueueJob,
  cancelQueueBulk,
  cancelCustomerQueue,
  cancelAllQueue,
  purgeOrphanQueueKeys,
} from "../services/communications.js";

export async function handle(request, env, { method, segments }) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  // POST /api/emails/queue/update — planlı mail düzenle
  if (segments[0] === "queue" && segments[1] === "update" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const key = String(body.key || "").trim();
      if (!key) return badRequest("key gerekli");
      const result = await updateQueueJob(env, key, {
        subject: body.subject,
        html: body.html,
        dueAt: body.dueAt,
      });
      if (!result) return badRequest("Kuyruk kaydı bulunamadı");
      return ok(result);
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message);
      return serverError(e.message);
    }
  }

  // GET /api/emails/queue/:encodedKey — tek kayıt (düzenleme)
  if (segments[0] === "queue" && segments.length === 2 && method === "GET") {
    const key = decodeURIComponent(segments[1]);
    const job = await getQueueJob(env, key);
    if (!job) return badRequest("Kuyruk kaydı bulunamadı");
    return ok(job);
  }

  // POST /api/emails/queue/cancel — tek veya toplu iptal
  if (segments[0] === "queue" && segments[1] === "cancel" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      if (body.all === true) {
        const cancelled = await cancelAllQueue(env);
        return ok({ cancelled });
      }
      if (body.customerId) {
        const cancelled = await cancelCustomerQueue(env, body.customerId);
        return ok({ cancelled });
      }
      const keys = Array.isArray(body.keys) ? body.keys : body.key ? [body.key] : [];
      if (!keys.length) return badRequest("keys, customerId veya all gerekli");
      const cancelled = await cancelQueueBulk(env, keys);
      return ok({ cancelled });
    } catch (e) {
      return serverError(e.message);
    }
  }

  // DELETE /api/emails/queue/:encodedKey
  if (segments[0] === "queue" && segments.length === 2 && method === "DELETE") {
    try {
      const key = decodeURIComponent(segments[1]);
      if (!(await cancelQueueJob(env, key))) return badRequest("Geçersiz kuyruk anahtarı");
      return ok({ cancelled: 1 });
    } catch (e) {
      return serverError(e.message);
    }
  }

  if (segments[0] === "queue" && segments[1] === "purge-orphans" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const keys = Array.isArray(body.keys) ? body.keys : [];
      const detailed = await listEmailQueueDetailed(env, { limit: 200 });
      const toPurge = keys.length ? keys : detailed.orphanKeys || [];
      const deleted = await purgeOrphanQueueKeys(env, toPurge);
      return ok({ deleted, orphanKeys: toPurge.length });
    } catch (e) {
      return serverError(e.message);
    }
  }

  // GET /api/emails/queue?group=1
  if (segments[0] === "queue" && method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("group") === "1") {
      return ok(await listEmailQueueByCustomer(env));
    }
    return ok(await listEmailQueueDetailed(env));
  }

  // /api/emails/send  (immediate ad-hoc send for testing)
  if (segments[0] === "send" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const to = requireEmail(body.to);
      const subject = requireString(body.subject, "subject", { max: 200 });
      const htmlBody = requireString(body.html || body.body, "html", { max: 20000 });
      const result = await sendEmail(env, { to, subject, html: htmlBody });
      return ok(result);
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message);
      return serverError(e.message);
    }
  }

  // /api/emails/enqueue (schedule)
  if (segments[0] === "enqueue" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const to = requireEmail(body.to);
      const subject = requireString(body.subject, "subject", { max: 200 });
      const htmlBody = requireString(body.html || body.body, "html", { max: 20000 });
      const dueAt = body.dueAt ? new Date(body.dueAt).getTime() : Date.now();
      await enqueueEmail(env, {
        dueAt,
        customerId: body.customerId,
        kind: body.kind || "manual",
        message: { to, subject, html: htmlBody },
      });
      return ok({ enqueued: true });
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message);
      return serverError(e.message);
    }
  }

  return badRequest("Unknown email endpoint");
}
