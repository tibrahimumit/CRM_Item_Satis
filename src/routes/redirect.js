/**
 * Public-facing redirect + lead-capture routes.
 *
 *   GET /r/:code        → lead capture landing page
 *   POST /api/leads     → submit form, enqueue access email
 *   GET /access/:token  → consume token, redirect to real URL (cloaked)
 */

import { html, redirect, badRequest, notFound, ok, conflict } from "../utils/response.js";
import { parseFormBody, ValidationError, requireEmail, requireString } from "../utils/validation.js";
import { enforceRateLimit, visitorKey } from "../utils/security.js";
import {
  getStockByCode,
  getStock,
  bumpStockCounter,
  clearStockLeadClaim,
  resolveStockLeadLock,
  reserveStockLeadClaim,
  LEAD_CLAIM_ITEMSATIS_MSG,
  LEAD_CLAIM_ALREADY_SENT_MSG,
} from "../services/redirects.js";
import { resolveCategorySlug, buildPublicStockPath } from "../utils/publicUrls.js";
import { getPublicBaseUrl } from "../services/settings.js";
import {
  upsertCustomerByEmail,
  attachStockInteraction,
  createLead,
  updateLead,
  appendCustomerEvent,
} from "../services/customers.js";
import { nowIso } from "../utils/helpers.js";
import { recordEvent, buildVisitContext } from "../services/tracking.js";
import { recordSaleFromLead } from "../services/finance.js";
import { issueAccessToken, consumeAccessToken, peekAccessToken } from "../services/access.js";
import { scheduleLifecycleOnFirstAccess } from "../services/automations.js";
import { getCustomer, markStockAccessActivated } from "../services/customers.js";
import { sendAccessLinkNow } from "../services/accessEmail.js";
import { getAccessLinkTtlHours, getProductDurationDays } from "../utils/stockFields.js";
import { renderLeadForm } from "../views/leadForm.js";
import { normalizeLang } from "../i18n/languages.js";
import { resolveStockPlatformName } from "../services/platforms.js";
import { renderAccessPage } from "../views/accessPage.js";
import { renderExpiredPage } from "../views/expiredPage.js";

/** GET /r/:code veya /r/:categorySlug/:code (yol worker'da doğrulanır) */
export async function handleLanding(request, env, code, urlSlug = null) {
  const stock = await getStockByCode(env, code);
  if (!stock) {
    const { renderPublicNotFound } = await import("../views/publicNotFound.js");
    return html(renderPublicNotFound({ appName: env.APP_NAME || "Redirect Intelligence" }), {
      status: 404,
    });
  }

  if (stock.expiresAt && new Date(stock.expiresAt).getTime() < Date.now()) {
    return html(renderExpiredPage({ reason: "expired", appName: env.APP_NAME }), { status: 410 });
  }

  const canonicalSlug = await resolveCategorySlug(env, stock);
  if (canonicalSlug && urlSlug && urlSlug !== canonicalSlug) {
    const base =
      (await getPublicBaseUrl(env)) || String(env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    if (!base) return badRequest("Public base URL not configured");
    return redirect(`${base}${buildPublicStockPath(code, canonicalSlug)}`);
  }

  const url = new URL(request.url);
  const lang = normalizeLang(url.searchParams.get("lang") || "tr");

  const visitContext = buildVisitContext(request);
  // Ziyaret: yalnızca ANALYTICS sayaç (GET-benzeri stok kaydı yok — KV kotası)
  await recordEvent(env, "visit", {
    stockId: stock.id,
    categoryId: stock.categoryId,
  });

  const storeName = await resolveStockPlatformName(env, stock);
  const lock = await resolveStockLeadLock(env, stock);
  if (lock.locked) {
    return html(
      renderLeadForm({
        stock: lock.stock || stock,
        appName: env.APP_NAME || "Redirect Intelligence",
        locked: true,
        lang,
        storeName,
      }),
    );
  }

  return html(
    renderLeadForm({
      stock: lock.stock || stock,
      appName: env.APP_NAME || "Redirect Intelligence",
      lang,
      storeName,
    }),
  );
}

async function leadLockConflictResponse(request, env, stock, submittedEmail) {
  const claimedEmail = (stock?.leadClaimedEmail || "").trim().toLowerCase();
  const sameEmail =
    submittedEmail &&
    claimedEmail &&
    submittedEmail.trim().toLowerCase() === claimedEmail;
  const storeName = await resolveStockPlatformName(env, stock);
  const renewMsg = storeName
    ? `Yeniden almak isterseniz ${storeName} üzerinden satın alabilirsiniz.`
    : "Yeniden almak isterseniz satın aldığınız mağaza üzerinden tekrar satın alabilirsiniz.";
  const message = sameEmail
    ? LEAD_CLAIM_ALREADY_SENT_MSG
    : `Bu link zaten kullanıldı. ${renewMsg}`;
  const accept = request.headers.get("accept") || "";
  if (accept.includes("application/json")) {
    return conflict(message);
  }
  return html(
    renderLeadForm({
      stock,
      appName: env.APP_NAME || "Redirect Intelligence",
      locked: true,
      lockMessage: message,
    }),
    { status: 409 },
  );
}

/** POST /api/leads (public). Body: { code, fullName, email, telegram?, discord? } */
export async function handleSubmitLead(request, env) {
  const rlKey = await visitorKey(request);
  const rlError = await enforceRateLimit(env.SESSIONS, `lead:${rlKey}`, { limit: 6, windowSeconds: 60 });
  if (rlError) return rlError;

  let body;
  try {
    body = await parseFormBody(request);
  } catch (e) {
    return badRequest(e.message);
  }

  const code = body.code;
  if (!code) return badRequest("Missing redirect code");

  let stock = await getStockByCode(env, code);
  if (!stock) return notFound("Link no longer exists");

  let submittedEmail = "";
  try {
    submittedEmail = requireEmail(body.email);
  } catch (e) {
    if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
  }

  const lock = await resolveStockLeadLock(env, stock);
  stock = lock.stock || stock;
  if (lock.locked) {
    return await leadLockConflictResponse(request, env, stock, submittedEmail);
  }

  let fullName;
  let platformUsername;
  let preferredLang;
  try {
    fullName = requireString(body.fullName, "fullName", { min: 2, max: 120 });
    platformUsername = requireString(body.platformUsername, "platformUsername", { min: 2, max: 80 });
    preferredLang = normalizeLang(body.preferredLang || body.lang || "tr");
  } catch (e) {
    if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
    throw e;
  }

  const purchasePlatform =
    (await resolveStockPlatformName(env, stock)) ||
    String(body.purchasePlatform || "").trim() ||
    "Mağaza";

  let result;
  try {
    const ctx = buildVisitContext(request);
    result = await upsertCustomerByEmail(
      env,
      { ...body, fullName, purchasePlatform, platformUsername, preferredLang },
      ctx,
    );
  } catch (e) {
    if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
    throw e;
  }
  const customer = result.customer;
  const visitContext = buildVisitContext(request);

  const reserved = await reserveStockLeadClaim(env, stock, {
    customerId: customer.id,
    email: customer.email,
    ip: visitContext.ip || null,
  });
  if (!reserved.ok) {
    return await leadLockConflictResponse(request, env, reserved.stock || stock, submittedEmail);
  }
  stock = reserved.stock || stock;

  // Attach interaction + create lead row.
  await attachStockInteraction(env, customer.id, {
    stockId: stock.id,
    categoryId: stock.categoryId,
    productDurationDays: getProductDurationDays(stock),
    accessLinkTtlHours: getAccessLinkTtlHours(stock, env),
  });

  const ttlHours = getAccessLinkTtlHours(stock, env);
  const tokenRec = await issueAccessToken(env, {
    customerId: customer.id,
    stockId: stock.id,
    ttlSeconds: ttlHours * 3600,
    maxVisits: stock.accessMaxVisits ?? null,
  });
  const publicBase = ((await getPublicBaseUrl(env)) || env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const accessUrl = `${publicBase}/access/${tokenRec.token}`;

  const lead = await createLead(env, {
    customerId: customer.id,
    stockId: stock.id,
    categoryId: stock.categoryId,
    context: visitContext,
    accessUrl,
    customerName: customer.fullName || body.fullName || null,
    customerEmail: customer.email,
    accessEmailDelivery: "pending",
  });
  await bumpStockCounter(env, stock.id, "leads", 1, { updateMeta: true });
  if (result.created) await bumpStockCounter(env, stock.id, "customers", 1, { updateMeta: true });

  let delivery;
  try {
    delivery = await sendAccessLinkNow(env, { customer, stock, accessUrl });
    await updateLead(env, lead.id, {
      accessEmailDelivery: delivery.delivered ? "sent" : "logged_only",
      accessEmailSentAt: nowIso(),
      accessEmailDriver: delivery.driver || null,
      accessEmailResendId: delivery.resendId || null,
      accessEmailError: delivery.error || null,
    });
    if (!delivery.ok) {
      await clearStockLeadClaim(env, stock.id);
      await appendCustomerEvent(env, customer.id, {
        type: "email_failed",
        stockId: stock.id,
        stockName: stock.name,
        note: delivery.error || "E-posta gönderilemedi",
      });
      throw new Error(delivery.error || "E-posta gönderilemedi");
    }
    await appendCustomerEvent(env, customer.id, {
      type: "form_success",
      stockId: stock.id,
      stockName: stock.name,
      note: delivery.delivered ? "Erişim maili gönderildi" : "Sadece log (Resend kapalı)",
      meta: { delivered: delivery.delivered, driver: delivery.driver },
    });
  } catch (e) {
    await updateLead(env, lead.id, {
      accessEmailDelivery: "failed",
      accessEmailError: String(e?.message || e).slice(0, 500),
    });
    await clearStockLeadClaim(env, stock.id);
    await appendCustomerEvent(env, customer.id, {
      type: "form_failed",
      stockId: stock.id,
      stockName: stock.name,
      note: String(e?.message || e).slice(0, 300),
    });
    throw e;
  }

  await recordSaleFromLead(env, {
    leadId: lead.id,
    stock,
    platformId: stock.platformId,
    categoryId: stock.categoryId,
  }).catch((e) => console.error("[finance]", e?.message));

  await recordEvent(env, "lead", {
    stockId: stock.id,
    categoryId: stock.categoryId,
    customerId: customer.id,
  });

  // Müşteriye asla accessUrl veya gerçek URL dönme — sadece e-posta mesajı.
  const accept = request.headers.get("accept") || "";
  const message =
    "Teşekkürler! Gizli erişim linki e-posta adresinize gönderildi. Lütfen gelen kutunuzu ve spam klasörünü kontrol edin.";

  if (accept.includes("application/json")) {
    return ok({
      message,
      customerId: customer.id,
      emailDelivered: delivery?.delivered ?? false,
      emailDriver: delivery?.driver ?? null,
    });
  }
  return html(
    renderAccessPage({
      mode: "sent",
      email: customer.email,
      appName: env.APP_NAME || "Redirect Intelligence",
    }),
  );
}

/** GET /access/:token — consume token, cloaked redirect. */
export async function handleAccess(request, env, token) {
  const peek = await peekAccessToken(env, token);
  let storeName = "";
  if (peek?.stockId) {
    const peekStock = await getStock(env, peek.stockId);
    storeName = await resolveStockPlatformName(env, peekStock);
  }

  const consumed = await consumeAccessToken(env, token);
  if (!consumed) {
    return html(
      renderAccessPage({
        mode: "invalid",
        reason: "access_expired",
        appName: env.APP_NAME || "Redirect Intelligence",
        storeName,
      }),
      { status: 410 },
    );
  }
  const { record: rec, firstActivation } = consumed;
  const stock = await getStock(env, rec.stockId);
  if (!stock) return notFound("Resource is no longer available");

  if (firstActivation) {
    const customer = await getCustomer(env, rec.customerId);
    if (customer) {
      await markStockAccessActivated(env, rec.customerId, stock.id);
      await scheduleLifecycleOnFirstAccess(env, {
        customer,
        stock,
        accessUrl: `${((await getPublicBaseUrl(env)) || env.PUBLIC_BASE_URL || "").replace(/\/$/, "")}/access/${token}`,
        appName: env.APP_NAME,
      });
    }
  }

  await recordEvent(env, "access", {
    stockId: stock.id,
    categoryId: stock.categoryId,
    customerId: rec.customerId,
    firstActivation,
    activatedAt: rec.activatedAt,
    ...buildVisitContext(request),
  });

  return redirect(stock.realUrl, 302);
}
