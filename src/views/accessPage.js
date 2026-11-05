/**
 * Confirmation / token-status pages.
 */

import { layout } from "./_layout.js";
import { escapeHtml } from "../utils/validation.js";

export function renderAccessPage({ mode, email = "", appName, reason, storeName = "" }) {
  const body = mode === "sent" ? sentBody(email) : invalidBody(reason, storeName);
  return layout({ title: mode === "sent" ? "E-postanızı kontrol edin" : "Link geçersiz", body, appName, bodyClass: "page-hero" });
}

function sentBody(email) {
  return `
<main class="hero">
  <div class="hero__glass center">
    <div class="check">✓</div>
    <h1 class="hero__title">E-postanızı kontrol edin</h1>
    <p class="hero__subtitle">
      Gizli erişim linkiniz <strong>${escapeHtml(email)}</strong> adresine gönderildi.
      Bu sayfada link gösterilmez — yalnızca e-postanızdaki butona tıklayın.
    </p>
    <p class="muted small">
      Birkaç dakika içinde gelmezse spam / gereksiz klasörüne bakın.
    </p>
  </div>
  <div class="hero__bg"></div>
</main>`;
}

function renewHint(storeName) {
  const name = String(storeName || "").trim();
  if (name) {
    return `Yeniden almak isterseniz <strong>${escapeHtml(name)}</strong> üzerinden satın alabilirsiniz.`;
  }
  return "Yeniden almak isterseniz satın aldığınız mağaza üzerinden tekrar satın alabilirsiniz.";
}

function invalidBody(reason, storeName) {
  const msg =
    reason === "access_expired"
      ? `Erişim linkinizin süresi doldu veya tıklama limitine ulaşıldı. ${renewHint(storeName)}`
      : "Bu link artık geçerli değil.";
  return `
<main class="hero">
  <div class="hero__glass center">
    <div class="check warn">!</div>
    <h1 class="hero__title">Erişim linki kullanılamıyor</h1>
    <p class="hero__subtitle">${msg}</p>
  </div>
  <div class="hero__bg"></div>
</main>`;
}
