#!/usr/bin/env node

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "scripts", "desktop"];
const sourceFiles = [];

function collectJavaScript(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist") {
        collectJavaScript(join(directory, entry.name));
      }
    } else if (/\.(?:cjs|js|mjs)$/.test(entry.name)) {
      sourceFiles.push(join(directory, entry.name));
    }
  }
}

for (const root of roots) collectJavaScript(root);

for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax OK: ${sourceFiles.length} JavaScript files`);
