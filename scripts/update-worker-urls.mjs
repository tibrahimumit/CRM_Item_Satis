#!/usr/bin/env node
/**
 * workers.dev hesap alt alanını değiştirdikten sonra wrangler URL'lerini günceller.
 *
 * Örnek: node scripts/update-worker-urls.mjs itemsatis
 * Sonuç:
 *   https://crm-redirect-intelligence.itemsatis.workers.dev
 *   https://crm-admin-intelligence.itemsatis.workers.dev
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const slug = process.argv[2]?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
if (!slug || slug.length < 2) {
  console.error("Kullanım: node scripts/update-worker-urls.mjs <yeni-alt-alan>");
  console.error("Örnek: node scripts/update-worker-urls.mjs itemsatis");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicUrl = `https://crm-redirect-intelligence.${slug}.workers.dev`;
const adminUrl = `https://crm-admin-intelligence.${slug}.workers.dev`;

for (const file of ["wrangler.jsonc", "wrangler.public.jsonc"]) {
  const path = join(root, file);
  let text = readFileSync(path, "utf8");
  text = text.replace(
    /"PUBLIC_BASE_URL":\s*"https:\/\/[^"]+"/,
    `"PUBLIC_BASE_URL": "${publicUrl}"`,
  );
  if (file === "wrangler.jsonc") {
    text = text.replace(
      /"ADMIN_BASE_URL":\s*"https:\/\/[^"]+"/,
      `"ADMIN_BASE_URL": "${adminUrl}"`,
    );
  }
  writeFileSync(path, text);
  console.log("Güncellendi:", file);
}

console.log("\nYeni adresler:");
console.log("  Müşteri:", publicUrl);
console.log("  Admin:  ", adminUrl);
console.log("\n1) Cloudflare’de alt alanı bu isimle ayarladığınızdan emin olun.");
console.log("2) npm run deploy");
console.log("3) Panel → Ayarlar → Public link kökü + Admin panel adresi");
