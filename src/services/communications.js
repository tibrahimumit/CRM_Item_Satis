/**
 * Müşteri bazlı e-posta özeti — gönderilen + kuyruktaki, tekilleştirilmiş.
 */

import { listKeysCapped, nowIso } from "../utils/helpers.js";
import { parseQueueKey, enqueue } from "../utils/scheduler.js";
import { getCustomer } from "./customers.js";

const KIND_ORDER = [
  "access",
  "welcome",
  "expiring",
  "expiring-final",
  "expired",
  "upsell",
  "upsell-monthly",
  "manual",
  "generic",
];
const KIND_LABELS = {
  access: "Erişim linki",
  welcome: "Hoş geldin",
  expiring: "Süre bitiyor (7 gün)",
  "expiring-final": "Son gün hatırlatması",
  expired: "Süre doldu",
  upsell: "Upsell (1. hafta)",
  "upsell-monthly": "Aylık — mağaza & görüş",
  manual: "Manuel",
  generic: "Diğer",
};

/** Aynı tip+konu tekrarlarını birleştir (test/cron çift kayıtları). */
export function groupSentEmails(history = []) {
  const byType = new Map();
  for (const e of history) {
    const type = e.type || "generic";
    const cur = byType.get(type);
    if (!cur) {
      byType.set(type, { ...e, type, count: 1 });
    } else {
      cur.count += 1;
      if ((e.sentAt || "") > (cur.sentAt || "")) {
        cur.subject = e.subject;
        cur.sentAt = e.sentAt;
      }
    }
  }
  return [...byType.values()].sort(
    (a, b) => KIND_ORDER.indexOf(a.type) - KIND_ORDER.indexOf(b.type) || (b.sentAt || "").localeCompare(a.sentAt || ""),
  );
}

export async function getCustomerCommunications(env, customerId) {
  const customer = await getCustomer(env, customerId);
  if (!customer) return null;

  const keys = await listKeysCapped(env.EMAIL_QUEUE, "q:", 200);
  const scheduled = [];
  for (const k of keys) {
    const job = await env.EMAIL_QUEUE.get(k.name, "json");
    if (!job || job.customerId !== customerId) continue;
    const dueAt = parseQueueKey(k.name);
    scheduled.push({
      key: k.name,
      dueAt,
      dueAtIso: dueAt ? new Date(dueAt).toISOString() : null,
      kind: job.kind || "generic",
      kindLabel: KIND_LABELS[job.kind] || job.kind,
      subject: job.message?.subject || "—",
      status: "scheduled",
    });
  }
  scheduled.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));

  const sent = groupSentEmails(customer.emailHistory).map((e) => ({
    ...e,
    kindLabel: KIND_LABELS[e.type] || e.type,
    status: "sent",
  }));

  const timeline = [
    ...sent.map((s) => ({ ...s, sortAt: s.sentAt })),
    ...scheduled.map((s) => ({ ...s, sortAt: s.dueAtIso, type: s.kind })),
  ].sort((a, b) => (a.sortAt || "").localeCompare(b.sortAt || ""));

  return { sent, scheduled, timeline, kindLabels: KIND_LABELS };
}

async function loadQueueJob(kv, keyName) {
  let job = await kv.get(keyName, "json");
  if (job && typeof job === "object") return job;
  const text = await kv.get(keyName);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Admin e-posta kuyruğu — müşteri adı/e-posta ile (listKeysCapped, KV kotası dostu). */
export async function listEmailQueueDetailed(env, { limit = 150 } = {}) {
  const keys = await listKeysCapped(env.EMAIL_QUEUE, "q:", 200);
  const items = [];
  const orphanKeys = [];
  const customerCache = new Map();

  for (const k of keys) {
    if (items.length >= limit) break;
    const job = await loadQueueJob(env.EMAIL_QUEUE, k.name);
    if (!job) {
      orphanKeys.push(k.name);
      continue;
    }
    const dueAt = parseQueueKey(k.name);
    let customer = null;
    if (job.customerId) {
      if (!customerCache.has(job.customerId)) {
        customerCache.set(job.customerId, await getCustomer(env, job.customerId));
      }
      customer = customerCache.get(job.customerId);
    }
    const to = job.message?.to || customer?.email || "—";
    items.push({
      key: k.name,
      dueAt,
      dueAtIso: dueAt ? new Date(dueAt).toISOString() : null,
      dueInMs: dueAt ? dueAt - Date.now() : null,
      kind: job.kind || "generic",
      kindLabel: KIND_LABELS[job.kind] || job.kind || "—",
      subject: job.message?.subject || "—",
      to,
      customerId: job.customerId || null,
      customerName: customer?.fullName || null,
      customerEmail: customer?.email || to,
      purchasePlatform: customer?.purchasePlatform || null,
      preferredLang: customer?.preferredLang || null,
      enqueuedAt: job.enqueuedAt || null,
    });
  }

  items.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
  return {
    size: items.length,
    keyCount: keys.length,
    orphanKeys,
    items,
    truncated: keys.length >= 200,
  };
}

/** Müşteri/e-posta bazlı gruplu kuyruk (tek sayfada yüzlerce satır yerine). */
export async function listEmailQueueByCustomer(env, { maxCustomers = 60 } = {}) {
  const { size, keyCount, orphanKeys, items, truncated } = await listEmailQueueDetailed(env, {
    limit: 400,
  });
  const groups = new Map();

  for (const item of items) {
    const gid = item.customerId || `orphan:${item.to || item.key}`;
    let g = groups.get(gid);
    if (!g) {
      g = {
        id: gid,
        customerId: item.customerId,
        customerName: item.customerName || "—",
        customerEmail: item.customerEmail || item.to || "—",
        purchasePlatform: item.purchasePlatform,
        items: [],
      };
      groups.set(gid, g);
    }
    g.items.push(item);
  }

  const customers = [...groups.values()]
    .map((g) => {
      g.items.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
      g.nextDueAt = g.items[0]?.dueAt ?? null;
      g.count = g.items.length;
      return g;
    })
    .sort((a, b) => (a.nextDueAt || 0) - (b.nextDueAt || 0))
    .slice(0, maxCustomers);

  return {
    size,
    keyCount,
    orphanKeys,
    customers,
    truncated,
    totalListed: items.length,
  };
}

/** KV'de anahtar var ama JSON yok — hayalet kayıtlar. */
export async function purgeOrphanQueueKeys(env, keys = []) {
  let deleted = 0;
  for (const key of (keys || []).slice(0, 200)) {
    if (!key?.startsWith("q:")) continue;
    const job = await loadQueueJob(env.EMAIL_QUEUE, key);
    if (job) continue;
    await env.EMAIL_QUEUE.delete(key);
    deleted++;
  }
  return deleted;
}

export async function getQueueJob(env, key) {
  if (!key || !key.startsWith("q:")) return null;
  const job = await env.EMAIL_QUEUE.get(key, "json");
  if (!job) return null;
  const dueAt = parseQueueKey(key);
  let customer = null;
  if (job.customerId) customer = await getCustomer(env, job.customerId);
  return {
    key,
    dueAt,
    dueAtIso: dueAt ? new Date(dueAt).toISOString() : null,
    kind: job.kind || "generic",
    kindLabel: KIND_LABELS[job.kind] || job.kind || "—",
    customerId: job.customerId || null,
    customerName: customer?.fullName || null,
    customerEmail: customer?.email || job.message?.to || null,
    subject: job.message?.subject || "",
    html: job.message?.html || "",
    to: job.message?.to || customer?.email || "",
    enqueuedAt: job.enqueuedAt || null,
    updatedAt: job.updatedAt || null,
  };
}

/** Konu, HTML veya gönderim zamanını güncelle (zaman değişirse KV anahtarı yenilenir). */
export async function updateQueueJob(env, key, patch = {}) {
  const existing = await getQueueJob(env, key);
  if (!existing) return null;

  const job = await env.EMAIL_QUEUE.get(key, "json");
  const dueAt = existing.dueAt;
  let newDueAt = dueAt;
  if (patch.dueAt != null && patch.dueAt !== "") {
    const t = new Date(patch.dueAt).getTime();
    if (!Number.isFinite(t)) throw new Error("Geçersiz gönderim zamanı");
    newDueAt = t;
  }

  const message = {
    ...job.message,
    subject:
      patch.subject !== undefined ? String(patch.subject).trim().slice(0, 200) : job.message?.subject || "",
    html: patch.html !== undefined ? String(patch.html).slice(0, 50000) : job.message?.html || "",
  };
  if (!message.subject) throw new Error("Konu boş olamaz");

  const updatedJob = { ...job, message, updatedAt: nowIso() };

  if (newDueAt !== dueAt) {
    await env.EMAIL_QUEUE.delete(key);
    const newKey = await enqueue(env.EMAIL_QUEUE, newDueAt, updatedJob);
    return { key: newKey, dueAt: newDueAt, dueAtIso: new Date(newDueAt).toISOString(), moved: true };
  }

  await env.EMAIL_QUEUE.put(key, JSON.stringify(updatedJob));
  return { key, dueAt, dueAtIso: existing.dueAtIso, moved: false };
}

export async function cancelQueueJob(env, key) {
  if (!key || !key.startsWith("q:")) return false;
  await env.EMAIL_QUEUE.delete(key);
  return true;
}

export async function cancelQueueBulk(env, keys = []) {
  let cancelled = 0;
  for (const key of keys.slice(0, 200)) {
    if (await cancelQueueJob(env, key)) cancelled++;
  }
  return cancelled;
}

export async function cancelCustomerQueue(env, customerId) {
  const keys = await listKeysCapped(env.EMAIL_QUEUE, "q:", 500);
  let cancelled = 0;
  for (const k of keys) {
    const job = await env.EMAIL_QUEUE.get(k.name, "json");
    if (job?.customerId === customerId) {
      await env.EMAIL_QUEUE.delete(k.name);
      cancelled++;
    }
  }
  return cancelled;
}

export async function cancelAllQueue(env, { max = 300 } = {}) {
  const keys = await listKeysCapped(env.EMAIL_QUEUE, "q:", max);
  let cancelled = 0;
  for (const k of keys) {
    await env.EMAIL_QUEUE.delete(k.name);
    cancelled++;
  }
  return cancelled;
}

export { KIND_LABELS, KIND_ORDER };
