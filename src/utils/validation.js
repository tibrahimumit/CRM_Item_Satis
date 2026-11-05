/**
 * Lightweight validation + sanitization. Throws ValidationError on failure;
 * callers translate it into a 400 response.
 */

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const SLUG_RE = /^[a-z0-9-]+$/;

export function requireString(value, field, { min = 1, max = 500 } = {}) {
  if (typeof value !== "string") throw new ValidationError(`${field} is required`, field);
  const v = value.trim();
  if (v.length < min) throw new ValidationError(`${field} must be at least ${min} chars`, field);
  if (v.length > max) throw new ValidationError(`${field} must be at most ${max} chars`, field);
  return v;
}

export function optionalString(value, field, opts) {
  if (value === undefined || value === null || value === "") return "";
  return requireString(value, field, opts);
}

export function requireEmail(value, field = "email") {
  const v = requireString(value, field, { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(v)) throw new ValidationError(`${field} is not a valid email`, field);
  return v;
}

/** links.salediscount.online → https://links.salediscount.online */
export function normalizeHttpUrl(value, field = "url") {
  let v = String(value ?? "").trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  v = v.replace(/\/+$/, "");
  if (!URL_RE.test(v)) throw new ValidationError(`${field} must be an http(s) URL`, field);
  return v;
}

export function requireUrl(value, field = "url") {
  const v = normalizeHttpUrl(value, field);
  if (!v) throw new ValidationError(`${field} is required`, field);
  return v;
}

export function requireSlug(value, field = "slug") {
  const v = requireString(value, field, { max: 64 }).toLowerCase();
  if (!SLUG_RE.test(v)) throw new ValidationError(`${field} must be lowercase alphanumeric / dashes`, field);
  return v;
}

export function requirePositiveInt(value, field, { max = 365 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new ValidationError(`${field} must be an integer between 1 and ${max}`, field);
  }
  return n;
}

/** Sanitize a string for HTML interpolation (server-rendered templates). */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Parse JSON body with size limit (defends against accidental DoS). */
export async function parseJsonBody(request, { maxBytes = 64 * 1024 } = {}) {
  const text = await request.text();
  if (text.length > maxBytes) throw new ValidationError("Request body too large");
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new ValidationError("Invalid JSON"); }
}

/** Parse multipart/form-data or urlencoded form body. */
export async function parseFormBody(request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) return parseJsonBody(request);
  const formData = await request.formData();
  const out = {};
  for (const [k, v] of formData.entries()) out[k] = typeof v === "string" ? v : v.name;
  return out;
}
