/**
 * Access-token system: cloaked /access/:token links.
 *
 * TTL and visit limits start on the **first click** (not when the lead form
 * is submitted), so you can pre-generate stocks and hold inventory.
 */

import { K, putJson, getJson, del } from "./kv.js";
import { newToken, nowIso } from "../utils/helpers.js";

/** Max time a customer may wait before opening the email link (KV TTL while pending). */
function pendingTtlSeconds(env) {
  const days = Number(env.ACCESS_TOKEN_PENDING_DAYS || 90);
  return Math.min(365, Math.max(1, days)) * 86400;
}

export async function issueAccessToken(env, { customerId, stockId, ttlSeconds, maxVisits = null }) {
  const token = newToken();
  const record = {
    token,
    customerId,
    stockId,
    ttlSeconds,
    activatedAt: null,
    expiresAt: null,
    createdAt: nowIso(),
    used: 0,
    maxVisits: maxVisits == null ? null : Number(maxVisits),
  };
  await putJson(env.SESSIONS, K.accessToken(token), record, {
    expirationTtl: pendingTtlSeconds(env),
  });
  const { registerTokenForStock } = await import("./stockInsights.js");
  await registerTokenForStock(env, stockId, token, customerId);
  return record;
}

/**
 * Validate token and optionally count a visit.
 * On first use, starts the access window (expiresAt = now + ttlSeconds).
 */
/** Süresi dolmuş sayfa için stok bilgisi (silmeden önce okunur). */
export async function peekAccessToken(env, token) {
  if (!token) return null;
  return getJson(env.SESSIONS, K.accessToken(token));
}

export async function consumeAccessToken(env, token, { increment = true } = {}) {
  const rec = await getJson(env.SESSIONS, K.accessToken(token));
  if (!rec) return null;

  const now = Date.now();
  let firstActivation = false;

  if (!rec.activatedAt) {
    firstActivation = true;
    rec.activatedAt = nowIso();
    if (rec.expiresAt) {
      // Eski tokenlar: süre form gönderiminde başlamıştı — olduğu gibi kullan.
    } else {
      const ttl = Number(rec.ttlSeconds) || 172800;
      rec.expiresAt = new Date(now + ttl * 1000).toISOString();
    }
  } else if (rec.expiresAt && new Date(rec.expiresAt).getTime() < now) {
    await del(env.SESSIONS, K.accessToken(token));
    return null;
  }

  if (rec.maxVisits != null && (rec.used || 0) >= rec.maxVisits) {
    return null;
  }

  if (increment) {
    rec.used = (rec.used || 0) + 1;
    rec.lastUsedAt = nowIso();
    const remainingTtl = Math.max(60, Math.floor((new Date(rec.expiresAt).getTime() - now) / 1000));
    await putJson(env.SESSIONS, K.accessToken(token), rec, { expirationTtl: remainingTtl });
  }

  return { record: rec, firstActivation };
}
