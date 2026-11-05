/**
 * Satış platformları (ItemSatış, G2G, …) — CATEGORIES KV içinde plat:* kayıtları.
 */

import { K, getJson, putJson, putJsonSafe, del, listKeysCapped } from "./kv.js";
import { newId, nowIso } from "../utils/helpers.js";
import { requireString, normalizeHttpUrl, ValidationError } from "../utils/validation.js";

const CATEGORY_MANIFEST = "index:categories";

async function countCategoriesForPlatform(env, platformId) {
  const m = (await getJson(env.CATEGORIES, CATEGORY_MANIFEST)) || { ids: [] };
  let n = 0;
  for (const id of m.ids) {
    const cat = await getJson(env.CATEGORIES, K.category(id));
    if (cat?.platformId === platformId) n++;
  }
  return n;
}

const PLATFORM_MANIFEST = "index:platforms";

async function readPlatformManifest(env) {
  return (await getJson(env.CATEGORIES, PLATFORM_MANIFEST)) || { ids: [] };
}

async function writePlatformManifest(env, ids) {
  await putJsonSafe(env.CATEGORIES, PLATFORM_MANIFEST, { ids: [...new Set(ids)], updatedAt: nowIso() });
}

async function registerPlatformInIndexes(env, plat) {
  const m = await readPlatformManifest(env);
  await writePlatformManifest(env, [plat.id, ...m.ids.filter((x) => x !== plat.id)]);
}

export async function getPlatform(env, id) {
  return getJson(env.CATEGORIES, K.platform(id));
}

/** Stok/kategoriye bağlı mağaza adı — müşteriden platform sormadan. */
export async function resolveStockPlatformName(env, stock) {
  if (!stock) return "";
  let platformId = stock.platformId || null;
  if (!platformId && stock.categoryId) {
    const cat = await getJson(env.CATEGORIES, K.category(stock.categoryId));
    platformId = cat?.platformId || null;
  }
  if (!platformId) return "";
  const p = await getPlatform(env, platformId);
  return String(p?.name || "").trim();
}

function normalizePlatformSlug(raw) {
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

function isPlatformActive(p) {
  return p && !p.deletedAt && !p.deleted;
}

function optionalStoreUrl(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  return normalizeHttpUrl(v, "storeUrl");
}

function parseCommissionPercent(value) {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
}

/** E-posta altı mağaza butonu — stok kategorisi veya müşteri platform adı ile eşleşir. */
export async function resolvePlatformStoreForEmail(env, { customer, stock } = {}) {
  if (stock?.categoryId) {
    const cat = await getJson(env.CATEGORIES, K.category(stock.categoryId));
    if (cat?.platformId) {
      const p = await getPlatform(env, cat.platformId);
      if (p?.storeUrl && isPlatformActive(p)) {
        return { storeUrl: p.storeUrl, storeName: p.name || "" };
      }
    }
  }

  const purchase = String(customer?.purchasePlatform || "").trim().toLowerCase();
  if (!purchase) return { storeUrl: "", storeName: "" };

  const plats = await listPlatforms(env);
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  const pNorm = norm(purchase);

  const match = plats.find((p) => {
    const n = norm(p.name);
    const slug = norm(p.slug);
    return (
      p.name.toLowerCase() === purchase ||
      p.slug === purchase.replace(/[^a-z0-9-]+/g, "-") ||
      n === pNorm ||
      slug === pNorm ||
      n.includes(pNorm) ||
      pNorm.includes(n)
    );
  });

  if (match?.storeUrl) return { storeUrl: match.storeUrl, storeName: match.name || "" };
  return { storeUrl: "", storeName: "" };
}

export async function listPlatforms(env) {
  const m = await readPlatformManifest(env);
  const out = [];
  for (const id of m.ids) {
    const p = await getPlatform(env, id);
    if (isPlatformActive(p)) out.push(p);
  }
  if (out.length) return out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const keys = await listKeysCapped(env.CATEGORIES, "plat:", 200);
  for (const k of keys) {
    const id = k.name.replace(/^plat:/, "");
    const p = await getPlatform(env, id);
    if (isPlatformActive(p)) out.push(p);
  }
  return out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function syncPlatformsFromKv(env) {
  const byId = new Map();
  const m = await readPlatformManifest(env);
  for (const id of m.ids) {
    const p = await getPlatform(env, id);
    if (p?.id) byId.set(p.id, p);
  }
  if (byId.size === 0) {
    const keys = await listKeysCapped(env.CATEGORIES, "plat:", 200);
    for (const k of keys) {
      const id = k.name.replace(/^plat:/, "");
      const p = await getPlatform(env, id);
      if (isPlatformActive(p)) byId.set(p.id, p);
    }
  }
  const platforms = [...byId.values()].filter(isPlatformActive);
  await writePlatformManifest(env, platforms.map((p) => p.id));
  return platforms;
}

/** Kayıtlı platform yoksa null — otomatik ItemSatış oluşturulmaz. */
export async function getFirstPlatformIfAny(env) {
  const list = await listPlatforms(env);
  return list[0] || null;
}

export async function createPlatform(env, input) {
  const name = requireString(input.name, "name", { max: 80 });
  const slug = normalizePlatformSlug(requireString(input.slug, "slug", { min: 2, max: 64 }));

  const existingId = await env.CATEGORIES.get(K.platformBySlug(slug));
  if (existingId) {
    const existing = await getPlatform(env, existingId);
    if (existing) {
      await registerPlatformInIndexes(env, existing);
      throw new ValidationError(`Bu slug zaten kullanılıyor: ${existing.name}`, "slug");
    }
    await del(env.CATEGORIES, K.platformBySlug(slug));
  }

  const storeUrl = optionalStoreUrl(input.storeUrl);
  const commissionPercent = parseCommissionPercent(input.commissionPercent);
  const id = newId();
  const plat = { id, name, slug, createdAt: nowIso(), updatedAt: nowIso() };
  if (storeUrl) plat.storeUrl = storeUrl;
  if (commissionPercent > 0) plat.commissionPercent = commissionPercent;
  await putJson(env.CATEGORIES, K.platform(id), plat);
  await env.CATEGORIES.put(K.platformBySlug(slug), id);
  await registerPlatformInIndexes(env, plat);
  return plat;
}

export async function updatePlatform(env, id, input = {}) {
  const plat = await getPlatform(env, id);
  if (!plat || !isPlatformActive(plat)) throw new ValidationError("Platform not found");

  if (input.name !== undefined && String(input.name).trim()) {
    plat.name = requireString(input.name, "name", { max: 80 });
  }
  if (input.storeUrl !== undefined) {
    const url = optionalStoreUrl(input.storeUrl);
    if (url) plat.storeUrl = url;
    else delete plat.storeUrl;
  }
  if (input.commissionPercent !== undefined) {
    const pct = parseCommissionPercent(input.commissionPercent);
    if (pct > 0) plat.commissionPercent = pct;
    else delete plat.commissionPercent;
  }
  plat.updatedAt = nowIso();
  await putJson(env.CATEGORIES, K.platform(id), plat);
  return plat;
}

/** @deprecated use updatePlatform */
export async function renamePlatform(env, id, name) {
  return updatePlatform(env, id, { name });
}

/**
 * KV kaydını silmez — manifest’ten düşer, soft-delete (kategori referansları bozulmaz).
 */
export async function deletePlatform(env, id, { force = false } = {}) {
  const plat = await getPlatform(env, id);
  if (!plat || plat.deletedAt) return false;

  const catCount = await countCategoriesForPlatform(env, id);
  if (catCount > 0 && !force) {
    throw new ValidationError(
      `Bu platformda ${catCount} kategori var. Önce kategorileri silin veya “yine de sil” ile zorla kaldırın.`,
      "platformId",
    );
  }

  plat.deleted = true;
  plat.deletedAt = nowIso();
  plat.updatedAt = nowIso();
  await putJson(env.CATEGORIES, K.platform(id), plat);
  try {
    await del(env.CATEGORIES, K.platformBySlug(plat.slug));
  } catch { /* slug index optional */ }

  const m = await readPlatformManifest(env);
  await writePlatformManifest(env, m.ids.filter((x) => x !== id));
  return true;
}

export async function deletePlatformsBulk(env, ids = []) {
  let deleted = 0;
  for (const id of ids.slice(0, 50)) {
    try {
      if (await deletePlatform(env, id, { force: true })) deleted++;
    } catch {
      /* kategori vb. */
    }
  }
  return deleted;
}
