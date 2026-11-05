/**
 * Read-side analytics helpers. Writes are in `tracking.js`.
 *
 * For high-cardinality reporting (per-day, per-stock heatmaps, geographic
 * splits) you'll want to ship events into Workers Analytics Engine or D1
 * eventually — these helpers keep the same shape so the API is stable.
 */

import { listKeysCapped } from "../utils/helpers.js";
import { getJson } from "./kv.js";
import { resolveEmailDriver, isEmailLive } from "../utils/emailDriver.js";
import { listPlatforms } from "./platforms.js";

const STOCK_META = "index:stocks-meta";
const STOCK_MANIFEST = "index:stocks";

const EVENT_PREFIX = "evt:";

/** Walk the events keyspace newest-first, hydrating up to `limit` records. */
export async function listEvents(env, { limit = 100, filter } = {}) {
  const keys = await listKeysCapped(env.ANALYTICS, EVENT_PREFIX, 500);
  keys.sort((a, b) => (a.name < b.name ? 1 : -1)); // newest first (epoch-padded keys)

  const out = [];
  for (const k of keys) {
    if (out.length >= limit) break;
    const v = await env.ANALYTICS.get(k.name, "json");
    if (!v) continue;
    if (filter && !filter(v)) continue;
    out.push(v);
  }
  return out;
}

export async function getDailyCounter(env, date, scope) {
  const raw = await env.ANALYTICS.get(`agg:${date}:${scope}`);
  return Number(raw || 0);
}

export async function dailySeries(env, scope, days = 14) {
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    out.push({ date, value: await getDailyCounter(env, date, scope) });
  }
  return out;
}

async function countStocksForOverview(env) {
  const meta = (await getJson(env.LINKS, STOCK_META)) || { items: [] };
  if (meta.items?.length) return meta.items.length;
  const manifest = (await getJson(env.LINKS, STOCK_MANIFEST)) || { ids: [] };
  if (manifest.ids?.length) return manifest.ids.length;
  const keys = await listKeysCapped(env.LINKS, "stock:", 500);
  return keys.filter((k) => k.name.startsWith("stock:") && !k.name.includes("index:")).length;
}

/** Aggregated dashboard rollup — GET ağırlıklı (KV yazma yok). */
export async function dashboardOverview(env) {
  const [totalLinks, catKeys, activePlatforms, custKeys, leadKeys, queueDetail] = await Promise.all([
    countStocksForOverview(env),
    listKeysCapped(env.CATEGORIES, "cat:", 200),
    listPlatforms(env).catch(() => []),
    listKeysCapped(env.CUSTOMERS, "cust:", 500),
    listKeysCapped(env.LEADS, "lead:", 500),
    import("./communications.js").then((m) => m.listEmailQueueDetailed(env, { limit: 200 })),
  ]);

  let activeLicenses = 0;
  let expiringSoon = 0;
  const custSample = custKeys.slice(0, 80);
  await Promise.all(
    custSample.map(async (k) => {
      try {
        const c = await env.CUSTOMERS.get(k.name, "json");
        if (c?.lifecycleStage === "active") activeLicenses++;
        if (c?.lifecycleStage === "expiring") expiringSoon++;
      } catch { /* skip */ }
    }),
  );

  return {
    totalLinks,
    totalCategories: catKeys.length,
    totalPlatforms: activePlatforms.length,
    totalCustomers: custKeys.length,
    totalLeads: leadKeys.length,
    activeLicenses,
    expiringSoon,
    queueDepth: queueDetail.size,
    queueKeyCount: queueDetail.keyCount,
    queueOrphans: queueDetail.orphanKeys?.length || 0,
    emailDriver: resolveEmailDriver(env),
    emailLive: isEmailLive(env),
    partial: custKeys.length >= 500,
  };
}
