/**
 * Admin SPA shell. The actual rendering is driven by /dashboard.js on the client.
 */

import { layout } from "./_layout.js";
import { escapeHtml } from "../utils/validation.js";

export function renderDashboard({ appName }) {
  const body = `
<div class="app">
  <aside class="sidebar">
    <div class="sidebar__brand">
      <span class="brand-mark"></span>
      <div>
        <strong>${escapeHtml(appName)}</strong>
        <small>Admin Console</small>
      </div>
    </div>
    <nav class="sidebar__nav" id="nav">
      <a href="#overview"    data-route="overview"    class="nav-link active">Overview</a>
      <a href="#platforms"   data-route="platforms"   class="nav-link">Platforms</a>
      <a href="#categories"  data-route="categories"  class="nav-link">Categories</a>
      <a href="#stocks"      data-route="stocks"      class="nav-link">Stocks &amp; Links</a>
      <a href="#leads"       data-route="leads"       class="nav-link">Leads</a>
      <a href="#customers"   data-route="customers"   class="nav-link">Customers (CRM)</a>
      <a href="#finance"     data-route="finance"     class="nav-link" data-i18n="finance">Muhasebe</a>
      <a href="#emails"      data-route="emails"      class="nav-link">Email Queue</a>
      <a href="#automations" data-route="automations" class="nav-link">Automations</a>
      <a href="#settings"    data-route="settings"    class="nav-link">Ayarlar</a>
    </nav>
    <form method="POST" action="/admin/logout" class="sidebar__foot">
      <button class="btn btn--ghost btn--sm">Sign out</button>
    </form>
  </aside>

  <main class="content">
    <header class="topbar">
      <div>
        <h1 id="pageTitle">Overview</h1>
        <p id="pageSubtitle" class="muted">Real-time pulse across categories, leads, customers, and email automations.</p>
      </div>
      <div class="topbar__actions">
        <select id="panelLang" class="btn btn--ghost btn--sm" style="padding:6px 10px" title="Dil / Language">
          <option value="tr">TR</option>
          <option value="en">EN</option>
        </select>
        <button type="button" class="btn btn--ghost btn--sm" id="themeToggle" title="Açık / koyu mod">🌙</button>
        <button type="button" class="btn btn--ghost btn--sm" id="clearCacheBtn" title="Önbellek ve oturum temizle">↻ Yenile</button>
        <span class="pulse"></span>
        <span class="muted small">Live</span>
      </div>
    </header>

    <section id="view"></section>

    <div id="toast" class="toast" hidden></div>
  </main>
</div>

<!-- Modal -->
<div id="modal" class="modal" hidden>
  <div class="modal__backdrop" data-close></div>
  <div class="modal__card">
    <header class="modal__head">
      <h3 id="modalTitle"></h3>
      <button class="icon-btn" data-close aria-label="Close">×</button>
    </header>
    <div class="modal__body" id="modalBody"></div>
  </div>
</div>

<script src="/dashboard.js?v=51" defer></script>
`;
  return layout({ title: "Dashboard", body, appName, bodyClass: "page-app" });
}
