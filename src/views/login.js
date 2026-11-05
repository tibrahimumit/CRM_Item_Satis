import { layout } from "./_layout.js";
import { escapeHtml } from "../utils/validation.js";

export function renderLogin({ appName, error, info, email, showResend, showSetupLink }) {
  const body = `
<main class="hero">
  <div class="hero__glass" style="max-width:420px">
    <div class="hero__brand"><span class="hero__dot"></span><strong>${escapeHtml(appName)}</strong></div>
    <h1 class="hero__title">Admin girişi</h1>
    <p class="hero__subtitle">Kayıtlı admin e-postanız ve şifrenizle giriş yapın.</p>
    ${info ? `<div class="result result--ok">${escapeHtml(info)}</div>` : ""}
    <form method="POST" action="/admin/login" class="form">
      <label class="form__field">
        <span>E-posta</span>
        <input name="email" type="email" autocomplete="email" required value="${escapeHtml(email || "")}" placeholder="admin@sizin-domain.com">
      </label>
      <label class="form__field">
        <span>Şifre</span>
        <input name="password" type="password" autocomplete="current-password" required placeholder="••••••••">
      </label>
      ${error ? `<div class="result result--error">${escapeHtml(error)}</div>` : ""}
      <button type="submit" class="btn btn--primary btn--lg">Giriş yap</button>
    </form>
    ${showResend && email ? `
    <form method="POST" action="/admin/resend-verify" style="margin-top:12px">
      <input type="hidden" name="email" value="${escapeHtml(email)}">
      <button type="submit" class="btn btn--ghost btn--sm">Doğrulama mailini tekrar gönder</button>
    </form>` : ""}
    <p style="margin-top:16px;text-align:center;display:flex;flex-direction:column;gap:8px">
      <a class="muted small" href="/admin/forgot">Şifremi unuttum</a>
      ${showSetupLink ? `<a class="muted small" href="/admin/setup">İlk kez mi? E-posta ile admin kaydı</a>` : ""}
      <span class="muted small">Giriş için e-posta doğrulaması gerekebilir (Resend aktifse).</span>
    </p>
  </div>
  <div class="hero__bg"></div>
</main>`;
  return layout({ title: "Giriş", body, appName, bodyClass: "page-hero" });
}
