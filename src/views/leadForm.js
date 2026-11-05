/**
 * Public lead capture — 1) Okudum anladım + dil  2) Form
 */

import { layout } from "./_layout.js";
import { escapeHtml } from "../utils/validation.js";
import {
  LANG_OPTIONS,
  getIntroCopy,
  getFormCopy,
  getLockedCopy,
  buildLeadI18nBundle,
} from "../i18n/languages.js";

function renderLangSelect(currentLang) {
  return LANG_OPTIONS.map(
    (o) =>
      `<option value="${escapeHtml(o.code)}"${o.code === currentLang ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
  ).join("");
}

function renderIntroSections(copy) {
  return (copy.sections || [])
    .map(
      (s) => `
      <section class="intro-block" style="margin:0 0 18px">
        <h2 style="font-size:15px;margin:0 0 8px;color:#e2e8f0">${escapeHtml(s.h)}</h2>
        <div class="muted" style="font-size:14px;line-height:1.65">${s.p}</div>
      </section>`,
    )
    .join("");
}

function renderStoreBanner(copy, storeName) {
  const line = copy.storeLine;
  if (!line || !storeName) return "";
  const html = line.replace(/\{\{store\}\}/g, escapeHtml(storeName));
  return `
        <div id="formStoreBanner" class="form__store-note" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.28);border-radius:12px;padding:14px 16px;margin:0 0 14px">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#bbf7d0">${html}</p>
        </div>`;
}

function leadI18nScripts(lang, storeName) {
  const bundle = buildLeadI18nBundle(storeName);
  return `<script>
  window.__LEAD_LANG__ = ${JSON.stringify(lang)};
  window.__LEAD_STOCK_NAME__ = ${JSON.stringify(storeName || "")};
  window.__LEAD_I18N__ = ${JSON.stringify(bundle)};
</script>
<script src="/lead.js?v=12" defer></script>`;
}

export function renderLeadForm({
  stock,
  appName,
  locked = false,
  lockMessage,
  lang = "tr",
  storeName = "",
}) {
  const L = normalizeLangParam(lang);
  if (locked) {
    const msg = lockMessage || getLockedCopy(L);
    const body = `
<main class="hero">
  <div class="hero__glass center">
    <div class="hero__brand"><span class="hero__dot"></span><strong>${escapeHtml(appName)}</strong></div>
    <div class="check warn">!</div>
    <h1 class="hero__title">🔒</h1>
    <p class="hero__subtitle" id="lockedMsg">${escapeHtml(msg)}</p>
    <p class="muted small"><strong>${escapeHtml(stock.name)}</strong></p>
    <label class="form__field" style="margin-top:16px;max-width:220px;margin-left:auto;margin-right:auto">
      <span class="muted small" data-lead-lang-label>${escapeHtml(getIntroCopy(L).langLabel)}</span>
      <select id="langSelectLocked" class="input">${renderLangSelect(L)}</select>
    </label>
  </div>
  <div class="hero__bg"></div>
</main>
${leadI18nScripts(L, storeName)}`;
    return layout({ title: "Link kullanıldı", body, appName, bodyClass: "page-hero" });
  }

  const intro = getIntroCopy(L);
  const form = getFormCopy(L);

  const body = `
<main class="hero">
  <div class="hero__glass" id="leadShell">
    <div class="hero__brand"><span class="hero__dot"></span><strong>${escapeHtml(appName)}</strong></div>

    <label class="form__field" style="margin-bottom:12px">
      <span class="muted small" data-lead-lang-label>${escapeHtml(intro.langLabel)}</span>
      <select id="langSelect" name="langUi">${renderLangSelect(L)}</select>
    </label>

    <div id="stepIntro">
      <h1 class="hero__title" id="introTitle">${escapeHtml(intro.title)}</h1>
      <p class="hero__subtitle muted" id="introProduct">${escapeHtml(intro.productLine)} <strong>${escapeHtml(stock.name)}</strong></p>
      <div id="introEmailNote" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:12px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.55">
        ${intro.emailLangNote || ""}
      </div>
      <div id="introSections">${renderIntroSections(intro)}</div>
      <p class="muted small" id="introFooter" style="margin:0 0 16px">${escapeHtml(intro.footer)}</p>
      <button type="button" class="btn btn--primary btn--lg" id="agreeBtn">${escapeHtml(intro.agreeBtn)}</button>
    </div>

    <div id="stepForm" hidden>
      <h1 class="hero__title" id="formTitle">${escapeHtml(form.title)}</h1>
      <p class="hero__subtitle" id="formSubtitle">${form.subtitle}</p>

      <form id="leadForm" class="form" autocomplete="on" novalidate>
        <input type="hidden" name="code" value="${escapeHtml(stock.code)}">
        <input type="hidden" name="preferredLang" id="preferredLang" value="${escapeHtml(L)}">

        ${renderStoreBanner(form, storeName)}

        <div class="form__store-note" style="background:rgba(254,226,226,0.12);border:1px solid rgba(248,113,113,0.35);border-radius:12px;padding:14px 16px;margin:0 0 12px">
          <p id="formNameWarn" style="margin:0;font-size:14px;line-height:1.6;color:#fecaca">${form.nameWarn}</p>
        </div>

        <label class="form__field">
          <span id="formFullNameLabel">${escapeHtml(form.fullName)} <em>*</em></span>
          ${form.fullNameHint ? `<p id="formFullNameHint" class="muted small" style="margin:4px 0 8px;line-height:1.5">${escapeHtml(form.fullNameHint)}</p>` : `<p id="formFullNameHint" class="muted small" style="margin:4px 0 8px;line-height:1.5"></p>`}
          <input id="fieldFullName" name="fullName" type="text" required minlength="2" autocomplete="name" placeholder="${escapeHtml(form.fullNamePh)}">
        </label>
        <label class="form__field">
          <span id="formEmailLabel">${escapeHtml(form.email)} <em>*</em></span>
          <p id="formEmailSpamHint" class="muted small" style="margin:4px 0 8px;line-height:1.5;color:#a5b4fc">${form.emailSpamHint || ""}</p>
          <input id="fieldEmail" name="email" type="email" required autocomplete="email" placeholder="${escapeHtml(form.emailPh)}">
        </label>
        <label class="form__field">
          <span id="formUserLabel">${escapeHtml(form.platformUsername)} <em>*</em></span>
          ${form.platformUsernameHint ? `<p id="formUserHint" class="muted small" style="margin:4px 0 8px;line-height:1.5">${escapeHtml(form.platformUsernameHint)}</p>` : `<p id="formUserHint" class="muted small" style="margin:4px 0 8px;line-height:1.5"></p>`}
          <input id="fieldUsername" name="platformUsername" type="text" required minlength="2" maxlength="80" placeholder="${escapeHtml(form.platformUsernamePh)}">
        </label>

        <div class="form__store-note" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:14px 16px;margin:4px 0 8px">
          <p id="formStoreNote" style="margin:0;font-size:14px;line-height:1.55;color:#cbd5e1">${form.storeNote}</p>
        </div>

        <button type="submit" class="btn btn--primary btn--lg" id="submitBtn">
          <span id="formSubmitLabel">${escapeHtml(form.submit)}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
        <p id="formLegal" class="form__legal muted small">${form.legal}</p>
      </form>
      <div id="leadResult" class="result" hidden></div>
    </div>
  </div>
  <div class="hero__bg"></div>
</main>
${leadI18nScripts(L, storeName)}`;
  return layout({ title: intro.title, body, appName, bodyClass: "page-hero" });
}

function normalizeLangParam(lang) {
  const c = String(lang || "tr").toLowerCase();
  return LANG_OPTIONS.some((o) => o.code === c) ? c : "tr";
}
