#!/usr/bin/env node
// Convenience script — creates all required KV namespaces in one go.
// Usage:  node scripts/create-kv.mjs           (production)
//         node scripts/create-kv.mjs --preview (preview namespaces for `wrangler dev`)
//
// Paste the printed ids into wrangler.jsonc.

import { execSync } from "node:child_process";

const NAMESPACES = [
  "LINKS",
  "CATEGORIES",
  "CUSTOMERS",
  "LEADS",
  "ANALYTICS",
  "EMAIL_QUEUE",
  "AUTOMATIONS",
  "LIFECYCLES",
  "SESSIONS",
];

const preview = process.argv.includes("--preview");
const flag = preview ? " --preview" : "";

for (const ns of NAMESPACES) {
  console.log(`\n=== Creating KV namespace: ${ns}${preview ? " (preview)" : ""} ===`);
  try {
    execSync(`npx wrangler kv namespace create ${ns}${flag}`, { stdio: "inherit" });
  } catch (e) {
    console.error(`Failed to create ${ns}:`, e.message);
  }
}
