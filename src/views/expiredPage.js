import { layout } from "./_layout.js";

export function renderExpiredPage({ reason, appName }) {
  const message = reason === "max_visits"
    ? "This link reached its maximum number of visits."
    : "This link has expired.";
  const body = `
<main class="hero">
  <div class="hero__glass center">
    <div class="check warn">!</div>
    <h1 class="hero__title">${message}</h1>
    <p class="hero__subtitle">Please contact the sender for a fresh link.</p>
  </div>
  <div class="hero__bg"></div>
</main>`;
  return layout({ title: "Link unavailable", body, appName, bodyClass: "page-hero" });
}
