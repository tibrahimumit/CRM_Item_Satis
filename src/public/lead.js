/**
 * Lead: intro → form; dil değişimi sayfa yenilemeden (403 önlenir).
 */
(() => {
  const bundle = window.__LEAD_I18N__;
  const stockName = window.__LEAD_STOCK_NAME__ || "";

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el && html != null) el.innerHTML = html;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el && text != null) el.textContent = text;
  }

  function setPh(id, ph) {
    const el = document.getElementById(id);
    if (el && ph != null) el.placeholder = ph;
  }

  function applyLeadLang(code) {
    if (!bundle) return;
    const c = bundle[code] || bundle.tr;
    if (!c) return;

    window.__LEAD_LANG__ = code;
    try {
      sessionStorage.setItem("lead:lang", code);
    } catch {
      /* private mode */
    }

    const pl = document.getElementById("preferredLang");
    if (pl) pl.value = code;

    const sel = document.getElementById("langSelect") || document.getElementById("langSelectLocked");
    if (sel && sel.value !== code) sel.value = code;

    if (c.locked && document.getElementById("lockedMsg")) {
      setText("lockedMsg", c.locked);
      return;
    }

    if (c.intro) {
      setText("introTitle", c.intro.title);
      setHtml(
        "introProduct",
        `${esc(c.intro.productLine)} <strong>${esc(stockName)}</strong>`,
      );
      setHtml("introEmailNote", c.intro.emailLangNote);
      setHtml("introSections", c.intro.sectionsHtml);
      setText("introFooter", c.intro.footer);
      setText("agreeBtn", c.intro.agreeBtn);
      const langLbl = document.querySelector("[data-lead-lang-label]");
      if (langLbl) langLbl.textContent = c.intro.langLabel;
    }

    if (c.form) {
      setText("formTitle", c.form.title);
      setHtml("formSubtitle", c.form.subtitle);
      const banner = document.getElementById("formStoreBanner");
      if (banner) {
        if (c.form.storeLineHtml) {
          banner.innerHTML = `<p style="margin:0;font-size:14px;line-height:1.6;color:#bbf7d0">${c.form.storeLineHtml}</p>`;
          banner.hidden = false;
        } else {
          banner.hidden = true;
        }
      }
      setHtml("formNameWarn", c.form.nameWarn);
      setHtml("formFullNameLabel", `${esc(c.form.fullName)} <em>*</em>`);
      const fnHint = document.getElementById("formFullNameHint");
      if (fnHint) {
        fnHint.textContent = c.form.fullNameHint || "";
        fnHint.hidden = !c.form.fullNameHint;
      }
      setPh("fieldFullName", c.form.fullNamePh);
      setHtml("formEmailLabel", `${esc(c.form.email)} <em>*</em>`);
      const spamHint = document.getElementById("formEmailSpamHint");
      if (spamHint) {
        spamHint.innerHTML = c.form.emailSpamHint || "";
        spamHint.hidden = !c.form.emailSpamHint;
      }
      setPh("fieldEmail", c.form.emailPh);
      setHtml("formUserLabel", `${esc(c.form.platformUsername)} <em>*</em>`);
      const uHint = document.getElementById("formUserHint");
      if (uHint) {
        uHint.textContent = c.form.platformUsernameHint || "";
        uHint.hidden = !c.form.platformUsernameHint;
      }
      setPh("fieldUsername", c.form.platformUsernamePh);
      setHtml("formStoreNote", c.form.storeNote);
      setText("formSubmitLabel", c.form.submit);
      setHtml("formLegal", c.form.legal);
    }
  }

  function bindLangSelect(id) {
    const el = document.getElementById(id);
    if (!el || !bundle) return;
    el.addEventListener("change", (e) => {
      e.preventDefault();
      applyLeadLang(e.target.value);
    });
  }

  if (bundle) {
    bindLangSelect("langSelect");
    bindLangSelect("langSelectLocked");
    let initial = window.__LEAD_LANG__ || "tr";
    try {
      const saved = sessionStorage.getItem("lead:lang");
      if (saved && bundle[saved]) initial = saved;
    } catch {
      /* ignore */
    }
    if (bundle[initial]) applyLeadLang(initial);
  }

  const form = document.getElementById("leadForm");
  if (!form) return;

  const submit = document.getElementById("submitBtn");
  const result = document.getElementById("leadResult");
  const lang = () => window.__LEAD_LANG__ || "tr";

  const uiMsg = (key) => {
    const c = bundle?.[lang()]?.ui || bundle?.tr?.ui || {};
    return c[key] || "";
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    const span = submit.querySelector("span");
    if (span) span.textContent = uiMsg("sending") || "…";

    result.hidden = true;
    result.classList.remove("result--error");

    try {
      const data = Object.fromEntries(new FormData(form).entries());
      data.preferredLang = lang();

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data),
      });
      const text = await res.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(
          res.ok
            ? "Invalid response"
            : `Server error (${res.status}). Refresh and try again.`,
        );
      }
      if (!res.ok || !payload.ok) {
        const err = new Error(payload.message || payload.error || "Failed");
        err.status = res.status;
        throw err;
      }

      form.hidden = true;
      submit.hidden = true;
      result.hidden = false;
      result.innerHTML = `<strong>✅</strong><br>${esc(payload.data?.message || uiMsg("success"))}`;
    } catch (err) {
      result.hidden = false;
      result.classList.add("result--error");
      const title =
        err.status === 409 ? uiMsg("unavailable") : uiMsg("error") || "Error";
      result.innerHTML = `<strong>${title}</strong><br>${esc(err.message || "Error")}`;
      if (err.status === 409) {
        form.hidden = true;
        submit.hidden = true;
      } else {
        submit.disabled = false;
        if (span) span.textContent = document.getElementById("formSubmitLabel")?.textContent || "Submit";
      }
    }
  });

  document.getElementById("agreeBtn")?.addEventListener("click", () => {
    document.getElementById("stepIntro").hidden = true;
    document.getElementById("stepForm").hidden = false;
    applyLeadLang(lang());
  });
})();
