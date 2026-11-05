/**
 * Customer + lead CRM domain.
 *
 * Customers are de-duplicated by HMAC-hashed email so we never need to scan
 * the entire collection. Each customer aggregates lifecycle/visit history.
 */

import { K, getJson, putJson, putJsonSafe, del, listAllKeys, listKeysCapped, hydrate } from "./kv.js";
import { newId, hmac, nowIso } from "../utils/helpers.js";
import { requireEmail, optionalString, ValidationError } from "../utils/validation.js";
import { applyVisitContext } from "./tracking.js";
import { normalizeLang } from "../i18n/languages.js";

export const LIFECYCLE_STAGES = ["lead", "active", "expiring", "churned", "renewed"];

/** Find-or-create a customer keyed by hashed email. */
export async function upsertCustomerByEmail(env, input, visitContext = {}) {
  const email = requireEmail(input.email);
  const fullName = optionalString(input.fullName, "fullName", { max: 120 });
  const purchasePlatform = optionalString(input.purchasePlatform, "purchasePlatform", { max: 80 });
  const platformUsername = optionalString(input.platformUsername, "platformUsername", { max: 80 });
  const preferredLang = input.preferredLang ? normalizeLang(input.preferredLang) : null;
  const telegram = optionalString(input.telegram, "telegram", { max: 60 });
  const discord = optionalString(input.discord, "discord", { max: 60 });

  const emailHash = await hmac(env.HASH_PEPPER || "default-pepper", email);
  const existingId = await env.CUSTOMERS.get(K.customerByEmailHash(emailHash));

  let customer;
  if (existingId) {
    customer = await getJson(env.CUSTOMERS, K.customer(existingId));
    if (!customer) throw new Error("Customer index stale");
    if (fullName && !customer.fullName) customer.fullName = fullName;
    if (purchasePlatform) customer.purchasePlatform = purchasePlatform;
    if (platformUsername) customer.platformUsername = platformUsername;
    if (preferredLang) customer.preferredLang = preferredLang;
    if (telegram) customer.telegram = telegram;
    if (discord) customer.discord = discord;
    applyVisitContext(customer, visitContext);
    customer.lastActivityAt = nowIso();
    customer.visits = (customer.visits || 0) + 1;
  } else {
    customer = {
      id: newId(),
      emailHash,
      email,
      fullName,
      purchasePlatform: purchasePlatform || null,
      platformUsername: platformUsername || null,
      preferredLang: preferredLang || "tr",
      telegram,
      discord,
      lifecycleStage: "lead",
      firstSeenAt: nowIso(),
      lastActivityAt: nowIso(),
      visits: 1,
      stockHistory: [],
      categoryHistory: [],
      emailHistory: [],
      tags: [],
    };
    applyVisitContext(customer, visitContext);
    await env.CUSTOMERS.put(K.customerByEmailHash(emailHash), customer.id);
  }
  if (fullName) customer.fullName = fullName;
  if (purchasePlatform) customer.purchasePlatform = purchasePlatform;
  if (platformUsername) customer.platformUsername = platformUsername;
  if (preferredLang) customer.preferredLang = preferredLang;
  await putJson(env.CUSTOMERS, K.customer(customer.id), customer);
  await registerCustomerInIndex(env, customer.id);
  return { customer, created: !existingId };
}

const CUSTOMER_MANIFEST = "index:customers";

async function registerCustomerInIndex(env, customerId) {
  const m = (await getJson(env.CUSTOMERS, CUSTOMER_MANIFEST)) || { ids: [] };
  await putJsonSafe(env.CUSTOMERS, CUSTOMER_MANIFEST, {
    ids: [customerId, ...m.ids.filter((x) => x !== customerId)].slice(0, 5000),
    updatedAt: nowIso(),
  });
}

/** KV list kotası yüzünden boş liste — lead kayıtlarından müşteri manifestini doldur. */
export async function rebuildCustomerManifest(env) {
  const leads = await listLeads(env, { limit: 500 });
  const idSet = new Set();
  for (const lead of leads) {
    if (lead.customerId) idSet.add(lead.customerId);
  }
  if (!idSet.size) {
    const keys = await listKeysCapped(env.CUSTOMERS, "cust:", 500);
    for (const k of keys) {
      const id = k.name.replace(/^cust:/, "");
      if (id) idSet.add(id);
    }
  }
  const ids = [...idSet];
  await putJsonSafe(env.CUSTOMERS, CUSTOMER_MANIFEST, { ids, updatedAt: nowIso() });
  return ids.length;
}

/** Admin geçmişi — aynı müşteri e-posta ile tanınır. */
export async function appendCustomerEvent(env, customerId, { type, stockId, stockName, note, meta = {} }) {
  const customer = await getJson(env.CUSTOMERS, K.customer(customerId));
  if (!customer) return null;
  customer.crmEvents = customer.crmEvents || [];
  customer.crmEvents.unshift({
    at: nowIso(),
    type,
    stockId: stockId || null,
    stockName: stockName || null,
    note: note || null,
    ...meta,
  });
  customer.crmEvents = customer.crmEvents.slice(0, 80);
  customer.lastActivityAt = nowIso();
  await putJson(env.CUSTOMERS, K.customer(customerId), customer);
  return customer;
}

export async function attachStockInteraction(env, customerId, { stockId, categoryId, productDurationDays, accessLinkTtlHours, durationDays }) {
  const customer = await getJson(env.CUSTOMERS, K.customer(customerId));
  if (!customer) return null;
  const prodDays = productDurationDays ?? durationDays ?? null;
  customer.stockHistory = customer.stockHistory || [];
  customer.stockHistory.unshift({
    stockId,
    categoryId,
    attachedAt: nowIso(),
    accessActivatedAt: null,
    productDurationDays: prodDays,
    accessLinkTtlHours: accessLinkTtlHours ?? null,
  });
  customer.stockHistory = customer.stockHistory.slice(0, 200);

  if (categoryId && !customer.categoryHistory.includes(categoryId)) {
    customer.categoryHistory = [categoryId, ...customer.categoryHistory].slice(0, 50);
  }

  if (customer.lifecycleStage === "lead") customer.lifecycleStage = "active";
  customer.lastActivityAt = nowIso();
  await putJson(env.CUSTOMERS, K.customer(customerId), customer);
  return customer;
}

/** İlk /access/ tıklamasında stok geçmişine aktivasyon zamanı yazar. */
export async function markStockAccessActivated(env, customerId, stockId) {
  const customer = await getJson(env.CUSTOMERS, K.customer(customerId));
  if (!customer?.stockHistory) return null;
  const entry = customer.stockHistory.find((h) => h.stockId === stockId && !h.accessActivatedAt);
  if (!entry) return customer;
  entry.accessActivatedAt = nowIso();
  customer.lastActivityAt = nowIso();
  await putJson(env.CUSTOMERS, K.customer(customerId), customer);
  return customer;
}

export async function recordEmailToCustomer(
  env,
  customerId,
  { type, subject, sentAt = nowIso(), delivered = null, driver = null },
) {
  const customer = await getJson(env.CUSTOMERS, K.customer(customerId));
  if (!customer) return;
  customer.emailHistory = customer.emailHistory || [];
  const last = customer.emailHistory[0];
  if (last && last.type === type && last.subject === subject) {
    const lastMs = new Date(last.sentAt).getTime();
    if (Date.now() - lastMs < 120_000) return;
  }
  customer.emailHistory.unshift({
    type,
    subject,
    sentAt,
    delivered,
    driver,
  });
  customer.emailHistory = customer.emailHistory.slice(0, 100);
  await putJson(env.CUSTOMERS, K.customer(customerId), customer);
}

export async function updateCustomer(env, customerId, patch) {
  const customer = await getJson(env.CUSTOMERS, K.customer(customerId));
  if (!customer) return null;

  if (patch.fullName !== undefined) {
    customer.fullName = optionalString(patch.fullName, "fullName", { max: 120 }) || customer.fullName;
  }
  if (patch.telegram !== undefined) customer.telegram = optionalString(patch.telegram, "telegram", { max: 60 });
  if (patch.discord !== undefined) customer.discord = optionalString(patch.discord, "discord", { max: 60 });
  if (patch.notes !== undefined) customer.notes = optionalString(patch.notes, "notes", { max: 2000 });

  if (patch.email !== undefined && patch.email !== "") {
    const newEmail = requireEmail(patch.email);
    if (newEmail !== customer.email) {
      const newHash = await hmac(env.HASH_PEPPER || "default-pepper", newEmail);
      const clashId = await env.CUSTOMERS.get(K.customerByEmailHash(newHash));
      if (clashId && clashId !== customerId) {
        throw new ValidationError("Bu e-posta başka bir müşteride kayıtlı", "email");
      }
      if (customer.emailHash) await del(env.CUSTOMERS, K.customerByEmailHash(customer.emailHash));
      customer.email = newEmail;
      customer.emailHash = newHash;
      await env.CUSTOMERS.put(K.customerByEmailHash(newHash), customerId);
    }
  }

  if (patch.stage) {
    if (!LIFECYCLE_STAGES.includes(patch.stage)) throw new ValidationError("Unknown lifecycle stage");
    customer.lifecycleStage = patch.stage;
  }

  customer.lastActivityAt = nowIso();
  await putJson(env.CUSTOMERS, K.customer(customerId), customer);
  await registerCustomerInIndex(env, customerId);
  return customer;
}

export async function deleteCustomer(env, customerId) {
  const customer = await getJson(env.CUSTOMERS, K.customer(customerId));
  if (!customer) return false;
  if (customer.emailHash) await del(env.CUSTOMERS, K.customerByEmailHash(customer.emailHash));
  await del(env.CUSTOMERS, K.customer(customerId));
  const m = (await getJson(env.CUSTOMERS, CUSTOMER_MANIFEST)) || { ids: [] };
  await putJsonSafe(env.CUSTOMERS, CUSTOMER_MANIFEST, {
    ids: m.ids.filter((x) => x !== customerId),
    updatedAt: nowIso(),
  });
  return true;
}

export async function deleteCustomersBulk(env, ids) {
  let deleted = 0;
  for (const id of (ids || []).slice(0, 100)) {
    if (await deleteCustomer(env, id)) deleted++;
  }
  return deleted;
}

export async function setLifecycleStage(env, customerId, stage) {
  if (!LIFECYCLE_STAGES.includes(stage)) throw new ValidationError("Unknown lifecycle stage");
  const customer = await getJson(env.CUSTOMERS, K.customer(customerId));
  if (!customer) return null;
  customer.lifecycleStage = stage;
  customer.lastActivityAt = nowIso();
  await putJson(env.CUSTOMERS, K.customer(customerId), customer);
  return customer;
}

export async function getCustomer(env, id) {
  return getJson(env.CUSTOMERS, K.customer(id));
}

export async function listCustomers(env, { search, stage, limit = 100 } = {}) {
  let manifest = (await getJson(env.CUSTOMERS, CUSTOMER_MANIFEST)) || { ids: [] };
  let customers = [];
  for (const id of manifest.ids) {
    const c = await getCustomer(env, id);
    if (c) customers.push(c);
  }
  if (!customers.length) {
    const keys = await listKeysCapped(env.CUSTOMERS, "cust:", 300);
    for (const k of keys) {
      const id = k.name.replace(/^cust:/, "");
      const c = await getCustomer(env, id);
      if (c) customers.push(c);
    }
  }
  let out = customers;
  if (stage) out = out.filter((c) => c.lifecycleStage === stage);
  if (search) {
    const s = search.toLowerCase();
    out = out.filter(
      (c) =>
        (c.email && c.email.includes(s)) ||
        (c.fullName && c.fullName.toLowerCase().includes(s)) ||
        (c.telegram && c.telegram.toLowerCase().includes(s)),
    );
  }
  out.sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
  return out.slice(0, limit);
}

/** Save a lightweight Lead row that mirrors the form submission. */
export async function createLead(env, { customerId, stockId, categoryId, context, accessUrl, customerName, customerEmail }) {
  const id = newId();
  const lead = {
    id,
    customerId,
    stockId,
    categoryId,
    customerName: customerName || null,
    customerEmail: customerEmail || null,
    status: "new",
    context: context || null,
    accessUrl: accessUrl || null,
    createdAt: nowIso(),
  };
  await putJson(env.LEADS, K.lead(id), lead);
  await registerLeadInIndex(env, lead.id);
  return lead;
}

const LEAD_MANIFEST = "index:leads";

async function registerLeadInIndex(env, leadId) {
  const m = (await getJson(env.LEADS, LEAD_MANIFEST)) || { ids: [] };
  await putJsonSafe(env.LEADS, LEAD_MANIFEST, {
    ids: [leadId, ...m.ids.filter((x) => x !== leadId)].slice(0, 2000),
    updatedAt: nowIso(),
  });
}

export async function getLead(env, id) {
  return getJson(env.LEADS, K.lead(id));
}

export async function updateLead(env, id, patch) {
  const lead = await getLead(env, id);
  if (!lead) return null;
  const next = { ...lead, ...patch };
  await putJson(env.LEADS, K.lead(id), next);
  return next;
}

export async function listLeads(env, { limit = 100, customerId, stockId } = {}) {
  const manifest = (await getJson(env.LEADS, LEAD_MANIFEST)) || { ids: [] };
  let items = [];
  for (const id of manifest.ids) {
    const lead = await getLead(env, id);
    if (lead) items.push(lead);
  }
  if (!items.length) {
    const keys = await listKeysCapped(env.LEADS, "lead:", 300);
    items = await hydrate(env.LEADS, keys);
  }
  if (customerId) items = items.filter((l) => l.customerId === customerId);
  if (stockId) items = items.filter((l) => l.stockId === stockId);
  items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const slice = items.slice(0, limit);
  for (const lead of slice) {
    const [cust, stock] = await Promise.all([
      getJson(env.CUSTOMERS, K.customer(lead.customerId)),
      getJson(env.LINKS, K.stock(lead.stockId)),
    ]);
    if (cust) {
      lead.customerEmail = lead.customerEmail || cust.email;
      lead.customerName = lead.customerName || cust.fullName;
    }
    if (stock) lead.stockName = stock.name;
  }
  return slice;
}

export async function deleteLead(env, id) {
  const lead = await getLead(env, id);
  if (!lead) return false;
  await del(env.LEADS, K.lead(id));
  const m = (await getJson(env.LEADS, LEAD_MANIFEST)) || { ids: [] };
  await putJsonSafe(env.LEADS, LEAD_MANIFEST, {
    ids: m.ids.filter((x) => x !== id),
    updatedAt: nowIso(),
  });
  return true;
}

export async function deleteLeadsBulk(env, ids) {
  let deleted = 0;
  for (const id of (ids || []).slice(0, 100)) {
    if (await deleteLead(env, id)) deleted++;
  }
  return deleted;
}
