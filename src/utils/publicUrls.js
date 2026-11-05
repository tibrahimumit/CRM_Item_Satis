/**
 * Public stok linki (/r/…) ve mail erişim linki (/access/…) — kategori slug dahil.
 */

import { getCategory } from "../services/redirects.js";
import { getPublicBaseUrl } from "../services/settings.js";

export async function resolveCategorySlug(env, stock) {
  if (stock?.categorySlug) return stock.categorySlug;
  if (!stock?.categoryId) return null;
  const cat = await getCategory(env, stock.categoryId);
  return cat?.slug || null;
}

/** Yol: /r/netflix/RuV3eycV veya eski /r/RuV3eycV */
export function buildPublicStockPath(code, categorySlug) {
  const c = String(code || "").trim();
  if (!c) return "/r/";
  const slug = String(categorySlug || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  if (slug) return `/r/${slug}/${c}`;
  return `/r/${c}`;
}

export function buildPublicStockUrl(baseUrl, code, categorySlug) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  return `${base}${buildPublicStockPath(code, categorySlug)}`;
}

export function buildAccessUrl(baseUrl, token) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  return `${base}/access/${token}`;
}

export async function resolveStockPublicLink(env, stock) {
  const categorySlug = await resolveCategorySlug(env, stock);
  const base = await getPublicBaseUrl(env);
  return {
    categorySlug,
    categoryName: stock?.categoryName || null,
    publicPath: buildPublicStockPath(stock?.code, categorySlug),
    publicUrl: buildPublicStockUrl(base, stock?.code, categorySlug),
    accessPathPrefix: "/access/",
    accessNote:
      "Form sonrası her müşteriye mailde benzersiz /access/… linki gider; public /r/ linkinden farklıdır.",
  };
}
