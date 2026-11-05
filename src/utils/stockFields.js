/**
 * Stock field parsing: separates e-posta erişim linki TTL from ürün/kampanya süresi.
 */

import { requirePositiveInt, ValidationError } from "./validation.js";

/** @returns {number|null} product length in days for campaign emails */
export function getProductDurationDays(stock) {
  if (!stock) return null;
  if (stock.productDurationDays != null) return stock.productDurationDays;
  if (stock.productDurationMonths != null) return stock.productDurationMonths * 30;
  if (stock.durationDays != null) return stock.durationDays; // legacy
  return null;
}

/** @returns {number} hours until /access/:token expires */
export function getAccessLinkTtlHours(stock, env) {
  if (stock?.accessLinkTtlHours != null) return stock.accessLinkTtlHours;
  if (stock?.accessLinkTtlDays != null) return stock.accessLinkTtlDays * 24;
  const fallbackSec = Number(env?.ACCESS_TOKEN_TTL_SECONDS || 172800);
  return Math.max(1, Math.ceil(fallbackSec / 3600));
}

export function formatAccessLinkExpiry(stock, env) {
  const h = getAccessLinkTtlHours(stock, env);
  if (h < 24) return `${h} saat`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 gün" : `${d} gün`;
}

export function formatProductDuration(stock) {
  const days = getProductDurationDays(stock);
  if (!days) return "süresiz";
  if (stock?.productDurationMonths) {
    return `${stock.productDurationMonths} ay`;
  }
  if (days >= 365 && days % 365 === 0) return `${days / 365} yıl`;
  if (days % 30 === 0 && days >= 30) return `${days / 30} ay`;
  return `${days} gün`;
}

/** Parse admin form / API body into normalized stock timing fields. */
export function parseStockTimingFields(input) {
  const out = {};

  // ─── E-posta erişim linki (/access/:token) ───────────────────────────────
  const ttlVal = input.accessLinkTtlValue ?? input.accessLinkTtlHours ?? input.accessLinkTtlDays;
  const ttlUnit = (input.accessLinkTtlUnit || "hours").toLowerCase();
  if (ttlVal === undefined || ttlVal === null || ttlVal === "") {
    out.accessLinkTtlHours = 48;
  } else {
    const n = Number(ttlVal);
    if (!Number.isFinite(n) || n < 1) throw new ValidationError("Erişim linki süresi geçersiz", "accessLinkTtlValue");
    if (ttlUnit === "days" || ttlUnit === "gün" || ttlUnit === "gun") {
      out.accessLinkTtlHours = Math.min(8760, Math.round(n * 24));
    } else {
      out.accessLinkTtlHours = Math.min(8760, Math.round(n));
    }
  }

  const maxAccess = input.accessMaxVisits ?? input.maxVisits;
  out.accessMaxVisits =
    maxAccess === undefined || maxAccess === null || maxAccess === ""
      ? null
      : requirePositiveInt(maxAccess, "accessMaxVisits", { max: 1_000_000 });

  // ─── Ürün / kampanya (lifecycle mailleri) ──────────────────────────────────
  const prodVal = input.productDurationValue ?? input.durationDays ?? input.productDurationDays;
  const prodUnit = (input.productDurationUnit || "days").toLowerCase();
  if (prodVal === undefined || prodVal === null || prodVal === "") {
    out.productDurationDays = null;
    out.productDurationMonths = null;
  } else {
    const n = requirePositiveInt(prodVal, "productDurationValue", { max: 120 });
    if (prodUnit === "months" || prodUnit === "ay") {
      out.productDurationMonths = n;
      out.productDurationDays = n * 30;
    } else {
      out.productDurationDays = n;
      out.productDurationMonths = null;
    }
  }

  return out;
}
