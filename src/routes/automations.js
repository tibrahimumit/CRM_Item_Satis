/**
 * /api/automations — lifecycle şablonları (KV ile özelleştirilebilir).
 */

import { ok, badRequest, notFound, serverError } from "../utils/response.js";
import { requireAdmin } from "../utils/security.js";
import { parseJsonBody, ValidationError } from "../utils/validation.js";
import {
  listTemplates,
  getEffectiveTemplate,
  saveAutomationTemplate,
  resetAutomationTemplate,
  getBuiltinTemplate,
  getDefaultBodies,
  resolveLifecycleSteps,
} from "../services/automations.js";

const ADMIN_PREVIEW_PRODUCT_DAYS = 120;

export async function handle(request, env, { method, segments }) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  const id = segments[0] || "default";

  if (segments.length === 1 && segments[0] === "defaults" && method === "GET") {
    const builtin = getBuiltinTemplate("default");
    return ok({ steps: builtin.steps, bodies: getDefaultBodies() });
  }

  if (segments.length === 2 && segments[1] === "reset" && method === "POST") {
    return ok(await resetAutomationTemplate(env, id));
  }

  if (segments.length === 1) {
    if (method === "GET") {
      const t = await getEffectiveTemplate(env, id);
      if (!t) return notFound("Template not found");
      return ok({
        ...t,
        steps: resolveLifecycleSteps(t, ADMIN_PREVIEW_PRODUCT_DAYS),
        monthlyNote:
          "Aylık mağaza & görüş mailleri ürün süresine göre otomatik eklenir (yaklaşık her 30 gün).",
      });
    }
    if (method === "PATCH") {
      try {
        const body = await parseJsonBody(request);
        const saved = await saveAutomationTemplate(env, id, body);
        return ok(saved);
      } catch (e) {
        if (e instanceof ValidationError) return badRequest(e.message);
        return serverError(e.message);
      }
    }
  }

  if (segments.length === 0 && method === "GET") {
    return ok(await listTemplates(env));
  }

  return badRequest("Unknown automations endpoint");
}
