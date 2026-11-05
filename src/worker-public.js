/**
 * Müşteri worker — yalnızca /r/, /access/, lead formu.
 * Admin paneli ve /api (admin) bu worker'da YOK.
 */

import { notFound, serverError, html } from "./utils/response.js";
import { parsePublicRedirectPath } from "./utils/publicRoutes.js";
import { renderPublicNotFound } from "./views/publicNotFound.js";
import { handleLanding, handleSubmitLead, handleAccess } from "./routes/redirect.js";
import { renderCacheHelp } from "./views/cacheHelp.js";
import { CUSTOMER_LINKS_HOST, LEGACY_CUSTOMER_HOSTS } from "./config/domains.js";
import { applyEdgeNoStore } from "./utils/edgeCache.js";

export default {
  async fetch(request, env) {
    try {
      const legacy = redirectLegacyHost(request);
      if (legacy) return publicResponse(legacy);
      return publicResponse(await route(request, env));
    } catch (err) {
      console.error("[public]", err);
      return publicResponse(serverError(err?.message || "An unexpected error occurred"));
    }
  },
};

/** Eski 403/404 yanıtlarının tarayıcı ve Cloudflare edge'de kalmasını engeller. */
function redirectLegacyHost(request) {
  const url = new URL(request.url);
  if (!LEGACY_CUSTOMER_HOSTS.has(url.hostname)) return null;
  url.hostname = CUSTOMER_LINKS_HOST;
  return Response.redirect(url.toString(), 301);
}

function applyPublicNoCache(headers) {
  applyEdgeNoStore(headers);
}

function publicResponse(response) {
  const h = new Headers(response.headers);
  h.set("X-SD-Worker", "public");
  applyPublicNoCache(h);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

async function route(request, env) {
  const { pathname } = new URL(request.url);
  const method = request.method;
  const appName = env.APP_NAME || "CRM";

  if (pathname === "/health" || pathname === "/status") {
    const host = new URL(request.url).hostname;
    const payload = {
      ok: true,
      worker: "crm-redirect-intelligence",
      host,
      time: new Date().toISOString(),
      hint: "403 görüyorsanız önce /status açın",
    };
    if (pathname === "/status") {
      const h = new Headers({ "Content-Type": "text/html; charset=utf-8" });
      applyPublicNoCache(h);
      h.set("Clear-Site-Data", '"cache"');
      return publicResponse(
        new Response(renderCacheHelp({ appName, host }), { status: 200, headers: h }),
      );
    }
    const accept = request.headers.get("Accept") || "";
    if (accept.includes("text/html")) {
      const h = new Headers({ "Content-Type": "text/html; charset=utf-8" });
      applyPublicNoCache(h);
      h.set("Clear-Site-Data", '"cache"');
      return publicResponse(
        new Response(renderCacheHelp({ appName, host }), { status: 200, headers: h }),
      );
    }
    return publicResponse(
      new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  if (pathname === "/" || pathname === "/r" || pathname === "/r/") {
    return html(renderPublicNotFound({ appName }), { status: 404 });
  }

  if (pathname.startsWith("/admin")) {
    return html(renderPublicNotFound({ appName }), { status: 404 });
  }

  if (pathname === "/api/leads" && method === "POST") {
    return handleSubmitLead(request, env);
  }

  if (pathname.startsWith("/api/")) {
    return html(renderPublicNotFound({ appName }), { status: 404 });
  }

  if (pathname.startsWith("/r/")) {
    const segments = pathname.slice("/r/".length).split("/").filter(Boolean);
    const parsed = await parsePublicRedirectPath(env, segments);
    if (parsed.error) return html(renderPublicNotFound({ appName }), { status: 404 });
    return handleLanding(request, env, parsed.code, parsed.urlSlug);
  }

  if (pathname.startsWith("/access/")) {
    const token = pathname.slice("/access/".length).split("/")[0];
    if (!token) return html(renderPublicNotFound({ appName }), { status: 404 });
    return handleAccess(request, env, token);
  }

  if (env.ASSETS) {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      const h = new Headers(assetResponse.headers);
      h.set("X-SD-Worker", "public");
      if (/\.css$/i.test(pathname)) {
        h.set("Content-Type", "text/css; charset=utf-8");
        h.set("Cache-Control", "public, max-age=300, must-revalidate");
      }
      if (/\.js$/i.test(pathname)) {
        h.set("Content-Type", "application/javascript; charset=utf-8");
        h.set("Cache-Control", "public, max-age=300, must-revalidate");
      }
      return new Response(assetResponse.body, { status: assetResponse.status, headers: h });
    }
  }

  return notFound();
}
