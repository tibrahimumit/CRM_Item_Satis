/**
 * Thin typed wrappers over the raw KV bindings. Centralising key naming here
 * means we never have stringly-typed prefixes scattered across the codebase.
 *
 * Key naming convention:
 *   <entity>:<id>            → primary record
 *   idx:<index>:<value> → secondary index pointing to primary id
 *   counter:<scope>          → numeric counter (per category numbering, etc.)
 *
 * Always JSON-encode values for forward compatibility.
 */

import { safeJson, listAllKeys, listKeysCapped } from "../utils/helpers.js";

export const K = {
  // LINKS namespace
  stock: (id) => `stock:${id}`,
  stockByCode: (code) => `idx:code:${code}`,
  stockByCategory: (catId, id) => `idx:cat:${catId}:${id}`,
  // CATEGORIES namespace
  category: (id) => `cat:${id}`,
  categoryBySlug: (slug) => `idx:slug:${slug}`,
  categoryCounter: (catId) => `counter:${catId}`,
  platform: (id) => `plat:${id}`,
  platformBySlug: (slug) => `idx:plat:${slug}`,
  // CUSTOMERS namespace
  customer: (id) => `cust:${id}`,
  customerByEmailHash: (h) => `idx:email:${h}`,
  // LEADS namespace
  lead: (id) => `lead:${id}`,
  // ANALYTICS namespace
  event: (tsKey, id) => `evt:${tsKey}:${id}`,
  aggDaily: (date, scope) => `agg:${date}:${scope}`,
  // EMAIL_QUEUE namespace
  queueItem: (dueAt, id) => `q:${dueAt}:${id}`,
  // AUTOMATIONS namespace
  automation: (id) => `auto:${id}`,
  automationState: (autoId, custId) => `state:${autoId}:${custId}`,
  // LIFECYCLES namespace
  lifecycle: (stockId) => `lc:${stockId}`,
  lifecycleSchedule: (custId, stockId) => `sched:${custId}:${stockId}`,
  // SESSIONS namespace
  accessToken: (token) => `tok:${token}`,
  rateLimit: (key) => `rl:${key}`,
};

export async function getJson(kv, key, def = null) {
  const raw = await kv.get(key);
  return safeJson(raw, def);
}

export const KV_QUOTA_MSG =
  "KV günlük yazma kotası doldu (~1000/gün). Listeler GET ile çalışır; yeni kayıt için yarına bekleyin veya Workers ücretli plan.";

export function isKvQuotaError(err) {
  return /limit exceeded|quota/i.test(String(err?.message || err));
}

export async function putJson(kv, key, value, opts) {
  try {
    await kv.put(key, JSON.stringify(value), opts);
  } catch (err) {
    if (isKvQuotaError(err)) throw new Error(KV_QUOTA_MSG);
    throw err;
  }
}

/** KV günlük kotası dolunca list/manifest yazımı düşebilir; ana kayıt yine de kalır. */
export async function putJsonSafe(kv, key, value, opts) {
  try {
    await putJson(kv, key, value, opts);
    return true;
  } catch (err) {
    console.error("[KV put]", key, err?.message || err);
    return false;
  }
}

export async function del(kv, key) {
  await kv.delete(key);
}

/** Resolve a list of primary keys (e.g. via an index) into hydrated records. */
export async function hydrate(kv, keys, { primaryFn } = {}) {
  const out = [];
  for (const k of keys) {
    const name = typeof k === "string" ? k : k.name;
    const id = name.split(":").pop();
    const primary = primaryFn ? primaryFn(id) : name;
    const v = await getJson(kv, primary);
    if (v) out.push(v);
  }
  return out;
}

export { listAllKeys, listKeysCapped };
