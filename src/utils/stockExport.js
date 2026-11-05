/**
 * Stok linklerini panelden dışa aktarma (TXT / CSV / TSV).
 */

import { isStockLeadClaimed } from "../services/redirects.js";

const MAX_LINE_LEN = 200;
const FORMATS = new Set(["txt", "csv", "tsv"]);

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function collectExportRows(stocks, { onlyUnused = false } = {}) {
  const rows = [];
  const seen = new Set();
  const skipped = [];

  for (const stock of stocks || []) {
    const url = String(stock?.publicUrl || "").trim();
    if (!url) {
      skipped.push({ id: stock?.id, reason: "no_url" });
      continue;
    }
    if (onlyUnused && isStockLeadClaimed(stock)) {
      skipped.push({ id: stock?.id, name: stock?.name, reason: "used" });
      continue;
    }
    if (url.length > MAX_LINE_LEN) {
      skipped.push({ id: stock?.id, name: stock?.name, reason: "too_long", length: url.length });
      continue;
    }
    if (seen.has(url)) {
      skipped.push({ id: stock?.id, reason: "duplicate" });
      continue;
    }
    seen.add(url);
    rows.push({
      url,
      name: stock?.name || "",
      code: stock?.code || "",
      categorySlug: stock?.categorySlug || "",
    });
  }

  return { rows, skipped };
}

export function buildStockExport(stocks, { onlyUnused = false, format = "txt" } = {}) {
  const fmt = FORMATS.has(format) ? format : "txt";
  const { rows, skipped } = collectExportRows(stocks, { onlyUnused });
  const slug = stocks[0]?.categorySlug || "stok";
  const base = `stok-linkleri-${slug}-${rows.length}`;

  let content = "";
  let filename = `${base}.txt`;

  if (fmt === "csv") {
    const header = "url,name,code,category";
    const lines = rows.map(
      (r) => `${csvCell(r.url)},${csvCell(r.name)},${csvCell(r.code)},${csvCell(r.categorySlug)}`,
    );
    content = `${header}\n${lines.join("\n")}\n`;
    filename = `${base}.csv`;
  } else if (fmt === "tsv") {
    content = rows.map((r) => `${r.name}\t${r.url}`).join("\n");
    if (content) content += "\n";
    filename = `${base}.tsv`;
  } else {
    content = rows.map((r) => r.url).join("\n");
    if (content) content += "\n";
    filename = `${base}.txt`;
  }

  return {
    content,
    count: rows.length,
    filename,
    skipped,
    format: fmt,
  };
}

/** @deprecated use buildStockExport */
export const buildItemSatisExport = buildStockExport;

export const STOCK_EXPORT_FORMATS = [
  { id: "txt", label: "TXT — her satır bir link" },
  { id: "csv", label: "CSV — url, ad, kod, kategori" },
  { id: "tsv", label: "TSV — ad + link (sekme)" },
];
