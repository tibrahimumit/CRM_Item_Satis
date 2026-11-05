import { escapeHtml } from "../utils/validation.js";

/** Tarayıcıda kalmış eski 403 yanıtını temizlemek için yardım sayfası. */
export function renderCacheHelp({ appName, host }) {
  const ts = Date.now();
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bağlantı yardımı · ${escapeHtml(appName)}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;line-height:1.6}
  .card{max-width:520px;margin:0 auto;background:rgba(30,41,59,.9);border:1px solid #334155;border-radius:16px;padding:24px}
  h1{font-size:20px;margin:0 0 12px}
  a{color:#93c5fd}
  .ok{color:#86efac}
  .btn{display:inline-block;margin-top:12px;padding:10px 16px;background:#6366f1;color:#fff;text-decoration:none;border-radius:10px;font-weight:600}
  code{background:#1e293b;padding:2px 6px;border-radius:4px;font-size:13px}
</style>
</head>
<body>
<div class="card">
  <h1>✅ Worker çalışıyor</h1>
  <p class="ok">Bu sayfayı görüyorsanız <strong>${escapeHtml(host)}</strong> doğru worker'a bağlı.</p>
  <p>Eski <strong>403</strong> hatası genelde tarayıcı önbelleğinden gelir. Maildeki <code>link.</code> veya <code>go.</code> adresleri otomatik <strong>links.</strong> adresine yönlendirilir.</p>
  <ol>
    <li>Aşağıdaki <strong>Önbelleği temizle</strong> butonuna tıklayın (bu sekme için cache silinir).</li>
    <li>Stok linkinizi tekrar açın.</li>
    <li>Hâlâ 403 ise Cloudflare → <strong>Caching → Purge Everything</strong>.</li>
  </ol>
  <p><a class="btn" href="/health">Durum kontrolü (JSON)</a></p>
  <p><a class="btn" href="/r/test?_nc=${ts}" style="background:#334155;margin-left:8px">Test linki</a></p>
  <p class="muted" style="font-size:13px;margin-top:20px">Geçici alternatif:<br>
  <code>https://crm-redirect-intelligence.salesmind.workers.dev/r/KOD</code></p>
</div>
</body>
</html>`;
}
