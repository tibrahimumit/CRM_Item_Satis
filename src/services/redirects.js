/**
 * Stock / redirect domain logic.
 *
 * A "stock" represents a hidden URL exposed via a short public `code`. It can
 * carry a lifecycle (duration in days) so customers receive automated emails
 * during the active window and beyond.
 */

import { K, getJson, putJson, putJsonSafe, del, listKeysCapped } from "./kv.js";
import { newId, newRedirectCode, nowIso } from "../utils/helpers.js";
import { requireString, requireUrl, optionalString, requirePositiveInt, ValidationError } from "../utils/validation.js";
import { parseStockTimingFields } from "../utils/stockFields.js";

/** Stock shape (documentation only — KV is schemaless). */
// {
//   id, categoryId, name, code, realUrl,
//   durationDays, maxVisits, expiresAt,
//   visits, leads, customers,
//   lifecycle: { template: "default" },
//   createdAt, updatedAt
// }

const CATEGORY_MANIFEST = "index:categories";
const SLUG_MANIFEST = "index:slugs";

async function readCategoryManifest(env) {
  return (await getJson(env.CATEGORIES, CATEGORY_MANIFEST)) || { ids: [] };
}

async function readSlugManifest(env) {
  return (await getJson(env.CATEGORIES, SLUG_MANIFEST)) || { slugs: [] };
}

async function writeCategoryManifest(env, ids) {
  await putJson(env.CATEGORIES, CATEGORY_MANIFEST, { ids: [...new Set(ids)], updatedAt: nowIso() });
}

async function writeSlugManifest(env, slugs) {
  await putJson(env.CATEGORIES, SLUG_MANIFEST, { slugs: [...new Set(slugs)], updatedAt: nowIso() });
}

async function registerCategoryInIndexes(env, cat) {
  const idManifest = await readCategoryManifest(env);
  const slugManifest = await readSlugManifest(env);
  await writeCategoryManifest(env, [cat.id, ...idManifest.ids.filter((x) => x !== cat.id)]);
  await writeSlugManifest(env, [cat.slug, ...slugManifest.slugs.filter((s) => s !== cat.slug)]);
}

/**
 * KV list kotasında boş dönebilir; tek tek GET her zaman çalışır.
 * Slug manifest (index:slugs) + id manifest ile listeler.
 */
export async function syncCategoriesFromKv(env, { extraSlugs = [] } = {}) {
  const byId = new Map();
  const slugSet = new Set([...(await readSlugManifest(env)).slugs, ...extraSlugs]);
  const idManifest = await readCategoryManifest(env);

  for (const id of idManifest.ids) {
    const cat = await getCategory(env, id);
    if (cat?.id) {
      byId.set(cat.id, cat);
      slugSet.add(cat.slug);
    }
  }

  for (const slug of slugSet) {
    const id = await env.CATEGORIES.get(K.categoryBySlug(slug));
    if (!id) continue;
    let cat = await getCategory(env, id);
    if (!cat) {
      const label = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      cat = { id, name: label, slug, createdAt: nowIso(), updatedAt: nowIso() };
      await putJson(env.CATEGORIES, K.category(id), cat);
      if (!(await env.CATEGORIES.get(K.categoryCounter(id)))) {
        await env.CATEGORIES.put(K.categoryCounter(id), "0");
      }
    }
    byId.set(cat.id, cat);
  }

  if (byId.size === 0) {
    const slugKeys = await listKeysCapped(env.CATEGORIES, "idx:slug:", 500);
    for (const k of slugKeys) {
      slugSet.add(k.name.replace(/^idx:slug:/, ""));
    }
    for (const slug of slugSet) {
      const id = await env.CATEGORIES.get(K.categoryBySlug(slug));
      if (!id) continue;
      const cat = await getCategory(env, id);
      if (cat) byId.set(cat.id, cat);
    }
  }

  const cats = [...byId.values()];
  await writeCategoryManifest(env, cats.map((c) => c.id));
  await writeSlugManifest(env, cats.map((c) => c.slug));
  return cats;
}

export async function listCategories(env, { platformId } = {}) {
  const idManifest = await readCategoryManifest(env);
  const out = [];
  for (const id of idManifest.ids) {
    const cat = await getCategory(env, id);
    if (!cat) continue;
    if (platformId && cat.platformId !== platformId) continue;
    out.push(cat);
  }
  if (out.length) return out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  // Kota dostu: listelemede KV yazma yok (repairCategories ayrı uçtan)
  const keys = await listKeysCapped(env.CATEGORIES, "cat:", 200);
  for (const k of keys) {
    const id = k.name.replace(/^cat:/, "");
    const cat = await getCategory(env, id);
    if (!cat) continue;
    if (platformId && cat.platformId !== platformId) continue;
    out.push(cat);
  }
  return out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/** Admin: slug manifest + id manifest yeniden oluştur (KV list çalışmasa bile GET ile). */
export async function repairCategories(env, { slugs = [] } = {}) {
  return syncCategoriesFromKv(env, { extraSlugs: slugs });
}

export async function getCategory(env, id) {
  return getJson(env.CATEGORIES, K.category(id));
}

function normalizeCategorySlug(raw) {
  const slug = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 64);
  if (!slug || slug.length < 2) {
    throw new ValidationError("Slug en az 2 karakter (a-z, 0-9, tire)", "slug");
  }
  return slug;
}

export async function createCategory(env, input) {
  const name = requireString(input.name, "name", { max: 80 });
  const slug = normalizeCategorySlug(requireString(input.slug, "slug", { min: 2, max: 64 }));
  const platformId = requireString(input.platformId, "platformId");
  const { getPlatform } = await import("./platforms.js");
  const platform = await getPlatform(env, platformId);
  if (!platform) throw new ValidationError("Platform not found", "platformId");

  const existingId = await env.CATEGORIES.get(K.categoryBySlug(slug));
  if (existingId) {
    const existing = await getCategory(env, existingId);
    if (existing) {
      await registerCategoryInIndexes(env, existing);
      const err = new ValidationError(`Bu slug zaten kullanılıyor: ${existing.name}`, "slug");
      err.existingCategory = existing;
      throw err;
    }
    await del(env.CATEGORIES, K.categoryBySlug(slug));
  }

  const id = newId();
  const cat = {
    id,
    name,
    slug,
    platformId: platform.id,
    platformName: platform.name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await putJson(env.CATEGORIES, K.category(id), cat);
  await env.CATEGORIES.put(K.categoryBySlug(slug), id);
  await env.CATEGORIES.put(K.categoryCounter(id), "0");
  await registerCategoryInIndexes(env, cat);
  return cat;
}

export async function renameCategory(env, id, name) {
  const cat = await getCategory(env, id);
  if (!cat) throw new ValidationError("Category not found");
  cat.name = requireString(name, "name", { max: 80 });
  cat.updatedAt = nowIso();
  await putJson(env.CATEGORIES, K.category(id), cat);
  return cat;
}

export async function deleteCategory(env, id) {
  const cat = await getCategory(env, id);
  if (!cat) return false;
  // Also delete stocks belonging to this category.
  const stockKeys = await listKeysCapped(env.LINKS, `idx:cat:${id}:`, 500);
  for (const k of stockKeys) {
    const stockId = k.name.split(":").pop();
    await deleteStock(env, stockId);
  }
  await del(env.CATEGORIES, K.category(id));
  await del(env.CATEGORIES, K.categoryBySlug(cat.slug));
  await del(env.CATEGORIES, K.categoryCounter(id));
  const idManifest = await readCategoryManifest(env);
  const slugManifest = await readSlugManifest(env);
  await writeCategoryManifest(env, idManifest.ids.filter((x) => x !== id));
  await writeSlugManifest(env, slugManifest.slugs.filter((s) => s !== cat.slug));
  return true;
}

async function nextStockNumber(env, categoryId) {
  const cur = Number((await env.CATEGORIES.get(K.categoryCounter(categoryId))) || 0) + 1;
  await env.CATEGORIES.put(K.categoryCounter(categoryId), String(cur));
  return cur;
}

export async function createStock(env, input, { deferIndex = false } = {}) {
  const categoryId = requireString(input.categoryId, "categoryId");
  const category = await getCategory(env, categoryId);
  if (!category) throw new ValidationError("Category not found", "categoryId");

  const name = optionalString(input.name, "name", { max: 120 });
  const productGuide = optionalString(input.productGuide, "productGuide", { max: 4000 }) || null;
  const listPrice = parseListPrice(input.listPrice);
  const currency = optionalString(input.currency, "currency", { max: 8 }) || "TRY";
  const realUrl = requireUrl(input.realUrl, "realUrl");
  const timing = parseStockTimingFields(input);

  const id = newId();
  const code = await uniqueRedirectCode(env);
  const number = await nextStockNumber(env, categoryId);
  const stock = {
    id,
    categoryId,
    platformId: category.platformId || null,
    categorySlug: category.slug,
    number,
    name: name || `${category.name} #${number}`,
    productGuide,
    code,
    realUrl,
    accessLinkTtlHours: timing.accessLinkTtlHours,
    accessMaxVisits: timing.accessMaxVisits,
    productDurationDays: timing.productDurationDays,
    productDurationMonths: timing.productDurationMonths,
    durationDays: timing.productDurationDays,
    maxVisits: null,
    expiresAt: null,
    visits: 0,
    leads: 0,
    customers: 0,
    lifecycle: { template: input.lifecycleTemplate || "default" },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  if (listPrice > 0) {
    stock.listPrice = listPrice;
    stock.currency = currency;
  }

  await putJson(env.LINKS, K.stock(id), stock);
  await env.LINKS.put(K.stockByCode(code), id);
  await env.LINKS.put(K.stockByCategory(categoryId, id), id);
  if (!deferIndex) await registerStockInIndexes(env, stock);
  return stock;
}

/** Aynı gizli URL; her biri farklı public /r/kod (max 30 — KV kotası). */
export async function createStocksBulk(env, input) {
  const count = Math.min(Math.max(Number(input.count) || 2, 2), 100);
  const prefix =
    optionalString(input.namePrefix, "namePrefix", { max: 120 }) ||
    optionalString(input.name, "name", { max: 120 });
  const base = { ...input };
  delete base.count;
  delete base.namePrefix;
  delete base.name;
  delete base.bulkMode;
  delete base.bulkCount;

  const items = [];
  for (let i = 0; i < count; i++) {
    const name = prefix ? `${prefix} #${i + 1}` : undefined;
    items.push(await createStock(env, { ...base, name }, { deferIndex: true }));
  }
  await registerStocksBulkIndexes(env, items);
  return items;
}

function parseListPrice(value) {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function stockListEntry(stock) {
  return {
    id: stock.id,
    code: stock.code,
    name: stock.name,
    listPrice: stock.listPrice ?? null,
    currency: stock.currency || "TRY",
    categoryId: stock.categoryId,
    categorySlug: stock.categorySlug,
    number: stock.number,
    realUrl: stock.realUrl,
    accessLinkTtlHours: stock.accessLinkTtlHours,
    accessMaxVisits: stock.accessMaxVisits,
    productDurationDays: stock.productDurationDays,
    productDurationMonths: stock.productDurationMonths,
    durationDays: stock.durationDays,
    visits: stock.visits ?? 0,
    leads: stock.leads ?? 0,
    customers: stock.customers ?? 0,
    lifecycle: stock.lifecycle,
    createdAt: stock.createdAt,
    updatedAt: stock.updatedAt,
  };
}

async function uniqueRedirectCode(env) {
  for (let i = 0; i < 8; i++) {
    const code = newRedirectCode(8);
    const taken = await env.LINKS.get(K.stockByCode(code));
    if (!taken) return code;
  }
  throw new Error("Unable to allocate unique redirect code");
}

export async function getStock(env, id) { return getJson(env.LINKS, K.stock(id)); }

export const LEAD_CLAIM_ITEMSATIS_MSG =
  "Bu link zaten kullanıldı. Yeniden almak isterseniz ItemSatış üzerinden satın alabilirsiniz.";

export const LEAD_CLAIM_ALREADY_SENT_MSG =
  "Gizli erişim linki e-posta adresinize zaten gönderildi. Lütfen gelen kutunuzu ve spam klasörünü kontrol edin.";

export function isStockLeadClaimed(stock) {
  return Boolean(stock?.leadClaimedAt);
}

/** Eski kayıtlar: stokta lead var ama leadClaimedAt yoksa ilk lead'den kilidi yazar. */
export async function syncLeadClaimFromLeads(env, stockId) {
  const stock = await getStock(env, stockId);
  if (!stock || stock.leadClaimedAt) return stock;

  const { listLeads } = await import("./customers.js");
  const leads = await listLeads(env, { stockId, limit: 50 });
  if (!leads.length) return stock;

  const first = [...leads].sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || ""),
  )[0];
  return markStockLeadClaimed(env, stock, {
    customerId: first.customerId,
    email: first.customerEmail || null,
    ip: null,
  });
}

/** Form kilitli mi (bayrak veya mevcut lead kaydı). */
export async function isStockLeadLocked(env, stock) {
  if (!stock) return false;
  if (isStockLeadClaimed(stock)) return true;
  const { listLeads } = await import("./customers.js");
  const leads = await listLeads(env, { stockId: stock.id, limit: 1 });
  return leads.length > 0;
}

/** Landing/POST öncesi: senkron + güncel stok + kilit bilgisi. */
export async function resolveStockLeadLock(env, stock) {
  if (!stock) return { locked: false, stock: null };
  const locked = await isStockLeadLocked(env, stock);
  return {
    locked,
    stock,
    claimedEmail: stock?.leadClaimedEmail || null,
  };
}

/**
 * İkinci maili engellemek için slot rezervasyonu (mail öncesi).
 * Mail hata verirse clearStockLeadClaim ile geri alınır.
 */
export async function reserveStockLeadClaim(env, stock, { customerId, email, ip }) {
  await syncLeadClaimFromLeads(env, stock.id);
  const fresh = await getStock(env, stock.id);
  if (!fresh) return { ok: false, reason: "not_found" };
  if (await isStockLeadLocked(env, fresh)) {
    return { ok: false, reason: "locked", stock: fresh };
  }
  const claimed = await markStockLeadClaimed(env, fresh, { customerId, email, ip });
  return { ok: true, stock: claimed };
}

export async function markStockLeadClaimed(env, stock, { customerId, email, ip }) {
  const cur = await getStock(env, stock.id);
  if (!cur) return null;
  if (cur.leadClaimedAt) return cur;
  const claimEntry = {
    at: nowIso(),
    email,
    customerId,
    ip: ip || null,
  };
  const next = {
    ...cur,
    leadClaimedAt: claimEntry.at,
    leadClaimedCustomerId: customerId,
    leadClaimedEmail: email,
    leadClaimedIp: ip || null,
    leadClaimCount: (cur.leadClaimCount || 0) + 1,
    leadClaimHistory: [claimEntry, ...(cur.leadClaimHistory || [])].slice(0, 20),
    leadLockClearedAt: null,
    updatedAt: nowIso(),
  };
  await putJson(env.LINKS, K.stock(stock.id), next);
  await upsertStockMeta(env, next);
  return next;
}

export async function clearStockLeadClaim(env, stockId) {
  const cur = await getStock(env, stockId);
  if (!cur) return null;
  const next = { ...cur };
  delete next.leadClaimedAt;
  delete next.leadClaimedCustomerId;
  delete next.leadClaimedEmail;
  delete next.leadClaimedIp;
  next.leadLockClearedAt = nowIso();
  next.updatedAt = nowIso();
  await putJson(env.LINKS, K.stock(stockId), next);
  await upsertStockMeta(env, next);
  return next;
}

export async function getStockByCode(env, code) {
  const id = await env.LINKS.get(K.stockByCode(code));
  if (!id) return null;
  return getStock(env, id);
}

/** @deprecated Landing artık yazmaz; gerekirse admin onarımı. Kota dostu tek kayıt. */
export async function recordStockPublicVisit(env, stockId, context = {}) {
  const stock = await getStock(env, stockId);
  if (!stock) return null;
  const next = {
    ...stock,
    lastPublicVisitAt: nowIso(),
    lastPublicVisitIp: context.ip || null,
    updatedAt: nowIso(),
  };
  const { putJsonSafe } = await import("./kv.js");
  await putJsonSafe(env.LINKS, K.stock(stockId), next);
  return next;
}

const STOCK_MANIFEST = "index:stocks";
const STOCK_META = "index:stocks-meta";
const catStockIdsKey = (catId) => `index:stocks:${catId}`;

async function readStockManifest(env) {
  return (await getJson(env.LINKS, STOCK_MANIFEST)) || { ids: [] };
}

async function readStockMeta(env) {
  return (await getJson(env.LINKS, STOCK_META)) || { items: [] };
}

async function writeStockMeta(env, items, { required = false } = {}) {
  const payload = { items: items.slice(0, 500), updatedAt: nowIso() };
  if (required) {
    try {
      await putJson(env.LINKS, STOCK_META, payload);
    } catch (err) {
      console.error("[writeStockMeta]", err);
    }
    return;
  }
  await putJsonSafe(env.LINKS, STOCK_META, payload);
}

async function upsertStockMeta(env, stock) {
  const meta = await readStockMeta(env);
  const entry = stockListEntry(stock);
  const items = [entry, ...meta.items.filter((x) => x.id !== stock.id)];
  await writeStockMeta(env, items);
}

async function removeFromStockMeta(env, id) {
  const meta = await readStockMeta(env);
  await writeStockMeta(env, meta.items.filter((x) => x.id !== id), { required: true });
}

async function registerStockInIndexes(env, stock) {
  await upsertStockMeta(env, stock);
  const m = await readStockManifest(env);
  await putJsonSafe(env.LINKS, STOCK_MANIFEST, {
    ids: [stock.id, ...m.ids.filter((x) => x !== stock.id)],
    updatedAt: nowIso(),
  });
  const cm = (await getJson(env.CATEGORIES, catStockIdsKey(stock.categoryId))) || { ids: [] };
  await putJsonSafe(env.CATEGORIES, catStockIdsKey(stock.categoryId), {
    ids: [stock.id, ...cm.ids.filter((x) => x !== stock.id)],
    updatedAt: nowIso(),
  });
}

/** Toplu stok: manifest/meta tek seferde (100 stok ≈ 300 yazma yerine ~3). */
async function registerStocksBulkIndexes(env, stocks) {
  if (!stocks?.length) return;
  const meta = await readStockMeta(env);
  let items = [...(meta.items || [])];
  for (const stock of stocks) {
    const entry = stockListEntry(stock);
    items = [entry, ...items.filter((x) => x.id !== stock.id)];
  }
  await writeStockMeta(env, items.slice(0, 500));

  const m = await readStockManifest(env);
  const newIds = stocks.map((s) => s.id);
  await putJsonSafe(env.LINKS, STOCK_MANIFEST, {
    ids: [...newIds, ...m.ids.filter((x) => !newIds.includes(x))],
    updatedAt: nowIso(),
  });

  const byCat = new Map();
  for (const s of stocks) {
    if (!byCat.has(s.categoryId)) byCat.set(s.categoryId, []);
    byCat.get(s.categoryId).push(s.id);
  }
  for (const [catId, ids] of byCat) {
    const cm = (await getJson(env.CATEGORIES, catStockIdsKey(catId))) || { ids: [] };
    await putJsonSafe(env.CATEGORIES, catStockIdsKey(catId), {
      ids: [...ids, ...cm.ids.filter((x) => !ids.includes(x))],
      updatedAt: nowIso(),
    });
  }
}

/** KV list kullanmaz — meta + her kayıt için GET (silinenler meta'dan düşer). */
export async function listStocks(env, { categoryId } = {}) {
  const meta = await readStockMeta(env);
  const out = [];

  for (const row of meta.items || []) {
    const s = await getStock(env, row.id);
    if (!s) continue;
    if (categoryId && s.categoryId !== categoryId) continue;
    out.push(stockListEntry(s));
  }

  if (!out.length) {
    const ids = new Set();
    (await readStockManifest(env)).ids.forEach((id) => ids.add(id));
    const cats = await readCategoryManifest(env);
    for (const cid of cats.ids) {
      if (categoryId && cid !== categoryId) continue;
      const cm = (await getJson(env.CATEGORIES, catStockIdsKey(cid))) || { ids: [] };
      cm.ids.forEach((id) => ids.add(id));
    }
    for (const id of ids) {
      const s = await getStock(env, id);
      if (s && (!categoryId || s.categoryId === categoryId)) out.push(stockListEntry(s));
    }
  }

  return out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/** Sadece GET — meta/manifest'teki id'leri doğrula, hayaletleri temizle (KV list yok). */
export async function syncStockMetaList(env, { categoryId } = {}) {
  const ids = new Set();
  const meta = await readStockMeta(env);
  for (const row of meta.items || []) ids.add(row.id);
  (await readStockManifest(env)).ids.forEach((id) => ids.add(id));
  const cats = await readCategoryManifest(env);
  for (const cid of cats.ids) {
    if (categoryId && cid !== categoryId) continue;
    const cm = (await getJson(env.CATEGORIES, catStockIdsKey(cid))) || { ids: [] };
    cm.ids.forEach((id) => ids.add(id));
  }

  const items = [];
  for (const id of ids) {
    const s = await getStock(env, id);
    if (s && (!categoryId || s.categoryId === categoryId)) items.push(stockListEntry(s));
  }
  items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  await writeStockMeta(env, items, { required: true });
  await putJsonSafe(env.LINKS, STOCK_MANIFEST, {
    ids: items.map((i) => i.id),
    updatedAt: nowIso(),
  });
  return items;
}

/** Admin: KV list ile meta yeniden oluştur (günlük kota varsa). Liste GET-only kalır. */
export async function deleteStocksBulk(env, ids) {
  let deleted = 0;
  for (const id of (ids || []).slice(0, 100)) {
    if (await deleteStock(env, id)) deleted++;
  }
  return deleted;
}

export async function deleteCategoriesBulk(env, ids) {
  let deleted = 0;
  for (const id of (ids || []).slice(0, 50)) {
    if (await deleteCategory(env, id)) deleted++;
  }
  return deleted;
}

export async function repairStocks(env) {
  const byId = new Map();
  const meta = await readStockMeta(env);
  for (const row of meta.items) {
    if (row?.id) byId.set(row.id, row);
  }

  const ids = new Set();
  (await readStockManifest(env)).ids.forEach((id) => ids.add(id));
  const cats = await readCategoryManifest(env);
  for (const cid of cats.ids) {
    const cm = (await getJson(env.CATEGORIES, catStockIdsKey(cid))) || { ids: [] };
    cm.ids.forEach((id) => ids.add(id));
  }

  try {
    const keys = await listKeysCapped(env.LINKS, "stock:", 300);
    for (const k of keys) {
      if (!k.name.startsWith("stock:") || k.name.includes("index:")) continue;
      const s = await getJson(env.LINKS, k.name);
      if (s?.id) ids.add(s.id);
    }
  } catch (err) {
    console.error("[repairStocks list]", err);
  }

  for (const id of ids) {
    const s = await getStock(env, id);
    if (s) byId.set(s.id, stockListEntry(s));
  }

  const items = [...byId.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  await writeStockMeta(env, items);
  await putJsonSafe(env.LINKS, STOCK_MANIFEST, { ids: items.map((s) => s.id), updatedAt: nowIso() });
  return items;
}

export async function updateStock(env, id, patch) {
  const cur = await getStock(env, id);
  if (!cur) throw new ValidationError("Stock not found");
  const next = { ...cur };
  if (patch.name !== undefined) next.name = requireString(patch.name, "name", { max: 120 });
  if (patch.productGuide !== undefined) {
    next.productGuide = optionalString(patch.productGuide, "productGuide", { max: 4000 }) || null;
  }
  if (patch.realUrl !== undefined) next.realUrl = requireUrl(patch.realUrl, "realUrl");
  if (patch.categoryId !== undefined && patch.categoryId !== cur.categoryId) {
    const newCatId = requireString(patch.categoryId, "categoryId");
    const category = await getCategory(env, newCatId);
    if (!category) throw new ValidationError("Category not found", "categoryId");
    if (cur.categoryId) await del(env.LINKS, K.stockByCategory(cur.categoryId, id));
    await env.LINKS.put(K.stockByCategory(newCatId, id), id);
    next.categoryId = newCatId;
    next.categorySlug = category.slug;
  }
  if (
    patch.accessLinkTtlValue !== undefined ||
    patch.accessLinkTtlHours !== undefined ||
    patch.accessMaxVisits !== undefined ||
    patch.productDurationValue !== undefined ||
    patch.durationDays !== undefined
  ) {
    const timing = parseStockTimingFields({ ...next, ...patch });
    next.accessLinkTtlHours = timing.accessLinkTtlHours;
    next.accessMaxVisits = timing.accessMaxVisits;
    next.productDurationDays = timing.productDurationDays;
    next.productDurationMonths = timing.productDurationMonths;
    next.durationDays = timing.productDurationDays;
  }
  if (patch.clearLeadClaim === true) {
    delete next.leadClaimedAt;
    delete next.leadClaimedCustomerId;
    delete next.leadClaimedEmail;
    delete next.leadClaimedIp;
  }
  if (patch.listPrice !== undefined) {
    const lp = parseListPrice(patch.listPrice);
    if (lp > 0) next.listPrice = lp;
    else delete next.listPrice;
  }
  if (patch.currency !== undefined) {
    const c = optionalString(patch.currency, "currency", { max: 8 });
    if (c) next.currency = c.toUpperCase();
  }
  next.updatedAt = nowIso();
  await putJson(env.LINKS, K.stock(id), next);
  await upsertStockMeta(env, next);
  return next;
}

export async function deleteStock(env, id) {
  const stock = await getStock(env, id);
  if (!stock) return false;
  await del(env.LINKS, K.stock(id));
  await del(env.LINKS, K.stockByCode(stock.code));
  await del(env.LINKS, K.stockByCategory(stock.categoryId, id));
  await removeFromStockMeta(env, id);
  const m = await readStockManifest(env);
  await putJsonSafe(env.LINKS, STOCK_MANIFEST, {
    ids: m.ids.filter((x) => x !== id),
    updatedAt: nowIso(),
  });
  const cm = (await getJson(env.CATEGORIES, catStockIdsKey(stock.categoryId))) || { ids: [] };
  await putJsonSafe(env.CATEGORIES, catStockIdsKey(stock.categoryId), {
    ids: cm.ids.filter((x) => x !== id),
    updatedAt: nowIso(),
  });
  return true;
}

/**
 * Atomic-ish counter bump for visits/leads/customers. KV doesn't have atomic
 * ops; if you need strict counting under burst load, move counters to a
 * Durable Object.
 */
export async function bumpStockCounter(env, id, field, by = 1, { updateMeta = false } = {}) {
  const cur = await getStock(env, id);
  if (!cur) return;
  cur[field] = (cur[field] || 0) + by;
  cur.updatedAt = nowIso();
  await putJson(env.LINKS, K.stock(id), cur);
  if (updateMeta) await upsertStockMeta(env, cur);
}
