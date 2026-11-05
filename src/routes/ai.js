/**
 * /api/ai — OpenAI ile şablon üretimi (admin).
 */

import { ok, badRequest, serverError } from "../utils/response.js";
import { requireAdmin } from "../utils/security.js";
import { parseJsonBody, ValidationError } from "../utils/validation.js";
import { generateProductEmailTemplates, chatWithAssistant } from "../services/openai.js";
import { getEffectiveConfig } from "../services/settings.js";
import { saveAutomationTemplate } from "../services/automations.js";
import { isEmailLive, resolveEmailDriver } from "../utils/emailDriver.js";
import { isOpenAIConfigured, maskOpenAIKey, resolveOpenAIKey } from "../services/settings.js";

export async function handle(request, env, { method, segments }) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  if (segments[0] === "status" && method === "GET") {
    const key = await resolveOpenAIKey(env);
    return ok({
      openai: await isOpenAIConfigured(env),
      openaiKeyPreview: maskOpenAIKey(key),
      emailDriver: resolveEmailDriver(env),
      emailLive: isEmailLive(env),
    });
  }

  if (segments[0] === "chat" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const cfg = await getEffectiveConfig(env);
      const out = await chatWithAssistant(env, {
        messages: body.messages,
        productName: body.productName,
        productGuide: body.productGuide,
        appName: cfg.APP_NAME,
      });
      return ok(out);
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message);
      return serverError(e.message);
    }
  }

  if (segments[0] === "generate-email" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const cfg = await getEffectiveConfig(env);
      const generated = await generateProductEmailTemplates(env, {
        productName: body.productName,
        productGuide: body.productGuide,
        appName: cfg.APP_NAME,
      });
      if (body.apply === true) {
        await saveAutomationTemplate(env, body.templateId || "default", generated);
      }
      return ok({ ...generated, applied: Boolean(body.apply) });
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message);
      return serverError(e.message);
    }
  }

  return badRequest("Unknown AI endpoint");
}
