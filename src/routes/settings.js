/**
 * /api/settings — admin kurulumu ve uygulama ayarları.
 */

import { ok, created, badRequest, unauthorized } from "../utils/response.js";
import { requireAdmin, isAdminRequest } from "../utils/security.js";
import { parseJsonBody, ValidationError } from "../utils/validation.js";
import {
  getAppSettings,
  setupAdminAccount,
  updateAppSettings,
  isAdminConfigured,
  getPublicBaseUrl,
  getAdminBaseUrl,
} from "../services/settings.js";
import { isEmailLive, resolveEmailDriver } from "../utils/emailDriver.js";
import {
  isOpenAIConfigured,
  maskOpenAIKey,
  resolveOpenAIKey,
  getEffectiveConfig,
  getStoredSettings,
} from "../services/settings.js";

export async function handle(request, env, { method, segments }) {
  // GET /api/settings/public — kurulum gerekli mi?
  if (segments[0] === "public" && method === "GET") {
    const settings = await getAppSettings(env);
    return ok({
      configured: settings.configured,
      appName: settings.appName,
      emailFrom: settings.emailFrom,
      emailFromName: settings.emailFromName,
    });
  }

  // POST /api/settings/setup — ilk admin kaydı (auth yok)
  if (segments[0] === "setup" && method === "POST") {
    if (await isAdminConfigured(env)) {
      return badRequest("Admin zaten tanımlı");
    }
    try {
      const body = await parseJsonBody(request);
      const settings = await setupAdminAccount(env, body);
      return created({ ok: true, settings });
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
      throw e;
    }
  }

  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  if (segments.length === 0 && method === "GET") {
    const settings = await getAppSettings(env);
    const stored = await getStoredSettings(env);
    const effective = await getEffectiveConfig(env);
    const emailFromSource = stored?.emailFrom
      ? "panel (Kaydet ile KV’ye yazıldı)"
      : env.EMAIL_FROM
        ? "wrangler vars (varsayılan)"
        : "tanımsız";
    return ok({
      ...settings,
      publicSiteUrl: await getPublicBaseUrl(env),
      adminSiteUrl: await getAdminBaseUrl(env),
      emailLive: isEmailLive(env),
      emailDriver: resolveEmailDriver(env),
      resendConfigured: Boolean(env.RESEND_API_KEY),
      openaiConfigured: await isOpenAIConfigured(env),
      openaiKeyPreview: maskOpenAIKey(await resolveOpenAIKey(env)),
      effectiveEmailFrom: effective.EMAIL_FROM,
      effectiveEmailFromName: effective.EMAIL_FROM_NAME,
      emailFromSource,
    });
  }

  if (segments.length === 0 && method === "PATCH") {
    try {
      const body = await parseJsonBody(request);
      const settings = await updateAppSettings(env, body);
      return ok({
        ...settings,
        publicSiteUrl: await getPublicBaseUrl(env),
        adminSiteUrl: await getAdminBaseUrl(env),
      });
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
      throw e;
    }
  }

  return badRequest("Unsupported");
}
