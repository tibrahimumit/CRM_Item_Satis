import { layout } from "./_layout.js";
import { escapeHtml } from "../utils/validation.js";

export function renderSetup({ appName, emailFrom, emailFromName, error }) {
  const body = `
<main class="hero">
  <div class="hero__glass" style="max-width:480px">
    <div class="hero__brand"><span class="hero__dot"></span><strong>Kurulum</strong></div>
    <h1 class="hero__title">Admin hesabı oluştur</h1>
    <p class="hero__subtitle">Bu sayfa <strong>sadece sizin yönetici paneli</strong> içindir — müşteriye verilen stok linki değil.</p>
    <p class="hero__subtitle">Gerçek e-postanız ve şifrenizle kaydolun. Resend açıksa önce <strong>e-posta doğrulama</strong> linki gelir.</p>
    <form method="POST" action="/admin/setup" class="form">
      <label class="form__field">
        <span>Admin e-posta <em>*</em></span>
        <input name="email" type="email" autocomplete="email" required placeholder="siz@firma.com">
      </label>
      <label class="form__field">
        <span>Şifre <em>*</em> (min 8)</span>
        <input name="password" type="password" autocomplete="new-password" required minlength="8" placeholder="••••••••">
      </label>
      <label class="form__field">
        <span>Şifre tekrar <em>*</em></span>
        <input name="passwordConfirm" type="password" autocomplete="new-password" required minlength="8">
      </label>
      <hr style="border:0;border-top:1px solid var(--border);margin:16px 0">
      <label class="form__field">
        <span>Uygulama adı <em>*</em></span>
        <input name="appName" required maxlength="80" value="${escapeHtml(appName || "Item Satış CRM")}">
      </label>
      <label class="form__field">
        <span>E-posta gönderen adresi <em>*</em></span>
        <input name="emailFrom" type="email" required maxlength="120" value="${escapeHtml(emailFrom || "")}" placeholder="noreply@sizindomain.com">
      </label>
      <label class="form__field">
        <span>Gönderen görünen ad <em>*</em></span>
        <input name="emailFromName" required maxlength="80" value="${escapeHtml(emailFromName || appName || "CRM")}">
      </label>
      <hr style="border:0;border-top:1px solid var(--border);margin:16px 0">
      <label class="form__field">
        <span>Müşteri linkleri (public)</span>
        <input name="publicBaseUrl" type="url" maxlength="200" placeholder="https://links.salediscount.online">
        <p class="form__hint muted small"><code>/r/</code> ve maildeki <code>/access/</code> bu adreste açılır.</p>
      </label>
      <label class="form__field">
        <span>Admin panel adresi</span>
        <input name="adminBaseUrl" type="url" maxlength="200" placeholder="https://crm.salediscount.online">
        <p class="form__hint muted small">Doğrulama ve şifre sıfırlama mailleri bu adrese gider.</p>
      </label>
      ${error ? `<div class="result result--error">${escapeHtml(error)}</div>` : ""}
      <button type="submit" class="btn btn--primary btn--lg">Kayıt ol ve doğrulama maili al</button>
      <p style="margin-top:14px;text-align:center"><a class="muted small" href="/admin/login">Zaten hesabım var — giriş</a></p>
    </form>
  </div>
  <div class="hero__bg"></div>
</main>`;
  return layout({ title: "Kurulum", body, appName: appName || "CRM", bodyClass: "page-hero" });
}
