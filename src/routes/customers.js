/**
 * /api/customers — CRM endpoints (admin).
 */

import { ok, notFound, badRequest, serverError } from "../utils/response.js";
import { requireAdmin } from "../utils/security.js";
import { parseJsonBody, ValidationError } from "../utils/validation.js";
import {
  getCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
  deleteCustomersBulk,
  setLifecycleStage,
  rebuildCustomerManifest,
  LIFECYCLE_STAGES,
} from "../services/customers.js";
import { getCustomerCommunications } from "../services/communications.js";

export async function handle(request, env, { method, segments, url }) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  // /api/customers
  if (segments.length === 0) {
    if (method !== "GET") return badRequest("Only GET supported");
    const search = url.searchParams.get("q") || undefined;
    const stage = url.searchParams.get("stage") || undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
    return ok(await listCustomers(env, { search, stage, limit }));
  }

  if (segments[0] === "bulk-delete" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return badRequest("ids required");
      return ok({ deleted: await deleteCustomersBulk(env, ids) });
    } catch (e) {
      return serverError(e.message);
    }
  }

  if (segments[0] === "repair" && method === "POST") {
    try {
      const count = await rebuildCustomerManifest(env);
      return ok({ rebuilt: count });
    } catch (e) {
      return serverError(e.message);
    }
  }

  // /api/customers/stages
  if (segments[0] === "stages") {
    return ok(LIFECYCLE_STAGES);
  }

  const id = segments[0];
  const customer = await getCustomer(env, id);
  if (!customer) return notFound("Customer not found");

  if (segments.length === 2 && segments[1] === "communications" && method === "GET") {
    const comms = await getCustomerCommunications(env, id);
    if (!comms) return notFound("Customer not found");
    return ok(comms);
  }

  if (segments.length === 1) {
    if (method === "GET") return ok(customer);
    if (method === "PATCH") {
      try {
        const body = await parseJsonBody(request);
        if (body.stage && Object.keys(body).length === 1) {
          await setLifecycleStage(env, id, body.stage);
        } else {
          await updateCustomer(env, id, body);
        }
        return ok(await getCustomer(env, id));
      } catch (e) {
        if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
        return serverError(e.message);
      }
    }
    if (method === "DELETE") {
      await deleteCustomer(env, id);
      return ok({ deleted: true, id });
    }
    return badRequest("Unsupported method");
  }

  return notFound();
}
