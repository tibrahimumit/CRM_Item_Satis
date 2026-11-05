/**
 * /api/leads — admin read endpoints.
 */

import { ok, notFound, badRequest, serverError } from "../utils/response.js";
import { requireAdmin } from "../utils/security.js";
import { parseJsonBody, ValidationError } from "../utils/validation.js";
import { getLead, listLeads, deleteLead, deleteLeadsBulk } from "../services/customers.js";
import { getStock } from "../services/redirects.js";
import { getCustomer } from "../services/customers.js";
import { resolveStockPublicLink } from "../utils/publicUrls.js";
import { getLeadAccessInsight } from "../services/stockInsights.js";

export async function handle(request, env, { method, segments, url }) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  if (segments[0] === "bulk-delete" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return badRequest("ids required");
      return ok({ deleted: await deleteLeadsBulk(env, ids) });
    } catch (e) {
      return serverError(e.message);
    }
  }

  if (segments.length === 1) {
    if (method === "DELETE") {
      const deleted = await deleteLead(env, segments[0]);
      if (!deleted) return notFound("Lead not found");
      return ok({ deleted: true });
    }
    if (method !== "GET") return badRequest("Unsupported method");
    const lead = await getLead(env, segments[0]);
    if (!lead) return notFound("Lead not found");
    const [customer, stock] = await Promise.all([
      getCustomer(env, lead.customerId),
      getStock(env, lead.stockId),
    ]);
    const stockLink = stock ? await resolveStockPublicLink(env, stock) : null;
    const access = await getLeadAccessInsight(env, lead, stock);
    return ok({
      ...lead,
      access,
      customer: customer
        ? { id: customer.id, email: customer.email, fullName: customer.fullName, lifecycleStage: customer.lifecycleStage }
        : null,
      customerName: lead.customerName || customer?.fullName || null,
      customerEmail: lead.customerEmail || customer?.email || null,
      stockName: stock?.name || null,
      stockCode: stock?.code || null,
      stockPublicUrl: stockLink?.publicUrl || null,
      categoryName: stockLink?.categoryName || null,
    });
  }

  if (method !== "GET") return badRequest("Only GET supported");

  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
  const customerId = url.searchParams.get("customerId") || undefined;
  const stockId = url.searchParams.get("stockId") || undefined;
  return ok(await listLeads(env, { limit, customerId, stockId }));
}
