#!/usr/bin/env node
/**
 * Public domain / worker sağlık kontrolü.
 * Örnek: node scripts/verify-public-domain.mjs
 *        node scripts/verify-public-domain.mjs https://links.salediscount.online
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

function readPublicUrlFromWrangler() {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "wrangler.public.jsonc");
  const m = readFileSync(path, "utf8").match(/"PUBLIC_BASE_URL":\s*"([^"]+)"/);
  return m?.[1]?.replace(/\/$/, "") || "https://links.salediscount.online";
}

const base = (process.argv[2] || readPublicUrlFromWrangler()).replace(/\/$/, "");

async function probe(label, url, expectJson) {
  try {
    const res = await fetch(url, {
      headers: expectJson ? { Accept: "application/json" } : { Accept: "text/html" },
      redirect: "follow",
    });
    const worker = res.headers.get("x-sd-worker");
    const cfRay = res.headers.get("cf-ray");
    let body = "";
    if (expectJson) {
      body = await res.text();
    } else {
      body = (await res.text()).slice(0, 80).replace(/\s+/g, " ");
    }
    const ok = res.status === 200 && (!expectJson || body.includes("crm-redirect-intelligence"));
    console.log(`${ok ? "✅" : "❌"} ${label}`);
    console.log(`   ${url}`);
    console.log(`   HTTP ${res.status}  X-SD-Worker: ${worker || "(yok)"}  cf-ray: ${cfRay || "-"}`);
    if (expectJson) console.log(`   ${body.slice(0, 120)}`);
    else if (!ok) console.log(`   body: ${body}…`);
    return ok;
  } catch (e) {
    console.log(`❌ ${label}`);
    console.log(`   ${url}`);
    console.log(`   Hata: ${e.message}`);
    return false;
  }
}

console.log("Public domain doğrulama\nBase:", base, "\n");

const host = new URL(base).hostname;
const results = await Promise.all([
  probe("health (JSON)", `${base}/health`, true),
  probe("status (HTML)", `${base}/status`, false),
  probe("workers.dev yedek", "https://crm-redirect-intelligence.salesmind.workers.dev/health", true),
]);

const allOk = results.every(Boolean);
console.log(allOk ? "\n✅ Public worker erişilebilir." : "\n⚠️  Sorun var — Cloudflare DNS ve wrangler.public.jsonc routes kontrol edin");
if (!results[0] && results[2]) {
  console.log("\n→ Custom domain bozuk; geçici olarak workers.dev + Ayarlar güncellemesi kullanın:");
  console.log("   node scripts/setup-public-domain.mjs --workers-dev");
  console.log("   npm run deploy:public");
}
process.exit(allOk ? 0 : 1);
