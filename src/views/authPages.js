import { layout } from "./_layout.js";
import { escapeHtml } from "../utils/validation.js";

export function renderVerifyPending({ email, devLink, appName }) {
  const body = `
<main class="hero">
  <div class="hero__glass" style="max-width:480px">
    <h1 class="hero__title">E-postanı doğrula 📬</h1>
    <p class="hero__subtitle"><strong>${escapeHtml(email)}</strong> adresine doğrulama linki gönderdik. Gelen kutusu ve spam klasörünü kontrol et.</p>
    ${devLink ? `<p class="form__hint" style="word-break:break-all">Resend yok — test linki:<br><a href="${escapeHtml(devLink)}">${escapeHtml(devLink)}</a></p>` : ""}
    <p style="margin-top:20px"><a class="btn btn--primary" href="/admin/login">Giriş sayfası</a></p>
  </div>
  <div class="hero__bg"></div>
</main>`;
  return layout({ title: "Doğrulama", body, appName, bodyClass: "page-hero" });
}

export function renderVerifyResult({ ok, appName }) {
  const body = `
<main class="hero">
  <div class="hero__glass" style="max-width:420px;text-align:center">
    ${ok
      ? `<h1 class="hero__title">✅ Doğrulandı!</h1><p>Artık giriş yapabilirsin.</p><a class="btn btn--primary btn--lg" href="/admin/login">Giriş yap</a>`
      : `<h1 class="hero__title">Link geçersiz</h1><p class="muted">Süresi dolmuş veya hatalı. Yeniden kayıt veya destek.</p><a class="btn btn--ghost" href="/admin/login">Giriş</a>`}
  </div>
  <div class="hero__bg"></div>
</main>`;
  return layout({ title: "Doğrulama", body, appName, bodyClass: "page-hero" });
}

export function renderForgotPassword({ appName, error, sent }) {
  const body = `
<main class="hero">
  <div class="hero__glass" style="max-width:420px">
    <h1 class="hero__title">Şifremi unuttum</h1>
    ${sent
      ? `<p class="result result--ok">E-posta kayıtlıysa sıfırlama linki gönderildi.</p>`
      : `<form method="POST" action="/admin/forgot" class="form">
      <label class="form__field"><span>E-posta</span>
        <input name="email" type="email" required autocomplete="email">
      </label>
      ${error ? `<div class="result result--error">${escapeHtml(error)}</div>` : ""}
      <button type="submit" class="btn btn--primary btn--lg">Link gönder</button>
    </form>`}
    <p style="margin-top:16px"><a class="muted small" href="/admin/login">← Girişe dön</a></p>
  </div>
  <div class="hero__bg"></div>
</main>`;
  return layout({ title: "Şifre sıfırla", body, appName, bodyClass: "page-hero" });
}

export function renderResetPassword({ token, appName, error }) {
  const body = `
<main class="hero">
  <div class="hero__glass" style="max-width:420px">
    <h1 class="hero__title">Yeni şifre</h1>
    <form method="POST" action="/admin/reset" class="form">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <label class="form__field"><span>Yeni şifre (min 8)</span>
        <input name="password" type="password" required minlength="8" autocomplete="new-password">
      </label>
      <label class="form__field"><span>Tekrar</span>
        <input name="passwordConfirm" type="password" required minlength="8">
      </label>
      ${error ? `<div class="result result--error">${escapeHtml(error)}</div>` : ""}
      <button type="submit" class="btn btn--primary btn--lg">Kaydet</button>
    </form>
  </div>
  <div class="hero__bg"></div>
</main>`;
  return layout({ title: "Yeni şifre", body, appName, bodyClass: "page-hero" });
}
