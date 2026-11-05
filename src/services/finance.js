/**
 * Muhasebe — satışlar lead başarısıyla kaydedilir; günlük/haftalık/aylık/yıllık özet (KV aggregate).
 * Her satış: brüt (ilan fiyatı), komisyon (mağaza kesintisi), net.
 */

import { getJson, putJsonSafe } from "./kv.js";
import { getPlatform } from "./platforms.js";
import { getStock } from "./redirects.js";
import { K } from "./kv.js";
import { listKeysCapped } from "../utils/helpers.js";

const SALE_PREFIX = "fin:sale:";
const RECENT_MANIFEST = "fin:recent";

function parseMoney(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function periodKeys(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const date = `${y}-${m}-${day}`;
  const month = `${y}-${m}`;
  const year = String(y);
  const onejan = new Date(Date.UTC(y, 0, 1));
  const week = Math.ceil(((d - onejan) / 86400000 + onejan.getUTCDay() + 1) / 7);
  const weekKey = `${y}-W${String(week).padStart(2, "0")}`;
  return { date, month, year, week: weekKey };
}

async function bumpAgg(kv, key, delta) {
  const cur = (await getJson(kv, key)) || {
    gross: 0,
    commission: 0,
    net: 0,
    count: 0,
  };
  cur.gross = Math.round((cur.gross + delta.gross) * 100) / 100;
  cur.commission = Math.round((cur.commission + delta.commission) * 100) / 100;
  cur.net = Math.round((cur.net + delta.net) * 100) / 100;
  cur.count += 1;
  cur.updatedAt = new Date().toISOString();
  await putJsonSafe(kv, key, cur);
}

async function pushRecentSale(kv, sale) {
  const m = (await getJson(kv, RECENT_MANIFEST)) || { items: [] };
  const items = [sale, ...m.items.filter((x) => x.leadId !== sale.leadId)].slice(0, 120);
  await putJsonSafe(kv, RECENT_MANIFEST, { items, updatedAt: sale.at });
}

/**
 * Lead + başarılı form sonrası bir kez çağrılır.
 */
export async function recordSaleFromLead(env, { leadId, stock, platformId, categoryId }) {
  if (!leadId || !stock) return null;
  const dedupKey = `${SALE_PREFIX}${leadId}`;
  if (await env.ANALYTICS.get(dedupKey)) return null;

  const gross = parseMoney(stock.listPrice);
  if (gross <= 0) return null;

  let commissionRate = 0;
  let platformName = "";
  const pid = platformId || stock.platformId;
  if (pid) {
    const plat = await getPlatform(env, pid);
    if (plat) {
      commissionRate = Math.min(100, Math.max(0, Number(plat.commissionPercent) || 0));
      platformName = plat.name || "";
    }
  }

  const commission = Math.round(gross * (commissionRate / 100) * 100) / 100;
  const net = Math.round((gross - commission) * 100) / 100;
  const at = new Date().toISOString();
  const periods = periodKeys(Date.now());

  const sale = {
    leadId,
    stockId: stock.id,
    stockName: stock.name,
    platformId: pid || null,
    platformName,
    categoryId: categoryId || stock.categoryId,
    gross,
    commissionRate,
    commission,
    net,
    currency: stock.currency || "TRY",
    at,
  };

  await putJsonSafe(env.ANALYTICS, dedupKey, sale, {
    expirationTtl: 400 * 86400,
  });
  await pushRecentSale(env.ANALYTICS, sale);

  const scopes = ["total", pid ? `p:${pid}` : null, stock.id ? `s:${stock.id}` : null].filter(Boolean);
  const periodList = [
    ["d", periods.date],
    ["w", periods.week],
    ["m", periods.month],
    ["y", periods.year],
  ];
  const delta = { gross, commission, net };

  for (const [pType, pVal] of periodList) {
    for (const scope of scopes) {
      await bumpAgg(env.ANALYTICS, `fin:${pType}:${pVal}:${scope}`, delta);
    }
  }

  return sale;
}

async function readAgg(kv, key) {
  return (
    (await getJson(kv, key)) || {
      gross: 0,
      commission: 0,
      net: 0,
      count: 0,
    }
  );
}

function sumAggs(rows) {
  return rows.reduce(
    (a, b) => ({
      gross: a.gross + (b.gross || 0),
      commission: a.commission + (b.commission || 0),
      net: a.net + (b.net || 0),
      count: a.count + (b.count || 0),
    }),
    { gross: 0, commission: 0, net: 0, count: 0 },
  );
}

function roundTotals(t) {
  return {
    gross: Math.round(t.gross * 100) / 100,
    commission: Math.round(t.commission * 100) / 100,
    net: Math.round(t.net * 100) / 100,
    count: t.count,
  };
}

/** Günlük seri (son N gün). */
async function dailySeries(kv, days = 14) {
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const agg = await readAgg(kv, `fin:d:${date}:total`);
    out.push({ date, ...roundTotals(agg) });
  }
  return out;
}

/** Platform kırılımı — bu ay. */
async function platformBreakdownMonth(env) {
  const month = periodKeys().month;
  const plats = await listKeysCapped(env.CATEGORIES, "plat:", 100);
  const rows = [];
  for (const k of plats) {
    const id = k.name.replace(/^plat:/, "");
    const p = await getPlatform(env, id);
    if (!p || p.deletedAt) continue;
    const agg = await readAgg(env.ANALYTICS, `fin:m:${month}:p:${id}`);
    if (agg.count > 0) {
      rows.push({
        platformId: id,
        name: p.name,
        commissionPercent: p.commissionPercent ?? 0,
        ...roundTotals(agg),
      });
    }
  }
  return rows.sort((a, b) => b.net - a.net);
}

/** Ürün kırılımı — son satışlardan. */
async function productBreakdownRecent(env) {
  const m = (await getJson(env.ANALYTICS, RECENT_MANIFEST)) || { items: [] };
  const byStock = new Map();
  for (const s of m.items) {
    const cur = byStock.get(s.stockId) || {
      stockId: s.stockId,
      stockName: s.stockName,
      platformName: s.platformName,
      gross: 0,
      commission: 0,
      net: 0,
      count: 0,
    };
    cur.gross += s.gross;
    cur.commission += s.commission;
    cur.net += s.net;
    cur.count += 1;
    byStock.set(s.stockId, cur);
  }
  return [...byStock.values()]
    .sort((a, b) => b.net - a.net)
    .slice(0, 25)
    .map((r) => ({
      ...r,
      gross: Math.round(r.gross * 100) / 100,
      commission: Math.round(r.commission * 100) / 100,
      net: Math.round(r.net * 100) / 100,
    }));
}

function parseDateParam(s) {
  const v = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function dayBoundsUtc(dateStr) {
  return {
    start: new Date(`${dateStr}T00:00:00.000Z`).getTime(),
    end: new Date(`${dateStr}T23:59:59.999Z`).getTime(),
  };
}

function enumerateDates(fromStr, toStr) {
  const out = [];
  const cur = new Date(`${fromStr}T12:00:00.000Z`);
  const end = new Date(`${toStr}T12:00:00.000Z`);
  while (cur <= end && out.length < 366) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function loadSalesInRange(env, fromStr, toStr) {
  const { start, end } = dayBoundsUtc(fromStr);
  const { end: endTo } = dayBoundsUtc(toStr);
  const seen = new Set();
  const sales = [];

  const add = (s) => {
    if (!s?.at || seen.has(s.leadId)) return;
    const t = new Date(s.at).getTime();
    if (t < start || t > endTo) return;
    seen.add(s.leadId);
    sales.push(s);
  };

  const keys = await listKeysCapped(env.ANALYTICS, SALE_PREFIX, 400);
  for (const k of keys) {
    const s = await getJson(env.ANALYTICS, k.name);
    add(s);
  }
  const m = (await getJson(env.ANALYTICS, RECENT_MANIFEST)) || { items: [] };
  for (const s of m.items) add(s);

  return sales.sort((a, b) => new Date(b.at) - new Date(a.at));
}

function totalsFromSales(sales) {
  return roundTotals(
    sales.reduce(
      (a, s) => ({
        gross: a.gross + (s.gross || 0),
        commission: a.commission + (s.commission || 0),
        net: a.net + (s.net || 0),
        count: a.count + 1,
      }),
      { gross: 0, commission: 0, net: 0, count: 0 },
    ),
  );
}

function breakdownByPlatform(sales) {
  const map = new Map();
  for (const s of sales) {
    const id = s.platformId || "_none";
    const cur = map.get(id) || {
      platformId: s.platformId,
      name: s.platformName || "—",
      commissionPercent: s.commissionRate ?? 0,
      gross: 0,
      commission: 0,
      net: 0,
      count: 0,
    };
    cur.gross += s.gross || 0;
    cur.commission += s.commission || 0;
    cur.net += s.net || 0;
    cur.count += 1;
    map.set(id, cur);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      gross: Math.round(r.gross * 100) / 100,
      commission: Math.round(r.commission * 100) / 100,
      net: Math.round(r.net * 100) / 100,
    }))
    .sort((a, b) => b.net - a.net);
}

function breakdownByProduct(sales) {
  const map = new Map();
  for (const s of sales) {
    const cur = map.get(s.stockId) || {
      stockId: s.stockId,
      stockName: s.stockName,
      platformName: s.platformName,
      gross: 0,
      commission: 0,
      net: 0,
      count: 0,
    };
    cur.gross += s.gross || 0;
    cur.commission += s.commission || 0;
    cur.net += s.net || 0;
    cur.count += 1;
    map.set(s.stockId, cur);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      gross: Math.round(r.gross * 100) / 100,
      commission: Math.round(r.commission * 100) / 100,
      net: Math.round(r.net * 100) / 100,
    }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 25);
}

function seriesFromSales(sales, fromStr, toStr) {
  const days = enumerateDates(fromStr, toStr);
  const byDay = new Map(days.map((d) => [d, { gross: 0, commission: 0, net: 0, count: 0 }]));
  for (const s of sales) {
    const d = s.at.slice(0, 10);
    if (!byDay.has(d)) continue;
    const row = byDay.get(d);
    row.gross += s.gross || 0;
    row.commission += s.commission || 0;
    row.net += s.net || 0;
    row.count += 1;
  }
  return days.map((date) => {
    const row = byDay.get(date);
    return { date, ...roundTotals(row) };
  });
}

export async function getFinanceDashboard(env, { period = "month", from, to } = {}) {
  const fromStr = parseDateParam(from);
  const toStr = parseDateParam(to);
  if (fromStr && toStr && fromStr <= toStr) {
    const sales = await loadSalesInRange(env, fromStr, toStr);
    const current = totalsFromSales(sales);
    const series = seriesFromSales(sales, fromStr, toStr);
    const slice = series.length > 31 ? series.slice(-31) : series;
    return {
      period: "custom",
      from: fromStr,
      to: toStr,
      currency: "TRY",
      current,
      periods: { day: current, week: current, month: current, year: current },
      avgOrderValue: current.count ? Math.round((current.gross / current.count) * 100) / 100 : 0,
      effectiveCommissionRate:
        current.gross > 0 ? Math.round((current.commission / current.gross) * 1000) / 10 : 0,
      series14: slice,
      byPlatform: breakdownByPlatform(sales),
      byProduct: breakdownByProduct(sales),
      recent: sales.slice(0, 40),
    };
  }

  const periods = periodKeys();
  const keyMap = {
    day: `fin:d:${periods.date}:total`,
    week: `fin:w:${periods.week}:total`,
    month: `fin:m:${periods.month}:total`,
    year: `fin:y:${periods.year}:total`,
  };
  const current = roundTotals(await readAgg(env.ANALYTICS, keyMap[period] || keyMap.month));

  const [day, week, month, year] = await Promise.all([
    readAgg(env.ANALYTICS, keyMap.day),
    readAgg(env.ANALYTICS, keyMap.week),
    readAgg(env.ANALYTICS, keyMap.month),
    readAgg(env.ANALYTICS, keyMap.year),
  ]);

  const recent = ((await getJson(env.ANALYTICS, RECENT_MANIFEST)) || { items: [] }).items.slice(0, 40);
  const series14 = await dailySeries(env.ANALYTICS, 14);
  const byPlatform = await platformBreakdownMonth(env);
  const byProduct = await productBreakdownRecent(env);

  const avgOrder = current.count ? roundTotals({ ...current, gross: current.gross / current.count }) : null;

  return {
    period,
    currency: "TRY",
    current,
    periods: {
      day: roundTotals(day),
      week: roundTotals(week),
      month: roundTotals(month),
      year: roundTotals(year),
    },
    avgOrderValue: avgOrder ? avgOrder.gross : 0,
    effectiveCommissionRate:
      current.gross > 0 ? Math.round((current.commission / current.gross) * 1000) / 10 : 0,
    series14,
    byPlatform,
    byProduct,
    recent,
  };
}

/** Tüm muhasebe KV kayıtlarını siler (fin:*). Geri alınamaz. */
export async function resetAllFinanceStats(env, { maxDeletes = 4000 } = {}) {
  const keys = await listKeysCapped(env.ANALYTICS, "fin:", maxDeletes);
  for (const k of keys) {
    await env.ANALYTICS.delete(k.name);
  }
  return { deleted: keys.length, truncated: keys.length >= maxDeletes };
}
