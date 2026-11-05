/**
 * Lifecycle + email automation — samimi Türkçe şablonlar.
 */

import { K, getJson, putJson, del } from "./kv.js";
import { enqueueEmail } from "./email.js";
import { renderTemplate, nowIso } from "../utils/helpers.js";
import {
  getProductDurationDays,
  formatAccessLinkExpiry,
  formatProductDuration,
} from "../utils/stockFields.js";
import {
  normalizeLang,
  getLocalizedEmailBody,
  getLocalizedEmailSubject,
} from "../i18n/languages.js";

const BUILTIN_TEMPLATES = {
  default: {
    id: "default",
    name: "Standart yaşam döngüsü",
    steps: [
      { offsetDays: 0, kind: "welcome", subject: "{{firstName}}, aramıza hoş geldin 💜", template: "welcome" },
      { offsetDays: 0, kind: "access", subject: "{{firstName}}, {{stockName}} hazır — kurulum ve hediye 🎁", template: "access" },
      { offsetDays: -7, kind: "expiring", subject: "{{firstName}}, lisansın 7 gün içinde bitiyor", template: "expiring-7" },
      {
        offsetDays: -3,
        kind: "expiring",
        subject: "{{firstName}}, erişimin bitmek üzere ⏳",
        template: "expiring-3",
      },
      { offsetDays: -1, kind: "expiring-final", subject: "Yarın son gün — {{stockName}}", template: "expiring-final" },
      { offsetDays: 0, kind: "expired", subject: "{{firstName}}, {{stockName}} süren doldu", template: "expired" },
      { offsetDays: 7, kind: "upsell", subject: "{{firstName}}, mağazamızdan haberler 🛒", template: "upsell" },
    ],
  },
};

/** Aylık upsell + memnuniyet mailleri otomatik eklenir (kaydetmede saklanmaz). */
const AUTO_MONTHLY_KIND = "upsell-monthly";
const MONTHLY_INTERVAL_DAYS = 30;
const MONTHLY_FIRST_DAY = 30;

const TEMPLATE_BODIES = {
  welcome: `
    <p style="font-size:18px;margin:0 0 14px">Merhaba <strong>{{firstName}}</strong> 👋</p>
    <p><strong>{{appName}}</strong> üzerinden aldığın <strong>{{stockName}}</strong> siparişin için teşekkürler! Birazdan ayrı bir mailde erişim linkini göndereceğiz.</p>
    <p style="color:#64748b;font-size:14px">Sorun olursa bu maile cevap verebilir veya <strong>{{purchasePlatform}}</strong> mesaj kutusundan yazabilirsin.</p>
  `,
  access: `
    <p style="font-size:18px;margin:0 0 14px">Selam <strong>{{firstName}}</strong> 🎉</p>
    <p><strong>{{stockName}}</strong> satın alımın tamam — erişim linkin hazır!</p>
    <p style="background:#f8fafc;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6">
      📌 <strong>Nasıl kullanılır?</strong><br>
      Aşağıdaki butona tıkla; <strong>ilk tıklamada</strong> süren başlar. Linki <strong>{{accessLinkExpiresLabel}}</strong> kullanabilirsin{{accessMaxVisitsNote}}.<br>
      {{productGuideBlock}}
    </p>
    <p style="text-align:center;margin:28px 0">
      <a href="{{accessUrl}}" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:16px 32px;border-radius:14px;text-decoration:none;font-weight:700;display:inline-block;font-size:16px">🚀 Erişimi aç</a>
    </p>
    <div style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:14px;padding:18px 20px;margin:22px 0;border:1px solid #86efac">
      <p style="margin:0 0 8px;font-size:16px">🎁 <strong>Hediye fırsatı!</strong></p>
      <p style="margin:0;font-size:14px;line-height:1.65;color:#166534">
        Memnun kalırsan <strong>{{purchasePlatform}}</strong> üzerinde <strong>güzel yorum</strong> ve <strong>tam puan ⭐</strong> bırak.
        Hediye için aynı platformdan <strong>mesaj kutusundan</strong> bize yaz — sürprizi iletelim 💜
      </p>
    </div>
    <p style="color:#64748b;font-size:13px">Lisans süren: <strong>{{productDurationLabel}}</strong></p>
  `,
  "expiring-7": `
    <p style="font-size:18px;margin:0 0 12px">{{firstName}}, selam ⏳</p>
    <p><strong>{{stockName}}</strong> paketinin bitmesine <strong>7 gün</strong> kaldı (toplam: {{productDurationLabel}}).</p>
    <p style="font-size:14px;line-height:1.6">Devam için <strong>{{purchasePlatform}}</strong> üzerinden yenileyebilir veya mesaj kutusundan yazabilirsiniz.</p>
  `,
  "expiring-3": `
    <p style="font-size:18px;margin:0 0 12px">{{firstName}}, selam 👋</p>
    <p><strong>{{stockName}}</strong> erişimin <strong>bitmek üzere</strong> — sürenize <strong>3 gün</strong> kaldı.</p>
    <p style="font-size:14px;line-height:1.6">Uzatmak için <strong>{{purchasePlatform}}</strong> üzerinden yenileyebilir veya mesaj kutusundan yazabilirsiniz.</p>
  `,
  expiring: `
    <p style="font-size:18px;margin:0 0 12px">{{firstName}}, selam ⏳</p>
    <p><strong>{{stockName}}</strong> paketinin bitmesine <strong>7 gün</strong> kaldı (toplam: {{productDurationLabel}}).</p>
    <p style="font-size:14px;line-height:1.6">Devam için <strong>{{purchasePlatform}}</strong> üzerinden yenileyebilir veya mesaj kutusundan yazabilirsiniz.</p>
  `,
  "expiring-final": `
    <p style="font-size:18px;margin:0 0 12px">{{firstName}}, yarın son gün 🔔</p>
    <p><strong>{{stockName}}</strong> erişimin <strong>yarın</strong> kapanıyor.</p>
    <p style="font-size:14px;line-height:1.6">Yeniden almak için <strong>{{purchasePlatform}}</strong> üzerinden satın alabilirsiniz.</p>
  `,
  expired: `
    <p style="font-size:18px;margin:0 0 12px">Merhaba {{firstName}},</p>
    <p><strong>{{stockName}}</strong> için tanımlı <strong>{{productDurationLabel}}</strong> süreniz doldu.</p>
    <p style="font-size:14px;line-height:1.6">Yeniden almak için <strong>{{purchasePlatform}}</strong> üzerinden satın alabilirsiniz.</p>
  `,
  upsell: `
    <p style="font-size:18px;margin:0 0 12px">{{firstName}}, merhaba! 👋</p>
    <p>Mağazamızda yeni ürün ve fırsatlar var — bir göz atmanızı isteriz 🛒</p>
  `,
  "upsell-monthly": `
    <p style="font-size:18px;margin:0 0 14px">Merhaba <strong>{{firstName}}</strong> 👋</p>
    <p><strong>{{stockName}}</strong> ile devam ediyor musunuz? Mağazamızı kontrol edin — yeni listeler ve kampanyalar sizi bekliyor 🛒</p>
    <p style="background:#f8fafc;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.65;margin:18px 0">
      💬 <strong>Satın alımınızdan memnun musunuz?</strong> Öneri ve görüşlerinizi çok önemsiyoruz — bu maile cevap yazabilir veya
      <strong>{{purchasePlatform}}</strong> mesaj kutusundan bize ulaşabilirsiniz.
    </p>
    <p style="font-size:14px;color:#64748b">Teşekkürler — sizinle çalışmak bizim için değerli 💜</p>
  `,
};

const templateKvKey = (id) => `template:${id}`;

export function getBuiltinTemplate(id = "default") {
  const t = BUILTIN_TEMPLATES[id] || BUILTIN_TEMPLATES.default;
  return JSON.parse(JSON.stringify(t));
}

export function getDefaultBodies() {
  return { ...TEMPLATE_BODIES };
}

export async function getStoredTemplate(env, id = "default") {
  return getJson(env.AUTOMATIONS, templateKvKey(id));
}

/** Birleşik şablon (KV özelleştirmesi + varsayılan). */
export async function getEffectiveTemplate(env, id = "default") {
  const builtin = getBuiltinTemplate(id);
  const stored = await getStoredTemplate(env, id);
  const bodies = { ...TEMPLATE_BODIES, ...(stored?.bodies || {}) };
  const steps = stored?.steps?.length ? stored.steps : builtin.steps;
  return {
    ...builtin,
    name: stored?.name || builtin.name,
    steps,
    bodies,
    customized: Boolean(stored?.steps || stored?.bodies),
    updatedAt: stored?.updatedAt || null,
  };
}

export async function listTemplates(env) {
  const t = await getEffectiveTemplate(env, "default");
  return [t];
}

export async function saveAutomationTemplate(env, id, { name, steps, bodies }) {
  const builtin = getBuiltinTemplate(id);
  const cleaned = (steps || builtin.steps).filter((s) => s.kind !== AUTO_MONTHLY_KIND);
  await putJson(env.AUTOMATIONS, templateKvKey(id), {
    id,
    name: name || builtin.name,
    steps: cleaned,
    bodies: bodies || {},
    updatedAt: nowIso(),
  });
  return getEffectiveTemplate(env, id);
}

function buildMonthlySteps(productDays) {
  if (!productDays || productDays < MONTHLY_FIRST_DAY + 7) return [];
  const steps = [];
  for (let day = MONTHLY_FIRST_DAY; day < productDays - 7; day += MONTHLY_INTERVAL_DAYS) {
    steps.push({
      offsetDays: day,
      kind: AUTO_MONTHLY_KIND,
      subject: "{{firstName}}, mağazamızı kontrol edin — görüşleriniz 💜",
      template: "upsell-monthly",
    });
  }
  return steps;
}

/** Aylık mailleri ürün süresine göre ekler; -7 ve -3 hatırlatmaları ayrı kalır. */
export function resolveLifecycleSteps(template, productDays = 120) {
  const raw = template?.steps || [];
  const out = [];
  let hasExpiring7 = false;
  let hasExpiring3 = false;

  for (const step of raw) {
    if (step.kind === AUTO_MONTHLY_KIND) continue;
    if (step.kind === "access") {
      out.push(step);
      continue;
    }
    if (step.kind === "expiring" && step.offsetDays === -7) {
      out.push({ ...step, template: step.template || "expiring-7" });
      hasExpiring7 = true;
      continue;
    }
    if (step.kind === "expiring" && step.offsetDays === -3) {
      out.push({ ...step, template: step.template || "expiring-3" });
      hasExpiring3 = true;
      continue;
    }
    if (step.kind === "expiring-final" || (step.kind === "expiring" && step.offsetDays === -1)) {
      out.push({ ...step, kind: "expiring-final", template: step.template || "expiring-final" });
      continue;
    }
    out.push(step);
  }

  const needsExpiry = raw.some((s) => s.kind === "expiring-final" || s.kind === "expired");
  if (!hasExpiring7 && needsExpiry) {
    out.push({
      offsetDays: -7,
      kind: "expiring",
      subject: "{{firstName}}, lisansın 7 gün içinde bitiyor",
      template: "expiring-7",
    });
  }
  if (!hasExpiring3 && needsExpiry) {
    out.push({
      offsetDays: -3,
      kind: "expiring",
      subject: "{{firstName}}, erişimin bitmek üzere ⏳",
      template: "expiring-3",
    });
  }

  const monthly = buildMonthlySteps(productDays);
  const seen = new Set(out.map((s) => `${s.kind}:${s.offsetDays}`));
  for (const m of monthly) {
    const k = `${m.kind}:${m.offsetDays}`;
    if (!seen.has(k)) {
      out.push(m);
      seen.add(k);
    }
  }

  return out.sort((a, b) => {
    const da = computeLifecycleDueAt(a, 0, productDays) ?? a.offsetDays * DAY_MS;
    const db = computeLifecycleDueAt(b, 0, productDays) ?? b.offsetDays * DAY_MS;
    return da - db;
  });
}

export async function resetAutomationTemplate(env, id = "default") {
  await del(env.AUTOMATIONS, templateKvKey(id));
  return getEffectiveTemplate(env, id);
}

import { buildPublicStockUrl } from "../utils/publicUrls.js";
import { resolvePlatformStoreForEmail } from "./platforms.js";
import { escapeHtml } from "../utils/validation.js";

export async function buildLifecycleVars(env, ctx) {
  const productDays = getProductDurationDays(ctx.stock) || 0;
  const maxVisits = ctx.stock?.accessMaxVisits;
  const guide = (ctx.stock?.productGuide || "").trim();
  const lang = normalizeLang(ctx.customer?.preferredLang);
  const store = await resolvePlatformStoreForEmail(env, {
    customer: ctx.customer,
    stock: ctx.stock,
  });
  return {
    appName: ctx.appName || env.APP_NAME || "Item Satış",
    firstName: (ctx.customer.fullName || ctx.customer.email).split(" ")[0],
    email: ctx.customer.email,
    preferredLang: lang,
    purchasePlatform: ctx.customer?.purchasePlatform || "—",
    platformUsername: ctx.customer?.platformUsername || "—",
    stockName: ctx.stock.name,
    accessUrl: ctx.accessUrl,
    renewUrl:
      ctx.renewUrl ||
      buildPublicStockUrl(env.PUBLIC_BASE_URL, ctx.stock?.code, ctx.stock?.categorySlug),
    accessLinkExpiresLabel: formatAccessLinkExpiry(ctx.stock, env),
    accessMaxVisitsNote: maxVisits ? ` (en fazla ${maxVisits} kez tıklanabilir)` : "",
    productDurationLabel: formatProductDuration(ctx.stock),
    durationLabel: productDays ? `${productDays} gün` : "süresiz",
    productGuideBlock: guide
      ? `Ürün notu: ${guide}`
      : "Kurulum adımları e-postadaki linke tıkladıktan sonra açılan sayfada yer alır.",
    storeUrl: store.storeUrl || "",
    storeName: store.storeName || "",
  };
}

export async function buildLifecycleEmailHtml(env, templateKey, vars, templateId = "default") {
  const lang = normalizeLang(vars.preferredLang);
  const localized = getLocalizedEmailBody(templateKey, lang);
  if (localized) return wrapHtml(renderTemplate(localized, vars), vars);
  const { bodies } = await getEffectiveTemplate(env, templateId);
  const inner = bodies[templateKey] || TEMPLATE_BODIES[templateKey] || "";
  return wrapHtml(renderTemplate(inner, vars), vars);
}

export async function scheduleLifecycleOnFirstAccess(env, ctx) {
  const key = K.lifecycleSchedule(ctx.customer.id, ctx.stock.id);
  const existing = await env.LIFECYCLES.get(key);
  if (existing) return false;

  await putJson(env.LIFECYCLES, key, { scheduledAt: nowIso(), customerId: ctx.customer.id, stockId: ctx.stock.id });
  await scheduleLifecycleForCustomer(env, { ...ctx, baseTime: Date.now() });
  return true;
}

const DAY_MS = 86400 * 1000;

/**
 * Lifecycle zamanlaması — ürün süresi (örn. 4 ay) ile erişim linki TTL'si ayrıdır.
 * - welcome / upsell: offsetDays ilk erişime göre
 * - expiring / expiring-final: ürün bitişinden X gün önce (offsetDays negatif)
 * - expired offsetDays 0: ürün süresi sonunda (4 ay sonra), link TTL'si değil
 */
export function computeLifecycleDueAt(step, baseTime, productDays) {
  if (step.kind === "access") return null;

  if (step.kind === "expired") {
    if (!productDays) return null;
    if (step.offsetDays === 0) return baseTime + productDays * DAY_MS;
    if (step.offsetDays < 0) return baseTime + (productDays + step.offsetDays) * DAY_MS;
    return baseTime + (productDays + step.offsetDays) * DAY_MS;
  }

  if (step.offsetDays === 0) return baseTime;

  if (step.offsetDays < 0) {
    if (!productDays) return null;
    const daysBeforeEnd = -step.offsetDays;
    if (productDays < daysBeforeEnd) return null;
    return baseTime + (productDays + step.offsetDays) * DAY_MS;
  }

  return baseTime + step.offsetDays * DAY_MS;
}

const LIFECYCLE_STEP_LABELS = {
  welcome: "Hoş geldin",
  access: "Erişim (anında mail)",
  expiring: "Süre bitiyor",
  "expiring-7": "Süre bitiyor (7 gün önce)",
  "expiring-3": "Bitmek üzere (3 gün önce)",
  "expiring-final": "Son gün hatırlatması",
  expired: "Ürün süresi doldu",
  upsell: "Upsell (1. hafta)",
  "upsell-monthly": "Aylık — mağaza & görüş",
};

/** Admin: bu stoktaki ürün süresine göre planlanan otomatik mailler. */
export async function buildLifecycleSchedulePreview(env, stock, baseTimeMs = Date.now()) {
  const templateId = stock?.lifecycle?.template || "default";
  const template = await getEffectiveTemplate(env, templateId);
  const productDays = getProductDurationDays(stock) || 0;
  const { formatProductDuration } = await import("../utils/stockFields.js");
  const steps = resolveLifecycleSteps(template, productDays);

  return steps
    .map((step) => {
      const dueAt = computeLifecycleDueAt(step, baseTimeMs, productDays);
      if (dueAt == null) return null;
      return {
        kind: step.kind,
        label: LIFECYCLE_STEP_LABELS[step.template] || LIFECYCLE_STEP_LABELS[step.kind] || step.kind,
        subject: step.subject,
        dueAt,
        dueAtIso: new Date(dueAt).toISOString(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dueAt - b.dueAt)
    .map((row) => ({
      ...row,
      productDurationLabel: formatProductDuration(stock),
      relativeNote:
        row.kind === "expired"
          ? `Stok ürün süresi: ${formatProductDuration(stock)} — ilk mail linkine tıklamadan itibaren`
          : null,
    }));
}

export async function scheduleLifecycleForCustomer(env, ctx) {
  const templateId = ctx.stock?.lifecycle?.template || "default";
  const template = await getEffectiveTemplate(env, templateId);
  const productDays = getProductDurationDays(ctx.stock) || 0;
  const baseTime = ctx.baseTime ?? Date.now();
  const vars = await buildLifecycleVars(env, ctx);
  const steps = resolveLifecycleSteps(template, productDays);

  for (const step of steps) {
    const dueAt = computeLifecycleDueAt(step, baseTime, productDays);
    if (dueAt == null || dueAt <= 0) continue;

    const lang = normalizeLang(ctx.customer?.preferredLang);
    const subjTpl =
      getLocalizedEmailSubject(step.template, lang) ||
      getLocalizedEmailSubject(step.kind, lang) ||
      step.subject;
    await enqueueEmail(env, {
      dueAt,
      customerId: ctx.customer.id,
      kind: step.kind,
      message: {
        to: ctx.customer.email,
        subject: renderTemplate(subjTpl, vars),
        html: await buildLifecycleEmailHtml(env, step.template, vars, templateId),
      },
    });
  }
}

function buildStoreVisitButtonHtml(vars) {
  const url = String(vars.storeUrl || "").trim();
  if (!url) return "";
  const name = String(vars.storeName || vars.purchasePlatform || "").trim();
  const label = name ? `${escapeHtml(name)} mağazamızı ziyaret edin` : "Mağazamızı ziyaret edin";
  return `<p style="text-align:center;margin:24px 0 4px">
    <a href="${escapeHtml(url)}" style="background:#0f172a;color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;display:inline-block;font-size:15px">🛒 ${label}</a>
  </p>`;
}

export function wrapHtml(inner, vars = {}) {
  const storeBtn = buildStoreVisitButtonHtml(vars);
  const warmClose = storeBtn
    ? ""
    : `<p style="color:#64748b;font-size:14px;margin:18px 0 0;line-height:1.6">İyi günler dileriz.</p>`;
  const footer = renderTemplate(
    `<p style="color:#94a3b8;font-size:12px;margin:12px 0 0">Sevgiler,<br><strong>{{appName}}</strong> ekibi</p>`,
    vars,
  );
  return `<!doctype html><html><body style="font-family:Inter,Segoe UI,Helvetica,sans-serif;background:#f1f5f9;color:#0f172a;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 8px 24px rgba(15,23,42,0.06)">
      ${inner}
      <hr style="margin:28px 0;border:none;border-top:1px solid #e2e8f0">
      ${warmClose}
      ${storeBtn}
      ${footer}
    </div>
  </body></html>`;
}
