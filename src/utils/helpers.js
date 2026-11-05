/**
 * Generic helpers shared across services and routes.
 */

const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyz0123456789"; // no l (lowercase L)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Cryptographically strong random string of given length using alphabet. */
export function randomString(length, alphabet = ID_ALPHABET) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** ID for entities (24 chars). */
export function newId(prefix = "") {
  return prefix + randomString(20);
}

/** Public redirect code (short, URL-friendly, 8 chars by default). */
export function newRedirectCode(length = 8) {
  return randomString(length, CODE_ALPHABET);
}

/** Opaque token (44 chars, URL-safe, unguessable). */
export function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function base64UrlEncode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** SHA-256 hex digest. */
export async function sha256Hex(input) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA-256 hex with a pepper string (for stable indexes like email -> id). */
export async function hmac(pepper, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const now = () => Date.now();
export const nowIso = () => new Date().toISOString();

/** Add seconds to a Date and return iso string. */
export function isoAfter(seconds, base = new Date()) {
  return new Date(base.getTime() + seconds * 1000).toISOString();
}

/** Days helper. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Pick whitelist of keys from object. */
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** Pad number / string to fixed length (for sortable KV keys). */
export function pad(n, len = 13) {
  return String(n).padStart(len, "0");
}

/** Safe JSON parse with default. */
export function safeJson(str, def = null) {
  if (!str) return def;
  try { return JSON.parse(str); } catch { return def; }
}

/** Read cookie value from request. */
export function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Build Set-Cookie header. */
export function buildCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.sameSite !== false) parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  if (opts.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Tiny mustache-like template renderer.
 * Replaces `{{varName}}` with `vars.varName`. Unknown vars become empty strings.
 * Kept inline (no dep) because email/HTML templating is lightweight here.
 */
export function renderTemplate(template, vars = {}) {
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = key.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), vars);
    return v == null ? "" : String(v);
  });
}

/** Chunked KV listing — returns all keys (use sparingly near KV quotas). */
export async function listAllKeys(kv, prefix) {
  return listKeysCapped(kv, prefix, 50_000);
}

/**
 * List keys with a hard cap (avoids Worker CPU/KV limits on large namespaces).
 */
export async function listKeysCapped(kv, prefix, max = 1000) {
  const keys = [];
  let cursor;
  try {
    while (keys.length < max) {
      const res = await kv.list({
        prefix,
        cursor,
        limit: Math.min(100, max - keys.length),
      });
      keys.push(...(res.keys || []));
      if (res.list_complete) break;
      cursor = res.cursor;
    }
  } catch (err) {
    console.error("[KV list]", prefix, err);
    return keys;
  }
  return keys;
}
