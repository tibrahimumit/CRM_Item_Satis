/**
 * Shared HTML shell. All views compose this so we don't duplicate <head>.
 */

import { escapeHtml } from "../utils/validation.js";

export function layout({ title, body, head = "", appName = "Redirect Intelligence", bodyClass = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(appName)}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛰️</text></svg>">
<link rel="preload" href="/styles.css?v=21" as="style">
<link rel="stylesheet" href="/styles.css?v=21">
<style>
  /* Önbellekte kırık CSS kalırsa bile ortalanmış koyu kart */
  html,body{margin:0;min-height:100vh}
  body.page-hero{
    display:flex;align-items:center;justify-content:center;
    background:#0b1020;color:#e6e9f5;
    font-family:Inter,system-ui,sans-serif;
  }
  .hero{width:100%;min-height:100vh;display:grid;place-items:center;padding:32px 20px;position:relative}
  .hero__glass{
    position:relative;z-index:1;width:min(560px,calc(100% - 32px));
    padding:36px;border-radius:24px;
    background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
    box-shadow:0 10px 30px rgba(0,0,0,.35);
  }
</style>
${head}
</head>
<body class="${escapeHtml(bodyClass)}">
${body}
</body>
</html>`;
}
