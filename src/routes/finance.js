/**
 * /api/finance — muhasebe özeti (KV aggregate, düşük yazma).
 */

import { ok, badRequest, serverError } from "../utils/response.js";
import { requireAdmin } from "../utils/security.js";
import { parseJsonBody } from "../utils/validation.js";
import { getFinanceDashboard, resetAllFinanceStats } from "../services/finance.js";

export async function handle(request, env, { method, segments, url }) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  if (segments[0] === "reset" && method === "POST") {
    try {
      const body = await parseJsonBody(request).catch(() => ({}));
      if (body.confirm !== true) {
        return badRequest('Onay için { "confirm": true } gönderin');
      }
      const result = await resetAllFinanceStats(env);
      return ok(result);
    } catch (e) {
      return serverError(e.message);
    }
  }

  if (method !== "GET") return badRequest("Only GET supported");

  if (segments.length === 0 || segments[0] === "summary") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from && to) {
      return ok(await getFinanceDashboard(env, { from, to }));
    }
    const period = url.searchParams.get("period") || "month";
    const allowed = ["day", "week", "month", "year"];
    const p = allowed.includes(period) ? period : "month";
    return ok(await getFinanceDashboard(env, { period: p }));
  }

  return badRequest("Unknown finance endpoint");
}
