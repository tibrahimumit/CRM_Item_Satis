/**
 * Authentication, rate limiting, and abuse-prevention helpers.
 *
 * Admin auth: email + password from env (ADMIN_EMAIL, ADMIN_PASSWORD).
 * Legacy ADMIN_TOKEN still works if email/password are not set.
 */

import { sha256Hex, getCookie, buildCookie } from "./helpers.js";
import { unauthorized, tooMany } from "./response.js";

const ADMIN_COOKIE = "ri_admin";

function useSecureCookies(env) {
  return String(env.PUBLIC_BASE_URL || "").startsWith("https://");
}

export async function expectedAdminCookie(env) {
  const { expectedAdminCookieFromSettings } = await import("../services/settings.js");
  const fromKv = await expectedAdminCookieFromSettings(env);
  if (fromKv) return fromKv;

  const email = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = env.ADMIN_PASSWORD || "";
  if (email && password) {
    return sha256Hex(`admin:${email}:${password}`);
  }
  if (env.ADMIN_TOKEN) {
    return sha256Hex(`admin:token:${env.ADMIN_TOKEN}`);
  }
  return null;
}

/** Verify admin email + password (KV ayarları veya wrangler secret). */
export async function verifyAdminLogin(env, email, password) {
  const { verifyStoredAdminLogin } = await import("../services/settings.js");
  const kvResult = await verifyStoredAdminLogin(env, email, password);
  if (kvResult === true) return true;
  if (kvResult === false) return false;

  const expectedEmail = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  const expectedPassword = env.ADMIN_PASSWORD || "";
  if (!expectedEmail || !expectedPassword) return false;
  const gotEmail = String(email || "").trim().toLowerCase();
  const gotPassword = String(password || "");
  if (gotEmail !== expectedEmail) return false;
  return timingSafeEqual(gotPassword, expectedPassword);
}

/** Legacy token login (optional fallback). */
export function verifyAdminToken(env, token) {
  return Boolean(env.ADMIN_TOKEN) && timingSafeEqual(String(token || ""), env.ADMIN_TOKEN);
}

/** Build a Set-Cookie string the dashboard uses after login. */
export async function buildAdminSetCookie(env, { maxAge = 60 * 60 * 24 * 30 } = {}) {
  const value = await expectedAdminCookie(env);
  if (!value) return buildCookie(ADMIN_COOKIE, "", { maxAge: 0, secure: useSecureCookies(env) });
  return buildCookie(ADMIN_COOKIE, value, { maxAge, secure: useSecureCookies(env) });
}

export function buildAdminLogoutCookie(env = {}) {
  return buildCookie(ADMIN_COOKIE, "", { maxAge: 0, secure: useSecureCookies(env) });
}

/** Returns true if request carries a valid admin cookie. */
export async function isAdminRequest(request, env) {
  const expected = await expectedAdminCookie(env);
  if (!expected) return false;
  const got = getCookie(request, ADMIN_COOKIE);
  return Boolean(got) && timingSafeEqual(got, expected);
}

/** Guard helper — returns 401 if not admin, otherwise null. */
export async function requireAdmin(request, env) {
  if (!(await isAdminRequest(request, env))) return unauthorized();
  return null;
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Sliding-window rate limiter backed by KV (SESSIONS namespace).
 * Lightweight: 1 read + 1 write per request. Suitable for low/medium volume;
 * for high-volume edges upgrade to Durable Objects.
 *
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
 */
export async function rateLimit(kv, key, { limit = 30, windowSeconds = 60 } = {}) {
  const k = `rl:${key}`;
  const raw = await kv.get(k, "json");
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;
  const hits = Array.isArray(raw?.hits) ? raw.hits.filter((t) => t >= windowStart) : [];
  hits.push(now);
  await kv.put(k, JSON.stringify({ hits }), { expirationTtl: windowSeconds * 2 });
  return {
    allowed: hits.length <= limit,
    remaining: Math.max(0, limit - hits.length),
    resetAt: (windowStart + windowSeconds) * 1000,
  };
}

/** Convenience: enforce rate limit and short-circuit with 429 if exceeded. */
export async function enforceRateLimit(kv, key, opts) {
  const r = await rateLimit(kv, key, opts);
  if (!r.allowed) return tooMany(`Rate limit exceeded. Try again later.`);
  return null;
}

/** Best-effort visitor identifier for rate limiting (IP + UA hash). */
export async function visitorKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const ua = request.headers.get("user-agent") || "";
  return ip + ":" + (await sha256Hex(ua)).slice(0, 12);
}
