/**
 * Stok detay analitiği — lead + erişim token durumu (KV list yok).
 */

import { K, getJson, putJson } from "./kv.js";
import {
  getStock,
  updateStock,
  getCategory,
  syncLeadClaimFromLeads,
  isStockLeadLocked,
} from "./redirects.js";
import { resolveStockPublicLink, buildAccessUrl } from "../utils/publicUrls.js";
import { getEffectiveConfig, getPublicBaseUrl } from "./settings.js";
import {
  buildLifecycleEmailHtml,
  buildLifecycleVars,
  buildLifecycleSchedulePreview,
} from "./automations.js";
import { formatProductDuration } from "../utils/stockFields.js";
import { renderTemplate } from "../utils/helpers.js";
import { isEmailLive, resolveEmailDriver } from "../utils/emailDriver.js";
import { listLeads, getCustomer } from "./customers.js";
import { nowIso } from "../utils/helpers.js";
import { ValidationError } from "../utils/validation.js";

const stockTokensKey = (stockId) => `index:tokens:${stockId}`;

function extractTokenFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/access\/([^/?#]+)/);
  return m ? m[1] : null;
}

function tokenStatus(rec, now = Date.now()) {
  if (!rec) return "no_token";
  if (!rec.activatedAt) return "pending";
  if (rec.expiresAt && new Date(rec.expiresAt).getTime() < now) return "expired";
  if (rec.maxVisits != null && (rec.used || 0) >= rec.maxVisits) return "maxed";
  return "active";
}

async function readStockTokenIndex(env, stockId) {
  return (await getJson(env.SESSIONS, stockTokensKey(stockId))) || { items: [] };
}

/** Yeni token oluşturulunca çağrılır (access.js). */
export async function registerTokenForStock(env, stockId, token, customerId) {
  const m = await readStockTokenIndex(env, stockId);
  const items = [
    { token, customerId, createdAt: nowIso() },
    ...m.items.filter((x) => x.token !== token),
  ].slice(0, 500);
  try {
    await putJson(env.SESSIONS, stockTokensKey(stockId), { items, updatedAt: nowIso() });
  } catch (e) {
    console.error("[registerTokenForStock]", e);
  }
}

async function buildTokenIndexFromLeads(env, stockId) {
  const leads = await listLeads(env, { stockId, limit: 300 });
  const items = [];
  const seen = new Set();
  for (const lead of leads) {
    const token = extractTokenFromUrl(lead.accessUrl);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    items.push({ token, customerId: lead.customerId, createdAt: lead.createdAt });
  }
  if (items.length) {
    try {
      await putJson(env.SESSIONS, stockTokensKey(stockId), { items, updatedAt: nowIso() });
    } catch { /* quota */ }
  }
  return items;
}

export async function getStockInsights(env, stockId) {
  let stock = await getStock(env, stockId);
  if (!stock) return null;
  stock = (await syncLeadClaimFromLeads(env, stockId)) || stock;

  let index = (await readStockTokenIndex(env, stockId)).items;
  if (!index.length) index = await buildTokenIndexFromLeads(env, stockId);

  const leads = await listLeads(env, { stockId, limit: 300 });
  const now = Date.now();
  const recipients = [];
  const seenCustomers = new Set();

  for (const lead of leads) {
    const token = extractTokenFromUrl(lead.accessUrl);
    const rec = token ? await getJson(env.SESSIONS, K.accessToken(token)) : null;
    const customer = await getCustomer(env, lead.customerId);
    const status = tokenStatus(rec, now);
    const maxVisits = rec?.maxVisits ?? stock.accessMaxVisits ?? null;
    const used = rec?.used ?? 0;
    const clicksLeft =
      maxVisits == null ? null : Math.max(0, maxVisits - used);

    let expiresInMs = null;
    if (rec?.expiresAt) {
      expiresInMs = new Date(rec.expiresAt).getTime() - now;
    }

    recipients.push({
      leadId: lead.id,
      customerId: lead.customerId,
      customerName: lead.customerName || customer?.fullName || null,
      customerEmail: lead.customerEmail || customer?.email || null,
      leadCreatedAt: lead.createdAt,
      accessUrl: lead.accessUrl || null,
      token,
      status,
      activatedAt: rec?.activatedAt || null,
      expiresAt: rec?.expiresAt || null,
      expiresInMs,
      ttlSeconds: rec?.ttlSeconds ?? (stock.accessLinkTtlHours || 48) * 3600,
      used,
      maxVisits,
      clicksLeft,
      lastUsedAt: rec?.lastUsedAt || null,
      device: lead.context || null,
      mailSent: Boolean(lead.accessUrl),
      accessEmailDelivery: lead.accessEmailDelivery || null,
      accessEmailDeliveryInfo: describeAccessEmailDelivery(lead),
      formSubmitted: true,
      clickedAccessLink: Boolean(rec?.activatedAt || (rec?.used || 0) > 0),
    });
    seenCustomers.add(lead.customerId);
  }

  const leadFormClaimed = await isStockLeadLocked(env, stock);
  const summary = {
    leads: leads.length,
    uniqueCustomers: seenCustomers.size,
    pending: recipients.filter((r) => r.status === "pending").length,
    active: recipients.filter((r) => r.status === "active").length,
    expired: recipients.filter((r) => r.status === "expired").length,
    maxed: recipients.filter((r) => r.status === "maxed").length,
    noToken: recipients.filter((r) => r.status === "no_token").length,
    totalClicks: recipients.reduce((n, r) => n + (r.used || 0), 0),
    unusedStock: !leadFormClaimed && leads.length === 0,
    leadFormClaimed,
    leadClaimedAt: stock.leadClaimedAt || null,
    leadClaimedEmail: stock.leadClaimedEmail || null,
    leadClaimCount: stock.leadClaimCount || (stock.leadClaimedAt ? 1 : 0),
    leadClaimHistory: stock.leadClaimHistory || [],
    leadLockClearedAt: stock.leadLockClearedAt || null,
    publicVisits: stock.visits || 0,
    lastPublicVisitAt: stock.lastPublicVisitAt || null,
    lastPublicVisitIp: stock.lastPublicVisitIp || null,
    productDurationLabel: formatProductDuration(stock),
  };

  const primary = recipients[0] || null;
  const firstActivationMs = primary?.activatedAt
    ? new Date(primary.activatedAt).getTime()
    : null;
  const lifecycleSchedule = firstActivationMs
    ? await buildLifecycleSchedulePreview(env, stock, firstActivationMs)
    : await buildLifecycleSchedulePreview(env, stock, Date.now());

  const customerJourney = {
    publicLinkOpened: (stock.visits || 0) > 0,
    publicVisitCount: stock.visits || 0,
    lastPublicVisitAt: stock.lastPublicVisitAt || null,
    formSubmitted: summary.leadFormClaimed || summary.leads > 0,
    formSubmittedAt: stock.leadClaimedAt || primary?.leadCreatedAt || null,
    accessEmailDelivery: primary?.accessEmailDeliveryInfo || null,
    clickedAccessEmailLink: recipients.some((r) => r.clickedAccessLink),
    customerClaimLikelyTrue:
      primary?.accessEmailDelivery === "sent" && !primary?.clickedAccessLink
        ? "Mail gitti, linke henüz tıklanmadı — spam klasörü öner"
        : primary?.accessEmailDelivery === "failed"
          ? "Mail gitmedi — müşteri haklı olabilir"
          : primary?.accessEmailDelivery === "logged_only"
            ? "Resend kapalı — mail kutusuna gitmemiş olabilir"
            : !summary.leadFormClaimed && (stock.visits || 0) > 0
              ? "Linke girdi ama form göndermedi"
              : summary.leadFormClaimed && primary?.clickedAccessLink
                ? "Normal akış tamam"
                : null,
  };

  const link = await resolveStockPublicLink(env, stock);
  const category = stock.categoryId ? await getCategory(env, stock.categoryId) : null;
  const base = await getPublicBaseUrl(env);
  const cfg = await getEffectiveConfig(env);
  const sampleCustomer = { email: "ornek@musteri.com", fullName: "Örnek Müşteri" };
  const previewAccessUrl = buildAccessUrl(base, "onizleme-ornek");
  const vars = await buildLifecycleVars(env, {
    customer: sampleCustomer,
    stock,
    accessUrl: previewAccessUrl,
    renewUrl: link.publicUrl,
    appName: cfg.APP_NAME,
  });
  const emailPreview = {
    subject: renderTemplate(`{{firstName}}, {{stockName}} hazır 🎁`, vars),
    html: await buildLifecycleEmailHtml(env, "access", vars, stock.lifecycle?.template || "default"),
    sampleAccessUrl: previewAccessUrl,
    note: "Önizleme — gerçek mailde /access/ sonrası benzersiz token olur.",
  };
  const sentAccessLinks = recipients
    .filter((r) => r.accessUrl)
    .map((r) => ({
      accessUrl: r.accessUrl,
      customerEmail: r.customerEmail,
      customerName: r.customerName,
      leadCreatedAt: r.leadCreatedAt,
    }));
  const lastAccessUrl = sentAccessLinks[0]?.accessUrl || null;

  return {
    stock: {
      ...stock,
      categoryName: category?.name || null,
      ...link,
    },
    links: {
      publicUrl: link.publicUrl,
      publicPath: link.publicPath,
      publicBaseUrl: base,
      accessUrlExample: lastAccessUrl || previewAccessUrl,
      previewAccessUrl,
      sentAccessLinks,
      accessNote: link.accessNote,
      domainNote:
        "workers.dev ortasındaki kelime Cloudflare hesap alt alanıdır — Dashboard’dan değişir veya Ayarlar’da kendi domain’inizi yazın.",
    },
    emailPreview,
    emailDelivery: {
      live: isEmailLive(env),
      driver: resolveEmailDriver(env),
    },
    summary,
    customerJourney,
    lifecycleSchedule,
    lifecycleScheduleNote: firstActivationMs
      ? "Tarihler müşterinin maildeki linke ilk tıkladığı ana göredir."
      : `Ürün süresi bu stokta: ${formatProductDuration(stock)}. Tarihler ilk tıklamadan sonra hesaplanır.`,
    recipients: recipients.sort((a, b) =>
      (b.leadCreatedAt || "").localeCompare(a.leadCreatedAt || ""),
    ),
  };
}

export async function adminUpdateAccessToken(env, token, patch) {
  const rec = await getJson(env.SESSIONS, K.accessToken(token));
  if (!rec) throw new ValidationError("Token bulunamadı veya süresi dolmuş");

  if (patch.maxVisits !== undefined) {
    const v = patch.maxVisits;
    rec.maxVisits = v === null || v === "" ? null : Number(v);
  }
  if (patch.addTtlHours !== undefined && rec.expiresAt) {
    const add = Number(patch.addTtlHours) || 0;
    rec.expiresAt = new Date(new Date(rec.expiresAt).getTime() + add * 3600000).toISOString();
  }
  if (patch.ttlHours !== undefined && !rec.activatedAt) {
    rec.ttlSeconds = Number(patch.ttlHours) * 3600;
  }

  const remainingTtl = rec.expiresAt
    ? Math.max(60, Math.floor((new Date(rec.expiresAt).getTime() - Date.now()) / 1000))
    : 90 * 86400;
  await putJson(env.SESSIONS, K.accessToken(token), rec, { expirationTtl: remainingTtl });
  return rec;
}

const ACCESS_STATUS_LABELS = {
  no_mail: "Mail henüz gönderilmedi",
  no_token: "Token kaydı yok",
  pending: "Mail gitti — linke henüz tıklanmadı",
  active: "Aktif — link kullanılabilir",
  expired: "Erişim süresi doldu",
  maxed: "Tıklama limiti doldu",
};

export const ACCESS_EMAIL_DELIVERY_META = {
  pending: { label: "Gönderiliyor", short: "Bekliyor", variant: "warn" },
  sent: { label: "Resend ile gönderildi", short: "Gönderildi", variant: "ok" },
  logged_only: { label: "Sadece log (gelen kutusuna gitmedi)", short: "Log only", variant: "warn" },
  failed: { label: "Gönderilemedi", short: "Hata", variant: "danger" },
};

function describeAccessEmailDelivery(lead) {
  const key = lead?.accessEmailDelivery || (lead?.accessUrl ? "sent" : "no_mail");
  if (key === "no_mail") {
    return { key, ...ACCESS_EMAIL_DELIVERY_META.pending, label: "Form / mail yok" };
  }
  const meta = ACCESS_EMAIL_DELIVERY_META[key] || { label: key, short: key, variant: "muted" };
  return {
    key,
    ...meta,
    sentAt: lead?.accessEmailSentAt || lead?.createdAt || null,
    error: lead?.accessEmailError || null,
    driver: lead?.accessEmailDriver || null,
    resendId: lead?.accessEmailResendId || null,
  };
}

export async function getLeadAccessInsight(env, lead, stock) {
  const mailSent = Boolean(lead.accessUrl);
  const token = extractTokenFromUrl(lead.accessUrl);
  if (!mailSent) {
    return { mailSent: false, status: "no_mail", statusLabel: ACCESS_STATUS_LABELS.no_mail };
  }
  if (!token) {
    return { mailSent: true, status: "no_token", statusLabel: ACCESS_STATUS_LABELS.no_token };
  }

  const rec = await getJson(env.SESSIONS, K.accessToken(token));
  const now = Date.now();
  const status = tokenStatus(rec, now);
  const maxVisits = rec?.maxVisits ?? stock?.accessMaxVisits ?? null;
  const used = rec?.used ?? 0;

  const customer = await getCustomer(env, lead.customerId);
  const hist = customer?.stockHistory?.find((h) => h.stockId === lead.stockId);

  const delivery = describeAccessEmailDelivery(lead);

  return {
    mailSent: true,
    token,
    status,
    statusLabel: ACCESS_STATUS_LABELS[status] || status,
    used,
    maxVisits,
    clicksLeft: maxVisits == null ? null : Math.max(0, maxVisits - used),
    activatedAt: rec?.activatedAt || hist?.accessActivatedAt || null,
    expiresAt: rec?.expiresAt || null,
    expiresInMs: rec?.expiresAt ? new Date(rec.expiresAt).getTime() - now : null,
    lastUsedAt: rec?.lastUsedAt || null,
    createdAt: rec?.createdAt || lead.createdAt,
    mailSentAt: delivery.sentAt,
    accessEmailDelivery: delivery.key,
    accessEmailDeliveryLabel: delivery.label,
    accessEmailDeliveryShort: delivery.short,
    accessEmailError: delivery.error,
    accessEmailDriver: delivery.driver,
    formSubmittedAt: lead.createdAt,
    clickedAccessLink: Boolean(rec?.activatedAt || (rec?.used || 0) > 0),
  };
}

export async function updateStockAccessSettings(env, stockId, patch) {
  return updateStock(env, stockId, patch);
}
