/**
 * Immediate access-link email (e-postadaki gizli /access/ linki).
 * Gerçek URL asla e-postada veya formda gösterilmez.
 */

import { sendEmail, resolveEmailDriver } from "./email.js";
import { renderTemplate, nowIso } from "../utils/helpers.js";
import { formatAccessLinkExpiry, formatProductDuration } from "../utils/stockFields.js";
import { recordEmailToCustomer } from "./customers.js";
import { buildLifecycleEmailHtml, buildLifecycleVars, wrapHtml } from "./automations.js";
import { normalizeLang, getLocalizedEmailSubject } from "../i18n/languages.js";
import { getEffectiveConfig } from "./settings.js";
import { resolveStockPublicLink } from "../utils/publicUrls.js";

export async function sendAccessLinkNow(env, { customer, stock, accessUrl }) {
  const cfg = await getEffectiveConfig(env);
  const { publicUrl: renewUrl } = await resolveStockPublicLink(env, stock);
  const vars = await buildLifecycleVars(env, {
    customer,
    stock,
    accessUrl,
    renewUrl,
    appName: cfg.APP_NAME,
  });
  const lang = normalizeLang(customer?.preferredLang);
  const subject = stock.accessEmailSubject
    ? renderTemplate(stock.accessEmailSubject, vars)
    : renderTemplate(getLocalizedEmailSubject("access", lang), vars);
  const html = stock.accessEmailHtml
    ? wrapHtml(renderTemplate(stock.accessEmailHtml, vars), vars)
    : await buildLifecycleEmailHtml(env, "access", vars, stock?.lifecycle?.template || "default");

  const driver = resolveEmailDriver(env);
  let result;
  try {
    result = await sendEmail(env, { to: customer.email, subject, html });
  } catch (err) {
    return {
      ok: false,
      delivered: false,
      driver,
      error: String(err?.message || err).slice(0, 500),
      subject,
    };
  }

  const delivered = Boolean(result?.delivered);
  if (!delivered) {
    console.log("[ACCESS LINK — not delivered to inbox]", {
      to: customer.email,
      driver: result?.driver || driver,
      accessUrl,
    });
  }

  await recordEmailToCustomer(env, customer.id, {
    type: "access",
    subject,
    sentAt: nowIso(),
    delivered,
    driver: result?.driver || driver,
  });

  return {
    ok: true,
    delivered,
    driver: result?.driver || driver,
    resendId: result?.id || null,
    subject,
  };
}
