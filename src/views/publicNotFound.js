import { layout } from "./_layout.js";

export function renderPublicNotFound({ appName }) {
  const body = `
<main class="hero">
  <div class="hero__glass center">
    <div class="check warn">!</div>
    <h1 class="hero__title">Geçersiz veya eksik link</h1>
    <p class="hero__subtitle">Bu adres bir ürün formu değil. Size verilen tam linki kullanın.</p>
  </div>
  <div class="hero__bg"></div>
</main>`;
  return layout({ title: "Link bulunamadı", body, appName, bodyClass: "page-hero" });
}
