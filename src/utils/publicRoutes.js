/**
 * Public /r/ yolu doğrulama — kategori slug'ı stok kodu sanılmasın; admin yolu açılmasın.
 */

import { K } from "../services/kv.js";

const CODE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const CODE_RE = new RegExp(
  `^[${CODE_ALPHABET.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]{7,10}$`,
);

export function isValidStockCode(code) {
  return Boolean(code && CODE_RE.test(code));
}

/**
 * @returns {{ code: string, urlSlug: string|null } | { error: string }}
 */
export async function parsePublicRedirectPath(env, segments) {
  if (!segments?.length) return { error: "empty" };

  if (segments.length >= 2) {
    const code = segments[segments.length - 1];
    if (!isValidStockCode(code)) return { error: "invalid_code" };
    return { code, urlSlug: segments[0] };
  }

  const only = segments[0];
  const catId = await env.CATEGORIES.get(K.categoryBySlug(only));
  if (catId) return { error: "category_only" };
  if (!isValidStockCode(only)) return { error: "invalid_code" };
  return { code: only, urlSlug: null };
}

/** Yalnızca dashboard SPA — login/kurulum sayfaları styles.css kullanır. */
export function isAdminOnlyAsset(pathname) {
  return /^\/dashboard\.js$/i.test(pathname);
}
