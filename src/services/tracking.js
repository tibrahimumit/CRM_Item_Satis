/**
 * Visitor fingerprint — Cloudflare `request.cf`, headers, UA parsing.
 */

import { nowIso, newId, pad } from "../utils/helpers.js";
import { K, putJson, isKvQuotaError } from "./kv.js";

const VISIT_FIELDS = [
  "ip",
  "country",
  "city",
  "region",
  "continent",
  "timezone",
  "colo",
  "asn",
  "asOrganization",
  "language",
  "userAgent",
  "referer",
  "device",
  "browser",
  "os",
  "osVersion",
  "vpnLikely",
  "tlsVersion",
  "httpProtocol",
  "latitude",
  "longitude",
  "postalCode",
  "isEUCountry",
];

/** Snapshot the request into an analytics / CRM context object. */
export function buildVisitContext(request) {
  const cf = request.cf || {};
  const headers = request.headers;
  const ua = headers.get("user-agent") || "";
  const { os, osVersion } = detectOS(ua);
  const asn = cf.asn ?? null;
  const asOrganization = cf.asOrganization || null;

  return {
    ip: headers.get("CF-Connecting-IP") || null,
    country: cf.country || null,
    city: cf.city || null,
    region: cf.region || null,
    continent: cf.continent || null,
    timezone: cf.timezone || null,
    colo: cf.colo || null,
    asn,
    asOrganization,
    language: (headers.get("accept-language") || "").split(",")[0] || null,
    userAgent: ua || null,
    referer: headers.get("referer") || null,
    device: detectDevice(ua),
    browser: detectBrowser(ua),
    os,
    osVersion,
    vpnLikely: detectVpnLikely(asn, asOrganization),
    tlsVersion: cf.tlsVersion || null,
    httpProtocol: cf.httpProtocol || null,
    latitude: cf.latitude ?? null,
    longitude: cf.longitude ?? null,
    postalCode: cf.postalCode || null,
    isEUCountry: cf.isEUCountry ?? null,
    timestamp: nowIso(),
  };
}

/** Copy latest visit intel onto a customer record. */
export function applyVisitContext(customer, ctx) {
  if (!ctx || !customer) return customer;
  for (const key of VISIT_FIELDS) {
    if (ctx[key] != null && ctx[key] !== "") customer[key] = ctx[key];
  }
  customer.lastContextAt = ctx.timestamp || nowIso();
  return customer;
}

export function detectDevice(ua) {
  if (/bot|crawl|spider/i.test(ua)) return "bot";
  if (/iPhone|iPad|iPod/i.test(ua)) return /iPad/i.test(ua) ? "tablet" : "mobile";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "mobile" : "tablet";
  if (/Mobi/i.test(ua)) return "mobile";
  if (/Tablet/i.test(ua)) return "tablet";
  return "desktop";
}

export function detectBrowser(ua) {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR|Opera/i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  return "Unknown";
}

/** macOS, Windows, Linux, iOS, Android, Chrome OS, … */
export function detectOS(ua) {
  if (/Windows NT 10/i.test(ua)) return { os: "Windows", osVersion: "10/11" };
  if (/Windows NT 6\.3/i.test(ua)) return { os: "Windows", osVersion: "8.1" };
  if (/Windows NT 6/i.test(ua)) return { os: "Windows", osVersion: "7/8" };
  if (/Windows/i.test(ua)) return { os: "Windows", osVersion: "" };
  if (/Mac OS X ([\d_]+)/i.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/i);
    return { os: "macOS", osVersion: (m?.[1] || "").replace(/_/g, ".") };
  }
  if (/iPhone OS ([\d_]+)/i.test(ua)) {
    const m = ua.match(/iPhone OS ([\d_]+)/i);
    return { os: "iOS", osVersion: (m?.[1] || "").replace(/_/g, ".") };
  }
  if (/iPad.*OS ([\d_]+)/i.test(ua)) return { os: "iPadOS", osVersion: "" };
  if (/Android ([\d.]+)/i.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/i);
    return { os: "Android", osVersion: m?.[1] || "" };
  }
  if (/CrOS/i.test(ua)) return { os: "Chrome OS", osVersion: "" };
  if (/Linux/i.test(ua)) return { os: "Linux", osVersion: "" };
  return { os: "Unknown", osVersion: "" };
}

/**
 * VPN / proxy tahmini (Cloudflare doğrudan "VPN" demez; ASN + org heuristiği).
 * @returns {"yes"|"maybe"|"no"|"unknown"}
 */
export function detectVpnLikely(asn, asOrganization = "") {
  const org = String(asOrganization || "").toLowerCase();
  if (!org && !asn) return "unknown";

  const strongVpn =
    /vpn|nordvpn|expressvpn|surfshark|proton\s*vpn|cyberghost|private\s*internet|mullvad|windscribe|tunnelbear|hotspot\s*shield|vyprvpn|ipvanish|purevpn|hide\.me|tor\s*exit|wireguard|openvpn|psiphon|outline\s*vpn/i;
  const hostingProxy =
    /hosting|datacenter|data\s*center|cloud\s*services|digitalocean|amazon|aws|google\s*cloud|microsoft\s*azure|hetzner|ovh|linode|vultr|m247|datacamp|hostinger|contabo|leaseweb|choopa|psychz|packet\s*hub|quadranet|tzulo|netprotect|cdn|proxy/i;

  if (strongVpn.test(org)) return "yes";
  if (hostingProxy.test(org)) return "maybe";
  return org ? "no" : "unknown";
}

export function formatVpnLabel(vpnLikely) {
  if (vpnLikely === "yes") return "VPN / proxy (yüksek)";
  if (vpnLikely === "maybe") return "VPN olabilir (datacenter)";
  if (vpnLikely === "no") return "Normal bağlantı";
  return "—";
}

/** Ziyaret: tam event kaydı yok — yalnızca günlük sayaç (KV kotası). */
async function recordVisitLight(env, extra = {}) {
  const ts = Date.now();
  const date = new Date(ts).toISOString().slice(0, 10);
  await Promise.all([
    bumpCounterSafe(env.ANALYTICS, K.aggDaily(date, "type:visit")),
    extra.stockId ? bumpCounterSafe(env.ANALYTICS, K.aggDaily(date, `stock:${extra.stockId}`)) : null,
    extra.categoryId ? bumpCounterSafe(env.ANALYTICS, K.aggDaily(date, `cat:${extra.categoryId}`)) : null,
  ].filter(Boolean));
  return { type: "visit", ts, iso: new Date(ts).toISOString(), ...extra, light: true };
}

export async function recordEvent(env, type, extra = {}) {
  if (type === "visit") return recordVisitLight(env, extra);

  const ts = Date.now();
  const id = newId();
  const event = { id, type, ts, iso: new Date(ts).toISOString(), ...extra };

  const key = K.event(pad(ts), id);
  try {
    await putJson(env.ANALYTICS, key, event, {
      expirationTtl: Number(env.ANALYTICS_RETENTION_DAYS || 90) * 86400,
    });
  } catch (err) {
    if (!isKvQuotaError(err)) throw err;
    console.error("[recordEvent] quota, counters only", type);
  }

  const date = new Date(ts).toISOString().slice(0, 10);
  await Promise.all([
    bumpCounterSafe(env.ANALYTICS, K.aggDaily(date, `type:${type}`)),
    extra.stockId ? bumpCounterSafe(env.ANALYTICS, K.aggDaily(date, `stock:${extra.stockId}`)) : null,
    extra.categoryId ? bumpCounterSafe(env.ANALYTICS, K.aggDaily(date, `cat:${extra.categoryId}`)) : null,
  ].filter(Boolean));

  return event;
}

async function bumpCounterSafe(kv, key) {
  try {
    const cur = Number((await kv.get(key)) || 0);
    await kv.put(key, String(cur + 1));
    return true;
  } catch (err) {
    console.error("[bumpCounter]", key, err?.message || err);
    return false;
  }
}
