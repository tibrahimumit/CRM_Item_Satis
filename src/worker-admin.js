/**
 * Admin worker — panel, REST API, e-posta kuyruğu (cron).
 * Müşteri linkleri ayrı worker'da (worker-public.js).
 */

import { notFound, serverError, html, redirect } from "./utils/response.js";
import { isAdminRequest, buildAdminSetCookie } from "./utils/security.js";
import { isAdminOnlyAsset } from "./utils/publicRoutes.js";
import * as dashboard from "./routes/dashboard.js";
import * as categories from "./routes/categories.js";
import * as stocks from "./routes/stocks.js";
import * as analytics from "./routes/analytics.js";
import * as finance from "./routes/finance.js";
import * as customers from "./routes/customers.js";
import * as leads from "./routes/leads.js";
import * as emails from "./routes/emails.js";
import * as automations from "./routes/automations.js";
import * as settings from "./routes/settings.js";
import * as ai from "./routes/ai.js";
import { drainDueJobs, ackJob } from "./utils/scheduler.js";
import { processEmailJob } from "./services/email.js";

import { applyEdgeNoStore } from "./utils/edgeCache.js";

function adminResponse(response, extraHeaders) {
  const h = new Headers(response.headers);
  h.set("X-SD-Worker", "admin");
  applyEdgeNoStore(h);
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) h.append(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: h,
  });
}

async function maybeRefreshAdminSession(request, env, response) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return response;
  if (response.status < 200 || response.status >= 400) return response;
  if (!(await isAdminRequest(request, env))) return response;
  const cookie = await buildAdminSetCookie(env);
  return adminResponse(response, { "Set-Cookie": cookie });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const res = await route(request, env);
      return await maybeRefreshAdminSession(request, env, adminResponse(res));
    } catch (err) {
      console.error("[admin]", err);
      return adminResponse(serverError(err?.message || "An unexpected error occurred"));
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(processQueue(env));
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/") return redirect("/admin");
  if (pathname === "/health") {
    return new Response(
      JSON.stringify({ ok: true, worker: "crm-admin-intelligence", time: new Date().toISOString() }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // Müşteri yolları bu worker'da yok
  if (pathname.startsWith("/r/") || pathname.startsWith("/access/")) {
    return notFound();
  }

  if (pathname === "/admin") return dashboard.handleDashboardShell(request, env);
  if (pathname === "/admin/setup") return dashboard.handleSetup(request, env);
  if (pathname === "/admin/verify") return dashboard.handleVerify(request, env);
  if (pathname === "/admin/forgot") return dashboard.handleForgot(request, env);
  if (pathname === "/admin/reset") return dashboard.handleReset(request, env);
  if (pathname === "/admin/resend-verify" && method === "POST") {
    return dashboard.handleResendVerify(request, env);
  }
  if (pathname === "/admin/login") return dashboard.handleLogin(request, env);
  if (pathname === "/admin/logout" && method === "POST") return dashboard.handleLogout(request, env);

  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/leads" && method === "POST") {
      return notFound();
    }
    const segments = pathname.slice("/api/".length).split("/").filter(Boolean);
    const head = segments[0];
    const rest = segments.slice(1);
    const ctxObj = { method, segments: rest, url };

    switch (head) {
      case "platforms":
        return (await import("./routes/platforms.js")).handle(request, env, ctxObj);
      case "categories":
        return categories.handle(request, env, ctxObj);
      case "stocks":
        return stocks.handle(request, env, ctxObj);
      case "leads":
        return leads.handle(request, env, ctxObj);
      case "customers":
        return customers.handle(request, env, ctxObj);
      case "finance":
        return finance.handle(request, env, ctxObj);
      case "analytics":
        return analytics.handle(request, env, ctxObj);
      case "emails":
        return emails.handle(request, env, ctxObj);
      case "automations":
        return automations.handle(request, env, ctxObj);
      case "settings":
        return settings.handle(request, env, ctxObj);
      case "ai":
        return ai.handle(request, env, ctxObj);
      case "auth":
        if (rest[0] === "session" && method === "GET") {
          const ok = await isAdminRequest(request, env);
          return new Response(
            JSON.stringify({
              ok: true,
              data: { authenticated: ok, worker: "crm-admin-intelligence", host: url.hostname },
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (rest[0] === "resend-verify" && method === "POST") {
          return dashboard.handleResendVerify(request, env);
        }
        break;
    }
  }

  if (isAdminOnlyAsset(pathname)) {
    if (!(await isAdminRequest(request, env))) {
      return new Response("Not found", { status: 404 });
    }
  }

  if (env.ASSETS) {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      if (/\.(js|css)$/i.test(pathname)) {
        const h = new Headers(assetResponse.headers);
        h.set("Cache-Control", "no-store, no-cache, must-revalidate");
        h.set("Pragma", "no-cache");
        return new Response(assetResponse.body, { status: assetResponse.status, headers: h });
      }
      return assetResponse;
    }
  }

  return notFound();
}

async function processQueue(env) {
  try {
    const jobs = await drainDueJobs(env.EMAIL_QUEUE, { now: Date.now(), max: 50 });
    for (const { key, payload } of jobs) {
      try {
        if (payload.type === "email") {
          await processEmailJob(env, payload);
        }
        await ackJob(env.EMAIL_QUEUE, key);
      } catch (jobErr) {
        console.error("Job failed:", payload?.kind, jobErr?.message);
        const retryKey = key.replace(/^q:(\d+):/, (_, t) =>
          `q:${Number(t) + 5 * 60 * 1000}:`,
        );
        await env.EMAIL_QUEUE.put(
          retryKey,
          JSON.stringify({ ...payload, retries: (payload.retries || 0) + 1 }),
        );
        await ackJob(env.EMAIL_QUEUE, key);
      }
    }
  } catch (e) {
    console.error("Queue drain failed:", e?.message);
  }
}
