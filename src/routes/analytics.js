/**
 * /api/analytics — read-side analytics endpoints.
 */

import { ok, notFound, badRequest } from "../utils/response.js";
import { requireAdmin } from "../utils/security.js";
import { dashboardOverview, listEvents, dailySeries } from "../services/analytics.js";

export async function handle(request, env, { method, segments, url }) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;
  if (method !== "GET") return badRequest("Only GET supported");

  // /api/analytics/overview
  if (segments[0] === "overview") return ok(await dashboardOverview(env));

  // /api/analytics/events?stockId=...
  if (segments[0] === "events") {
    const stockId = url.searchParams.get("stockId");
    const customerId = url.searchParams.get("customerId");
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
    const events = await listEvents(env, {
      limit,
      filter: (e) =>
        (!stockId || e.stockId === stockId) && (!customerId || e.customerId === customerId),
    });
    return ok(events);
  }

  // /api/analytics/series?scope=type:visit&days=30
  if (segments[0] === "series") {
    const scope = url.searchParams.get("scope") || "type:visit";
    const days = Math.min(Number(url.searchParams.get("days") || 14), 90);
    return ok(await dailySeries(env, scope, days));
  }

  return notFound();
}
