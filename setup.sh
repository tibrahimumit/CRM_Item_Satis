#!/usr/bin/env bash
# Run from anywhere: bash "/path/to/CRM Item-Satis/setup.sh"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "→ Project: $ROOT"
echo "→ Installing dependencies…"
npm install

if [[ ! -f .dev.vars ]]; then
  cp .dev.vars.example .dev.vars
  if command -v openssl >/dev/null 2>&1; then
    PEPPER=$(openssl rand -hex 32)
    sed -i '' "s/change-me-too/$PEPPER/" .dev.vars
    echo "→ Created .dev.vars with a random HASH_PEPPER"
    echo "→ Create your local admin account at http://localhost:8787/admin/setup"
  else
    echo "→ Created .dev.vars — replace HASH_PEPPER manually before use"
  fi
else
  echo "→ .dev.vars already exists (skipped)"
fi

echo ""
echo "Local dev works with simulated KV (REPLACE_ME ids are OK for now)."
echo ""
echo "Next steps:"
echo "  1. Start dev server:"
echo "       cd \"$ROOT\" && npm run dev"
echo "  2. Open: http://localhost:8787/admin"
echo "  3. (Optional, for production KV) log in to Cloudflare and run:"
echo "       cd \"$ROOT\" && npm run kv:create"
echo "     Then paste namespace ids into wrangler.jsonc"
