/**
 * HTTP response helpers.
 * Centralised so every route returns consistent JSON / HTML / error shapes.
 */

import { applyEdgeNoStore } from "./edgeCache.js";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "interest-cohort=()",
};

function applyCommonHeaders(headers, workerTag) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  applyEdgeNoStore(headers);
  if (workerTag) headers.set("X-SD-Worker", workerTag);
}

export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  applyCommonHeaders(headers, init.workerTag);
  const { workerTag: _w, ...rest } = init;
  return new Response(JSON.stringify(data), { ...rest, headers });
}

export function ok(data = { ok: true }) {
  return json({ ok: true, data });
}

export function created(data) {
  return json({ ok: true, data }, { status: 201 });
}

export function badRequest(message, extra = {}) {
  return json({ ok: false, error: "bad_request", message, ...extra }, { status: 400 });
}

export function unauthorized(message = "Authentication required") {
  return json({ ok: false, error: "unauthorized", message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return json({ ok: false, error: "forbidden", message }, { status: 403 });
}

export function notFound(message = "Not found") {
  return json({ ok: false, error: "not_found", message }, { status: 404 });
}

export function conflict(message = "Conflict") {
  return json({ ok: false, error: "conflict", message }, { status: 409 });
}

export function tooMany(message = "Too many requests") {
  return json({ ok: false, error: "rate_limited", message }, { status: 429 });
}

export function serverError(message = "Internal error", extra = {}) {
  return json({ ok: false, error: "server_error", message, ...extra }, { status: 500 });
}

export function html(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
  );
  applyCommonHeaders(headers, init.workerTag);
  const { workerTag: _w, ...rest } = init;
  return new Response(body, { ...rest, headers });
}

export function redirect(url, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
}

export function noContent() {
  return new Response(null, { status: 204 });
}
