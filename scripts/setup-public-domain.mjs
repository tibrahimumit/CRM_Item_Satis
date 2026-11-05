#!/usr/bin/env node
/**
 * Müşteri (public) worker domain'ini wrangler'da günceller.
 *
 * Örnek (yeni alt alan — önerilen):
 *   node scripts/setup-public-domain.mjs links.salediscount.online
 *
 * Sadece workers.dev (custom domain yok):
 *   node scripts/setup-public-domain.mjs --workers-dev
 *
 * Custom domain'i yalnızca Cloudflare Dashboard'dan bağlayacaksanız (wrangler routes yok):
 *   node scripts/setup-public-domain.mjs links.salediscount.online --dashboard-only
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const workersDev = args.includes("--workers-dev");
const dashboardOnly = args.includes("--dashboard-only");
const hostArg = args.find((a) => !a.startsWith("--"));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "wrangler.public.jsonc");

let text = readFileSync(configPath, "utf8");

if (workersDev) {
  const slugMatch = text.match(/crm-redirect-intelligence\.([a-z0-9-]+)\.workers\.dev/);
  const slug = slugMatch?.[1] || "salesmind";
  const publicUrl = `https://crm-redirect-intelligence.${slug}.workers.dev`;
  text = text.replace(/"PUBLIC_BASE_URL":\s*"[^"]+"/, `"PUBLIC_BASE_URL": "${publicUrl}"`);
  text = text.replace(/\n\s*"routes":\s*\[[^\]]*\],?\n?/s, "\n");
  writeFileSync(configPath, text);
  console.log("workers.dev modu:", publicUrl);
  console.log("routes kaldırıldı. Sonra: npm run deploy:public");
  console.log("Panel → Ayarlar → Müşteri linkleri =", publicUrl);
  process.exit(0);
}

if (!hostArg || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(hostArg)) {
  console.error("Kullanım: node scripts/setup-public-domain.mjs <host>");
  console.error("Örnek:  node scripts/setup-public-domain.mjs links.salediscount.online");
  console.error("        node scripts/setup-public-domain.mjs links.salediscount.online --dashboard-only");
  process.exit(1);
}

const host = hostArg.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
const zone = host.split(".").slice(-2).join(".");
const publicUrl = `https://${host}`;
const routeBlock = dashboardOnly
  ? ""
  : `\n  "routes": [{ "pattern": "${host}/*", "zone_name": "${zone}" }],`;

text = text.replace(/"PUBLIC_BASE_URL":\s*"[^"]+"/, `"PUBLIC_BASE_URL": "${publicUrl}"`);

if (dashboardOnly) {
  text = text.replace(/\n\s*"routes":\s*\[[^\]]*\],?\n?/s, "\n");
} else {
  if (/\n\s*"routes":\s*\[/.test(text)) {
    text = text.replace(/\n\s*"routes":\s*\[[^\]]*\],?/s, routeBlock);
  } else {
    text = text.replace(
      /("kv_namespaces":\s*\[[\s\S]*?\]),/,
      `$1,${routeBlock}`,
    );
  }
}

writeFileSync(configPath, text);
console.log("Güncellendi: wrangler.public.jsonc");
console.log("  PUBLIC_BASE_URL:", publicUrl);
if (dashboardOnly) {
  console.log("  routes: (yok — domain'i Dashboard → Custom Domains ile ekleyin)");
} else {
  console.log("  route:  ", `${host}/*`, "zone:", zone);
}
console.log("\nSıradaki adımlar:");
console.log("  1) Cloudflare DNS’te eski link/go kayıtlarını silin; sadece links.salediscount.online kalsın");
if (!dashboardOnly) console.log("  2) npm run deploy:public");
else console.log("  2) npm run deploy:public  (routes olmadan)");
console.log("  3) Panel → Ayarlar → Müşteri linkleri =", publicUrl);
console.log("  4) npm run verify:public");
