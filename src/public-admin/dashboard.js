/**
 * Admin dashboard SPA.
 * Hash-routed, fetch-driven, no framework. Keep it simple but modular.
 *
 * Sections:
 *  - api(): thin REST wrapper around /api/*
 *  - render*(): individual view renderers
 *  - router(): listens to hashchange + dispatches
 *
 *  All views are re-rendered on the fly; counters update without page reload.
 */
(() => {
  const PANEL = {
    tr: {
      overview: "Genel bakış", platforms: "Mağazalar", categories: "Kategoriler", stocks: "Stok & linkler",
      leads: "Lead'ler", customers: "Müşteriler", finance: "Muhasebe", emails: "E-posta kuyruğu",
      automations: "Otomasyonlar", settings: "Ayarlar", signOut: "Çıkış", live: "Canlı", refresh: "Yenile",
      financeTitle: "Muhasebe", financeSubtitle: "İlan fiyatı ve mağaza kesintisine göre brüt, komisyon, net. 📊",
      dateFrom: "Başlangıç", dateTo: "Bitiş", dateApply: "Tarih aralığını uygula", dateClear: "Hızlı dönem",
      customRange: "Özel aralık",
      periodDay: "Bugün", periodWeek: "Hafta", periodMonth: "Ay", periodYear: "Yıl",
      gross: "Brüt", commission: "Komisyon", net: "Net", sales: "Satış", avgOrder: "Ort. sipariş",
      effectiveRate: "Efektif kesinti", byPlatform: "Mağaza (bu ay)", byProduct: "Ürün (son satışlar)",
      recentSales: "Son satışlar", noSales: "Satış yok — lead tamamlanmalı ve stokta ilan fiyatı olmalı.",
      platform: "Mağaza", product: "Ürün", rate: "Kesinti %", when: "Zaman", listPrice: "İlan fiyatı",
      commissionPercent: "Mağaza kesintisi (%)", storeUrl: "Mağaza linki (opsiyonel)", currency: "Para birimi",
      bulkDelete: "Seçilenleri sil", newPlatform: "Yeni mağaza", edit: "Düzenle", delete: "Sil", save: "Kaydet",
      tryLabel: "TRY",
      financeReset: "Tüm istatistikleri sıfırla",
      financeResetConfirm1: "Tüm muhasebe kayıtları (satışlar, özetler, grafikler) silinecek. Devam?",
      financeResetConfirm2: "Bu işlem geri alınamaz. Emin misiniz?",
      financeResetDone: "Muhasebe verileri sıfırlandı",
      emailEdit: "Düzenle", emailEditTitle: "Planlı mail düzenle", emailSubject: "Konu",
      emailDue: "Gönderim zamanı", emailSaved: "Mail güncellendi",
      emailClickHint: "Satıra tıklayarak düzenleyebilirsiniz.",
      emailEditHint: "Metne tıklayıp düzenleyin — önizleme anında güncellenir.",
      emailTestHint: "Domain doğrulandıysa herhangi bir alıcıya test maili gidebilir. Gönderen: noreply@salediscount.online",
    },
    en: {
      overview: "Overview", platforms: "Stores", categories: "Categories", stocks: "Stocks & links",
      leads: "Leads", customers: "Customers", finance: "Finance", emails: "Email queue",
      automations: "Automations", settings: "Settings", signOut: "Sign out", live: "Live", refresh: "Refresh",
      financeTitle: "Finance", financeSubtitle: "Gross, store fee, and net from listing price per sale. 📊",
      dateFrom: "From", dateTo: "To", dateApply: "Apply range", dateClear: "Quick period",
      customRange: "Custom range",
      periodDay: "Today", periodWeek: "Week", periodMonth: "Month", periodYear: "Year",
      gross: "Gross", commission: "Fee", net: "Net", sales: "Sales", avgOrder: "Avg. order",
      effectiveRate: "Effective fee", byPlatform: "By store (month)", byProduct: "By product (recent)",
      recentSales: "Recent sales", noSales: "No sales — need completed lead + listing price on stock.",
      platform: "Store", product: "Product", rate: "Fee %", when: "When", listPrice: "Listing price",
      commissionPercent: "Store fee (%)", storeUrl: "Store URL (optional)", currency: "Currency",
      bulkDelete: "Delete selected", newPlatform: "New store", edit: "Edit", delete: "Delete", save: "Save",
      tryLabel: "TRY",
      financeReset: "Reset all statistics",
      financeResetConfirm1: "Delete all finance records (sales, aggregates, charts). Continue?",
      financeResetConfirm2: "This cannot be undone. Are you sure?",
      financeResetDone: "Finance data reset",
      emailEdit: "Edit", emailEditTitle: "Edit scheduled email", emailSubject: "Subject",
      emailDue: "Send at", emailSaved: "Email updated",
      emailClickHint: "Click a row to edit.",
      emailEditHint: "Click the message to edit — preview updates live.",
      emailTestHint: "If domain is verified, test mail can go to any inbox. From: noreply@salediscount.online",
    },
  };
  let panelLang = localStorage.getItem("crm:panel-lang") || "tr";
  const t = (k) => PANEL[panelLang]?.[k] ?? PANEL.en[k] ?? k;
  const fmtMoney = (n, cur = "TRY") =>
    `${Number(n || 0).toLocaleString(panelLang === "tr" ? "tr-TR" : "en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cur}`;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const view = $("#view");
  const pageTitle = $("#pageTitle");
  const pageSubtitle = $("#pageSubtitle");
  const modal = $("#modal");
  const modalTitle = $("#modalTitle");
  const modalBody = $("#modalBody");
  const toast = $("#toast");

  const siteOrigin = () => window.location.origin.replace(/\/$/, "");
  let cachedPublicSiteUrl = "";
  let cachedAdminSiteUrl = "";

  /** Müşteri linkleri links.* üzerinde; admin crm.* — asla panel origin'i kullanma. */
  async function loadSiteUrls() {
    try {
      const s = await api("/api/settings");
      cachedPublicSiteUrl = String(s.publicSiteUrl || s.publicBaseUrl || "").replace(/\/$/, "");
      cachedAdminSiteUrl = String(s.adminSiteUrl || s.adminBaseUrl || siteOrigin()).replace(/\/$/, "");
    } catch {
      cachedPublicSiteUrl = "";
      cachedAdminSiteUrl = siteOrigin();
    }
  }

  const fullPublicUrl = (stock) => {
    if (stock?.publicUrl && /^https?:\/\//i.test(stock.publicUrl)) {
      const u = stock.publicUrl;
      if (cachedPublicSiteUrl && u.startsWith(siteOrigin())) {
        return u.replace(siteOrigin(), cachedPublicSiteUrl);
      }
      return u;
    }
    const base = (cachedPublicSiteUrl || "").replace(/\/$/, "");
    if (!base) return stock?.code ? `${siteOrigin()}/r/${stock.code}` : siteOrigin();
    const slug = stock?.categorySlug;
    const code = stock?.code || "";
    const path = slug ? `/r/${slug}/${code}` : `/r/${code}`;
    return `${base}${path}`;
  };

  const linkActionBar = (url, { compact = false } = {}) => {
    if (!url) return `<span class="muted">—</span>`;
    return `
      <div class="link-actions${compact ? " link-actions--compact" : ""}">
        ${compact ? "" : `<code class="link-actions__url">${escapeHtml(url)}</code>`}
        <button type="button" class="btn btn--ghost btn--sm" data-copy="${escapeHtml(url)}">Kopyala</button>
        <button type="button" class="btn btn--ghost btn--sm" data-open="${escapeHtml(url)}">Aç</button>
      </div>`;
  };

  const bindLinkActions = (root = view) => {
    root.querySelectorAll("[data-copy]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(el.dataset.copy);
        flash("Kopyalandı");
      }),
    );
    root.querySelectorAll("[data-open]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(el.dataset.open, "_blank");
      }),
    );
  };

  const STOCK_CACHE_KEY = "crm:stocks:v2";
  const loadStockCache = () => {
    try {
      return JSON.parse(sessionStorage.getItem(STOCK_CACHE_KEY) || "[]");
    } catch {
      return [];
    }
  };
  const saveStockCache = (items) => {
    try {
      sessionStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(items.slice(0, 200)));
    } catch { /* quota */ }
  };
  const rememberStock = (stock) => {
    if (!stock?.id) return;
    const merged = [stock, ...loadStockCache().filter((s) => s.id !== stock.id)];
    saveStockCache(merged);
  };
  const leadCustomerLabel = (l) => {
    const name = l.customer?.fullName || l.customerName || "";
    const email = l.customer?.email || l.customerEmail || "";
    if (name && email) return `${name} · ${email}`;
    return name || email || "Misafir";
  };
  const stockDisplayLabel = (l) =>
    l.stockName || (l.stockCode ? `/r/${l.stockCode}` : null) || "Ürün";

  const bindBulkDelete = ({ tableSel, apiPath, confirmText }) => {
    const table = view.querySelector(tableSel);
    const bar = view.querySelector("[data-bulk-bar]");
    if (!table || !bar) return;
    const selectAll = bar.querySelector("[data-select-all]");
    const countEl = bar.querySelector("[data-bulk-count]");
    const delBtn = bar.querySelector("[data-bulk-del]");
    const rowChecks = () => [...table.querySelectorAll("tbody input[data-row-id]")];
    const selectedIds = () => rowChecks().filter((c) => c.checked).map((c) => c.dataset.rowId);
    const syncBar = () => {
      const n = selectedIds().length;
      bar.hidden = n === 0;
      if (countEl) countEl.textContent = `${n} seçili`;
    };
    selectAll?.addEventListener("change", () => {
      rowChecks().forEach((c) => { c.checked = selectAll.checked; });
      syncBar();
    });
    rowChecks().forEach((c) => c.addEventListener("change", syncBar));
    delBtn?.addEventListener("click", async () => {
      const ids = selectedIds();
      if (!ids.length) return;
      if (!confirm(confirmText(ids.length))) return;
      const res = await api(apiPath, { method: "POST", body: JSON.stringify({ ids }) });
      if (apiPath.includes("/stocks/")) forgetStocks(ids);
      flash(`${res.deleted} kayıt silindi`);
      await refreshView();
    });
  };

  const forgetStocks = (ids) => {
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    saveStockCache(loadStockCache().filter((s) => !set.has(s.id)));
  };

  /** GET /api/stocks — sunucu kaynağı; KV boşsa tarayıcı önbelleği. */
  const fetchStocksList = async (sync = false) => {
    const url = sync ? "/api/stocks?sync=1" : "/api/stocks";
    const apiStocks = await api(url);
    if (apiStocks.length > 0) {
      saveStockCache(apiStocks);
      return apiStocks;
    }
    const cached = loadStockCache();
    return cached.length ? cached : apiStocks;
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const vpnBadge = (v) => {
    if (v === "yes") return '<span class="badge badge--danger">VPN</span>';
    if (v === "maybe") return '<span class="badge badge--warn">VPN?</span>';
    if (v === "no") return '<span class="badge badge--ok">Normal</span>';
    return '<span class="muted">—</span>';
  };

  const osLabel = (row) => {
    const o = row?.os || "—";
    const ver = row?.osVersion ? ` ${row.osVersion}` : "";
    return escapeHtml(`${o}${ver}`.trim());
  };

  const formatVpnText = (v) => {
    if (v === "yes") return "VPN / Proxy";
    if (v === "maybe") return "Muhtemelen VPN";
    if (v === "no") return "Normal bağlantı";
    return "—";
  };

  const metaCard = (row, title = "Ziyaret detayı") => {
    if (!row) return `<p class="muted">Veri yok</p>`;
    const rows = [
      ["🌍", "Ülke", row.country],
      ["📍", "Konum", row.city ? `${row.city}${row.region ? `, ${row.region}` : ""}` : row.region],
      ["📶", "IP adresi", row.ip],
      ["💻", "Sistem", row.os ? `${row.os}${row.osVersion ? ` ${row.osVersion}` : ""}`.trim() : null],
      ["🌐", "Tarayıcı", row.browser],
      ["📱", "Cihaz", row.device],
      ["🔒", "Bağlantı", formatVpnText(row.vpnLikely)],
      ["🏢", "ISP / Ağ", row.asOrganization],
      ["🕒", "Saat dilimi", row.timezone],
      ["🗣", "Dil", row.language],
      ["🔗", "Kaynak", row.referer || "Direct"],
      ["☁️", "Cloudflare", row.colo ? `${row.colo}${row.httpProtocol ? ` · ${row.httpProtocol}` : ""}` : null],
      ["🗓", "Kayıt zamanı", row.timestamp ? new Date(row.timestamp).toLocaleString() : null],
    ].filter(([, , v]) => v);
    return `
      <div class="meta-card">
        <h3 class="meta-card__title">${escapeHtml(title)}</h3>
        ${rows.map(([icon, label, val]) => `
          <div class="meta-row">
            <span class="meta-row__icon">${icon}</span>
            <span class="meta-row__label">${escapeHtml(label)}</span>
            <span class="meta-row__value">${escapeHtml(String(val))}</span>
          </div>`).join("")}
      </div>`;
  };

  const detailHeader = (backHash, title, subtitle, actionsHtml = "") => `
    <div class="detail-header">
      <div class="detail-header__main">
        <button type="button" class="detail-back" data-back="${escapeHtml(backHash)}">← Geri</button>
        <h2 class="detail-header__title">${title}</h2>
        ${subtitle ? `<p class="detail-header__sub">${subtitle}</p>` : ""}
      </div>
      ${actionsHtml ? `<div class="detail-actions">${actionsHtml}</div>` : ""}
    </div>`;

  const bindDetailBack = () => {
    view.querySelectorAll("[data-back]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.back || "#overview";
        if (location.hash === target) refreshView();
        else location.hash = target;
      });
    });
  };

  const actionBtn = (label, cls, attrs = "") =>
    `<button type="button" class="btn btn--sm ${cls}" ${attrs}>${label}</button>`;

  const emailTimelineHtml = (comms) => {
    if (!comms?.timeline?.length) {
      return `<p class="muted small">Bu müşteri için henüz e-posta kaydı yok. Form veya ilk erişim sonrası dolacak.</p>`;
    }
    return `<div class="timeline">${comms.timeline.map((item) => {
      const sent = item.status === "sent";
      return `
        <div class="timeline__item ${sent ? "timeline__item--sent" : "timeline__item--scheduled"}">
          <div class="timeline__dot"></div>
          <div class="timeline__body">
            <div class="timeline__head">
              <strong>${escapeHtml(item.kindLabel || item.type || "mail")}</strong>
              <span class="badge ${sent ? "badge--ok" : "badge--warn"}">${sent ? "Gönderildi" : "Sırada"}</span>
              ${item.count > 1 ? `<span class="badge badge--muted">${item.count} kayıt birleştirildi</span>` : ""}
            </div>
            <p class="timeline__subject">${escapeHtml(item.subject || "—")}</p>
            <p class="muted small">${sent ? new Date(item.sentAt).toLocaleString("tr-TR") : item.dueAtIso ? `Plan: ${new Date(item.dueAtIso).toLocaleString("tr-TR")}` : ""}</p>
          </div>
        </div>`;
    }).join("")}</div>`;
  };

  const bindRowNav = (selector, hashFn) => {
    view.querySelectorAll(selector).forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("button,a,[data-copy],[data-stop]")) return;
        const id = row.dataset.id;
        if (id) location.hash = hashFn(id);
      });
    });
  };

  // ─── Toast ─────────────────────────────────────────────────────────────────
  let toastTimer = null;
  const flash = (message, kind = "ok") => {
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.toggle("toast--error", kind === "error");
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => (toast.hidden = true), 220);
    }, 2400);
  };

  // ─── REST client ───────────────────────────────────────────────────────────
  const ADMIN_FALLBACK =
    "https://crm-admin-intelligence.salesmind.workers.dev/admin";

  const apiFetch = async (url, opts) =>
    fetch(url, {
      ...opts,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers || {}),
      },
    });

  const parseApiResponse = async (res) => {
    let payload;
    try {
      payload = await res.json();
    } catch {
      payload = { ok: false };
    }
    return { res, payload };
  };

  const api = async (path, opts = {}, attempt = 0) => {
    const method = (opts.method || "GET").toUpperCase();
    let url = path;
    if (method === "GET") {
      const sep = path.includes("?") ? "&" : "?";
      url = `${path}${sep}_nc=${Date.now()}`;
    }
    let { res, payload } = await parseApiResponse(await apiFetch(url, opts));

    if (res.status === 403 && attempt < 1) {
      await new Promise((r) => setTimeout(r, 400));
      const retryUrl = url.replace(/_nc=\d+/, `_nc=${Date.now()}`);
      ({ res, payload } = await parseApiResponse(await apiFetch(retryUrl, opts)));
    }

    if (res.status === 401) throw new Error("Oturum süresi doldu — tekrar giriş yapın.");
    if (res.status === 403) {
      const worker = res.headers.get("x-sd-worker");
      throw new Error(
        worker
          ? "Erişim reddedildi (403). Çıkış yapıp tekrar giriş deneyin."
          : `HTTP 403 — Cloudflare engeli (kod değil). Geçici panel: ${ADMIN_FALLBACK} — Security → Bot Fight OFF, Cache bypass kuralı.`,
      );
    }
    if (!res.ok || !payload.ok) {
      let msg = payload?.message || payload?.error || `HTTP ${res.status}`;
      if (/KV put|limit exceeded|quota/i.test(msg)) {
        msg =
          "KV günlük yazma kotası doldu (~1000/gün). Stok listesi GET ile okunur; yeni kayıt/ayar için yarına bekleyin veya Workers ücretli plan.";
      }
      throw new Error(msg);
    }
    return payload.data;
  };

  const isModalOpen = () => modal && !modal.hidden;

  const applyPanelNavLang = () => {
    const map = {
      overview: "overview", platforms: "platforms", categories: "categories", stocks: "stocks",
      leads: "leads", customers: "customers", finance: "finance", analytics: "finance",
      emails: "emails", automations: "automations", settings: "settings",
    };
    $$("#nav .nav-link").forEach((el) => {
      const r = el.dataset.route;
      if (map[r]) el.textContent = t(map[r]);
    });
    const so = $(".sidebar__foot button");
    if (so) so.textContent = t("signOut");
    const live = $(".topbar__actions .muted.small");
    if (live) live.textContent = t("live");
    const ref = $("#clearCacheBtn");
    if (ref) ref.textContent = `↻ ${t("refresh")}`;
    const langSel = $("#panelLang");
    if (langSel) langSel.value = panelLang;
  };

  const currentRoute = () => {
    let hash = (location.hash || "#overview").slice(1);
    if (hash === "analytics" || hash.startsWith("analytics/")) hash = hash.replace(/^analytics/, "finance");
    const [route, ...rest] = hash.split("/");
    const key = routes[route] ? route : "overview";
    return { route: key, rest, handler: routes[key] || routes.overview };
  };

  const refreshView = async ({ silent = false } = {}) => {
    const { route, rest, handler } = currentRoute();
    applyPanelNavLang();
    await loadSiteUrls();
    $$("#nav .nav-link").forEach((el) =>
      el.classList.toggle("active", el.dataset.route === route),
    );
    pageTitle.textContent = typeof handler.title === "function" ? handler.title() : handler.title;
    pageSubtitle.textContent =
      typeof handler.subtitle === "function" ? handler.subtitle() : handler.subtitle;
    if (!silent) view.innerHTML = `<div class="muted small">Yükleniyor…</div>`;
    try {
      await handler.render(rest);
    } catch (e) {
      view.innerHTML = `<div class="card"><strong>Yüklenemedi</strong><div class="muted small">${escapeHtml(e.message)}</div></div>`;
    }
  };

  const navigateTo = async (hash) => {
    if (location.hash === hash) await refreshView();
    else location.hash = hash;
  };

  // ─── Modal ─────────────────────────────────────────────────────────────────
  const openModal = (title, body) => {
    modalTitle.textContent = title;
    modalBody.innerHTML = "";
    if (typeof body === "string") modalBody.innerHTML = body;
    else modalBody.appendChild(body);
    modal.hidden = false;
  };
  const closeModal = () => {
    modal.hidden = true;
    modalBody.innerHTML = "";
    modalTitle.textContent = "";
  };
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal();
    else if (e.target.classList.contains("modal__backdrop")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });
  // Ensure modal starts closed even if CSS cache is stale
  closeModal();

  // ─── Router ────────────────────────────────────────────────────────────────
  const routes = {};
  const register = (name, { title, subtitle, render }) => (routes[name] = { title, subtitle, render });

  const loadRoute = async () => {
    initShellControls();
    await refreshView();
  };
  window.addEventListener("hashchange", loadRoute);

  const showFormError = (form, message) => {
    let el = form.querySelector(".form-error");
    if (!el) {
      el = document.createElement("div");
      el.className = "form-error result result--error";
      form.prepend(el);
    }
    el.textContent = message;
  };

  const bindSubmit = (form, onSubmit, { closeModalOnSuccess = true } = {}) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const errEl = form.querySelector(".form-error");
      if (errEl) errEl.remove();
      if (btn) {
        btn.disabled = true;
        btn.dataset.prevLabel = btn.textContent;
        btn.textContent = "Kaydediliyor…";
      }
      try {
        await onSubmit(new FormData(form));
        if (closeModalOnSuccess && isModalOpen()) closeModal();
      } catch (err) {
        showFormError(form, err.message || "İşlem başarısız");
        flash(err.message || "İşlem başarısız", "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = btn.dataset.prevLabel || "Kaydet";
        }
      }
    });
  };

  // ─── Overview ──────────────────────────────────────────────────────────────
  register("overview", {
    title: "Genel bakış",
    subtitle: "Stoklar, müşteriler ve planlanan e-postalar — tek ekranda.",
    render: async () => {
      const [o, q] = await Promise.all([
        api("/api/analytics/overview"),
        api("/api/emails/queue?group=1").catch(() => ({ size: 0, customers: [], items: [] })),
      ]);
      const queueCustomers = q.customers || [];
      const queueFlat = q.items || queueCustomers.flatMap((g) => g.items || []);

      const mailLive = o.emailLive
        ? `<span class="badge badge--ok">E-posta canlı</span>`
        : `<span class="badge badge--warn">E-posta test / log</span>`;
      const driver = o.emailDriver ? `<span class="badge badge--muted">${escapeHtml(o.emailDriver)}</span>` : "";

      const formatDue = (ms) => {
        if (ms == null) return "—";
        const abs = Math.abs(ms);
        const h = Math.floor(abs / 3600000);
        const m = Math.floor((abs % 3600000) / 60000);
        if (ms < 0) return `${h ? `${h} sa ` : ""}${m} dk gecikmiş`;
        if (h >= 48) return `${Math.floor(h / 24)} gün sonra`;
        if (h > 0) return `${h} sa ${m} dk sonra`;
        return `${m} dk sonra`;
      };

      const queuePreview = queueFlat.slice(0, 6);
      const queueEmptyMsg =
        o.queueOrphans > 0
          ? `${o.queueOrphans} bozuk kuyruk anahtarı var — <a class="link" href="#emails">E-posta</a> sayfasından temizleyin.`
          : "Kuyruk boş — müşteri erişim linkine tıklayınca mailler planlanır.";
      const queueRows =
        queuePreview.length === 0
          ? `<tr><td colspan="5" class="muted">${queueEmptyMsg}</td></tr>`
          : queuePreview
            .map(
              (j) => `
        <tr>
          <td class="muted small">${j.dueAt ? new Date(j.dueAt).toLocaleString("tr-TR") : "—"}<br><span class="badge badge--muted">${escapeHtml(formatDue(j.dueInMs))}</span></td>
          <td><strong>${escapeHtml(j.customerName || "—")}</strong><br><span class="muted small">${escapeHtml(j.customerEmail || j.to || "—")}</span></td>
          <td><span class="badge">${escapeHtml(j.kindLabel || j.kind || "—")}</span></td>
          <td>${escapeHtml(j.subject || "—")}</td>
          <td>${j.customerId ? `<a class="link small" href="#customers/${escapeHtml(j.customerId)}">CRM</a>` : "—"}</td>
        </tr>`,
            )
            .join("");

      view.innerHTML = `
        <div class="overview-hero">
          <div class="overview-hero__text">
            <h2 class="overview-hero__title">Hoş geldiniz 👋</h2>
            <p class="muted">Dijital satış CRM — platform, kategori, stok ve müşteri yolculuğu tek panelde.</p>
            <div class="overview-hero__badges">${mailLive} ${driver}${o.partial ? `<span class="badge badge--warn">Örneklem (KV kotası)</span>` : ""}</div>
          </div>
          <div class="overview-hero__actions">
            <button class="btn btn--primary" data-action="new-stock">+ Stok</button>
            <button class="btn btn--ghost" data-action="new-category">+ Kategori</button>
            <a class="btn btn--ghost" href="#platforms">Platformlar</a>
          </div>
        </div>

        <section class="grid overview-kpis">
          <div class="overview-kpi overview-kpi--primary">
            <span class="overview-kpi__label">Stok / link</span>
            <span class="overview-kpi__value">${o.totalLinks ?? 0}</span>
            <span class="overview-kpi__hint">${o.totalCategories ?? 0} kategori · ${o.totalPlatforms ?? 0} platform</span>
          </div>
          <div class="overview-kpi overview-kpi--accent">
            <span class="overview-kpi__label">Müşteriler</span>
            <span class="overview-kpi__value">${o.totalCustomers ?? 0}</span>
            <span class="overview-kpi__hint">${o.totalLeads ?? 0} lead · ${o.activeLicenses ?? 0} aktif</span>
          </div>
          <div class="overview-kpi">
            <span class="overview-kpi__label">Planlı e-posta</span>
            <span class="overview-kpi__value">${o.queueDepth ?? 0}</span>
            <span class="overview-kpi__hint">${o.expiringSoon ?? 0} müşteri süresi bitiyor · <a class="link" href="#emails">Kuyruk →</a></span>
          </div>
          <div class="overview-kpi">
            <span class="overview-kpi__label">Lead</span>
            <span class="overview-kpi__value">${o.totalLeads ?? 0}</span>
            <span class="overview-kpi__hint"><a class="link" href="#leads">Form kayıtları →</a></span>
          </div>
        </section>

        <div class="panel overview-shortcuts">
            <div class="panel__head"><h2>Hızlı gezinme</h2></div>
            <div class="shortcut-grid">
              <a class="shortcut-card" href="#platforms"><span>🛒</span><strong>Platformlar</strong><small>Satış siteleri</small></a>
              <a class="shortcut-card" href="#categories"><span>📁</span><strong>Kategoriler</strong><small>Ürün grupları</small></a>
              <a class="shortcut-card" href="#stocks"><span>🔗</span><strong>Stoklar</strong><small>Public linkler</small></a>
              <a class="shortcut-card" href="#customers"><span>👤</span><strong>Müşteriler</strong><small>CRM</small></a>
              <a class="shortcut-card" href="#leads"><span>📝</span><strong>Leadler</strong><small>Form kayıtları</small></a>
              <a class="shortcut-card" href="#emails"><span>✉️</span><strong>E-posta</strong><small>${o.queueDepth ?? 0} planlı</small></a>
            </div>
        </div>

        <div class="panel">
          <div class="panel__head">
            <h2>Yaklaşan e-postalar</h2>
            <a class="btn btn--ghost btn--sm" href="#emails">E-posta kuyruğu</a>
          </div>
          <table class="table table--compact">
            <thead><tr><th>Ne zaman</th><th>Müşteri</th><th>Tür</th><th>Konu</th><th></th></tr></thead>
            <tbody>${queueRows}</tbody>
          </table>
        </div>
      `;
      view.querySelector('[data-action="new-category"]')?.addEventListener("click", showCategoryModal);
      view.querySelector('[data-action="new-stock"]')?.addEventListener("click", showStockModal);
    },
  });

  const kpi = (label, value, variant = "") =>
    `<div class="card ${variant ? `card--${variant}` : ""}">
      <h3>${escapeHtml(label)}</h3>
      <div class="value">${value ?? 0}</div>
    </div>`;

  const removePlatform = async (id, name) => {
    let force = false;
    try {
      await api(`/api/platforms/${id}`, { method: "DELETE" });
      flash("Platform silindi");
      location.hash = "#platforms";
      await refreshView();
    } catch (err) {
      if (/kategori var/i.test(err.message) && confirm(`${err.message}\n\n“${name}” yine de listeden kaldırılsın mı? (Kategoriler kalır)`)) {
        force = true;
      } else {
        flash(err.message, "error");
        return;
      }
    }
    if (force) {
      try {
        await api(`/api/platforms/${id}?force=1`, { method: "DELETE" });
        flash("Platform zorla kaldırıldı — kategorileri başka platforma taşıyın");
        location.hash = "#platforms";
        await refreshView();
      } catch (e2) {
        flash(e2.message, "error");
      }
    }
  };

  // ─── Platforms ─────────────────────────────────────────────────────────────
  register("platforms", {
    title: "Platformlar",
    subtitle: "Satış yaptığınız siteler (ItemSatış, G2G…). Kategori ve stoklar buna bağlı.",
    render: async (rest) => {
      if (rest[0]) return renderPlatformDetail(rest[0]);
      const plats = await api("/api/platforms");
      view.innerHTML = `
        <div class="bulk-bar" data-bulk-bar hidden>
          <span data-bulk-count>0 ${t("bulkDelete")}</span>
          <button type="button" class="btn btn--danger btn--sm" data-bulk-del>${t("bulkDelete")}</button>
        </div>
        <div class="panel">
          <div class="panel__head">
            <h2>${plats.length} ${t("platforms")}</h2>
            <button class="btn btn--primary btn--sm" data-action="new-platform">+ ${t("newPlatform")}</button>
          </div>
          <table class="table" id="platTable">
            <thead><tr><th style="width:36px"><input type="checkbox" data-select-all></th><th>Ad</th><th>Slug</th><th>${t("rate")}</th><th>Link</th><th></th></tr></thead>
            <tbody>
              ${plats.map((p) => `
                <tr>
                  <td><input type="checkbox" data-row-id="${escapeHtml(p.id)}"></td>
                  <td><a class="link" href="#platforms/${escapeHtml(p.id)}">${escapeHtml(p.name)}</a></td>
                  <td><code>${escapeHtml(p.slug)}</code></td>
                  <td>${p.commissionPercent != null ? `${p.commissionPercent}%` : "—"}</td>
                  <td class="muted small">${p.storeUrl ? `<a class="link" href="${escapeHtml(p.storeUrl)}" target="_blank" rel="noopener">↗</a>` : "—"}</td>
                  <td class="row-actions">
                    <button class="btn btn--ghost btn--sm" data-plat-edit="${escapeHtml(p.id)}">${t("edit")}</button>
                    <button class="btn btn--danger btn--sm" data-plat-del="${escapeHtml(p.id)}">${t("delete")}</button>
                  </td>
                </tr>`).join("") || `<tr><td colspan="6" class="muted">—</td></tr>`}
            </tbody>
          </table>
        </div>`;
      bindBulkDelete({
        tableSel: "#platTable",
        apiPath: "/api/platforms/bulk-delete",
        confirmText: (n) => `${n} mağaza silinsin mi?`,
      });
      view.querySelector('[data-action="new-platform"]')?.addEventListener("click", showPlatformModal);
      view.querySelectorAll("[data-plat-edit]").forEach((b) =>
        b.addEventListener("click", () => {
          const p = plats.find((x) => x.id === b.dataset.platEdit);
          showRenamePlatformModal(b.dataset.platEdit, p);
        }),
      );
      view.querySelectorAll("[data-plat-del]").forEach((b) =>
        b.addEventListener("click", () => {
          const p = plats.find((x) => x.id === b.dataset.platDel);
          if (!confirm(`“${p?.name || "Platform"}” silinsin mi?`)) return;
          removePlatform(b.dataset.platDel, p?.name || "Platform");
        }),
      );
    },
  });

  const slugFromName = (name) =>
    String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 64);

  const showPlatformModal = () => {
    openModal(t("newPlatform"), `
      <form id="platForm" class="form">
        <label class="form__field"><span>Ad <em>*</em></span>
          <input name="name" id="platNameIn" required maxlength="80" placeholder="G2G, ItemSatış">
        </label>
        <label class="form__field"><span>Slug <em>*</em></span>
          <input name="slug" id="platSlugIn" required minlength="2" maxlength="64" pattern="[a-z0-9][a-z0-9-]*" placeholder="g2g">
        </label>
        <label class="form__field"><span>${t("commissionPercent")}</span>
          <input name="commissionPercent" type="number" min="0" max="100" step="0.1" placeholder="10">
          <p class="form__hint muted small">Muhasebede brütten düşülür (ör. ItemSatış %10).</p>
        </label>
        <label class="form__field"><span>${t("storeUrl")}</span>
          <input name="storeUrl" type="text" maxlength="200" placeholder="https://…">
          <p class="form__hint muted small">Mağaza linki varsa erişim maillerinin altında buton çıkar.</p>
        </label>
        <button type="submit" class="btn btn--primary">${t("save")}</button>
      </form>
    `);
    const nameIn = $("#platNameIn");
    const slugIn = $("#platSlugIn");
    let slugTouched = false;
    slugIn?.addEventListener("input", () => {
      slugTouched = true;
    });
    nameIn?.addEventListener("input", () => {
      if (!slugTouched && slugIn) slugIn.value = slugFromName(nameIn.value);
    });
    bindSubmit(modalBody.querySelector("#platForm"), async (fd) => {
      const data = Object.fromEntries(fd.entries());
      data.slug = slugFromName(data.slug || data.name);
      if (!data.slug || data.slug.length < 2) throw new Error("Slug zorunlu (ör. g2g)");
      await api("/api/platforms", { method: "POST", body: JSON.stringify(data) });
      flash("Platform kaydedildi");
      location.hash = "#platforms";
      await refreshView();
    });
  };

  const showRenamePlatformModal = (id, plat) => {
    const name = typeof plat === "string" ? plat : plat?.name;
    const storeUrl = typeof plat === "object" ? plat?.storeUrl || "" : "";
    const commissionPercent = typeof plat === "object" ? plat?.commissionPercent ?? "" : "";
    openModal(t("edit"), `
      <form id="platForm" class="form">
        <label class="form__field"><span>Ad</span><input name="name" value="${escapeHtml(name || "")}" required maxlength="80"></label>
        <label class="form__field"><span>${t("commissionPercent")}</span>
          <input name="commissionPercent" type="number" min="0" max="100" step="0.1" value="${escapeHtml(String(commissionPercent))}">
        </label>
        <label class="form__field"><span>${t("storeUrl")}</span>
          <input name="storeUrl" type="text" maxlength="200" value="${escapeHtml(storeUrl)}" placeholder="https://…">
        </label>
        <button type="submit" class="btn btn--primary">${t("save")}</button>
      </form>
    `);
    bindSubmit(modalBody.querySelector("#platForm"), async (fd) => {
      const data = Object.fromEntries(fd.entries());
      await api(`/api/platforms/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      flash("Kaydedildi");
      await refreshView();
    });
  };

  async function renderPlatformDetail(id) {
    const data = await api(`/api/platforms/${id}`);
    const cats = data.categories || [];
    view.innerHTML = `
      ${detailHeader(
        "#platforms",
        escapeHtml(data.name),
        `<code>${escapeHtml(data.slug)}</code> · ${cats.length} kategori${data.storeUrl ? ` · <a class="link" href="${escapeHtml(data.storeUrl)}" target="_blank" rel="noopener">Mağaza</a>` : ""}`,
        `<button type="button" class="btn btn--ghost btn--sm" id="platDetailEdit">Düzenle</button>
         <button type="button" class="btn btn--danger btn--sm" id="platDetailDel">Sil</button>`,
      )}
      <div class="panel">
        <div class="panel__head"><h2>Kategoriler</h2>
          <button class="btn btn--primary btn--sm" data-new-cat-platform="${escapeHtml(id)}">+ Kategori</button>
        </div>
        <table class="table">
          <thead><tr><th>Ad</th><th>Slug</th><th></th></tr></thead>
          <tbody>
            ${cats.map((c) => `
              <tr>
                <td>${escapeHtml(c.name)}</td>
                <td><code>${escapeHtml(c.slug)}</code></td>
                <td><a class="btn btn--ghost btn--sm" href="#stocks">Stoklar</a></td>
              </tr>`).join("") || `<tr><td colspan="3" class="muted">Bu platformda kategori yok.</td></tr>`}
          </tbody>
        </table>
      </div>`;
    view.querySelector("[data-new-cat-platform]")?.addEventListener("click", () =>
      showCategoryModal({ platformId: id }),
    );
    $("#platDetailEdit")?.addEventListener("click", () => showRenamePlatformModal(id, data));
    $("#platDetailDel")?.addEventListener("click", () => {
      if (!confirm(`“${data.name}” silinsin mi?`)) return;
      removePlatform(id, data.name);
    });
  }

  // ─── Categories ────────────────────────────────────────────────────────────
  register("categories", {
    title: "Categories",
    subtitle: "Stoklarınızı gruplayan klasörler — her kategori bir platforma bağlı.",
    render: async () => {
      const cats = await api("/api/categories");
      if (!Array.isArray(cats)) throw new Error("Kategori listesi alınamadı");
      view.innerHTML = `
        <div class="panel">
          <div class="panel__head">
            <h2>${cats.length} ${cats.length === 1 ? "category" : "categories"}</h2>
            <div class="flex" style="gap:8px;flex-wrap:wrap;align-items:center">
              <div class="bulk-bar" data-bulk-bar hidden>
                <label class="small" style="display:inline-flex;align-items:center;gap:6px">
                  <input type="checkbox" data-select-all> Tümü
                </label>
                <span data-bulk-count class="muted small">0 seçili</span>
                <button type="button" class="btn btn--danger btn--sm" data-bulk-del>Seçilenleri sil</button>
              </div>
              <button class="btn btn--primary btn--sm" data-action="new-category">+ Yeni kategori</button>
            </div>
          </div>
          <table class="table" id="catTable">
            <thead><tr><th style="width:36px"></th><th>Name</th><th>Platform</th><th>Slug</th><th>Created</th><th></th></tr></thead>
            <tbody>
              ${cats.map((c) => `
                <tr>
                  <td><input type="checkbox" data-row-id="${escapeHtml(c.id)}"></td>
                  <td>${escapeHtml(c.name)}</td>
                  <td class="muted small">${c.platformId ? `<a class="link" href="#platforms/${escapeHtml(c.platformId)}">${escapeHtml(c.platformName || "Platform")}</a>` : "—"}</td>
                  <td><code>${escapeHtml(c.slug)}</code></td>
                  <td class="muted small">${new Date(c.createdAt).toLocaleString()}</td>
                  <td class="row-actions">
                    <button class="btn btn--ghost btn--sm" data-edit="${c.id}">Rename</button>
                    <button class="btn btn--danger btn--sm" data-del="${c.id}">Delete</button>
                  </td>
                </tr>`).join("") || `<tr><td colspan="6" class="muted">No categories yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
      bindBulkDelete({
        tableSel: "#catTable",
        apiPath: "/api/categories/bulk-delete",
        confirmText: (n) => `${n} kategori ve içindeki stoklar silinsin mi?`,
      });
      view.querySelector('[data-action="new-category"]').addEventListener("click", showCategoryModal);
      view.querySelectorAll("[data-edit]").forEach((b) =>
        b.addEventListener("click", () => showRenameCategoryModal(b.dataset.edit, cats.find((c) => c.id === b.dataset.edit)?.name)),
      );
      view.querySelectorAll("[data-del]").forEach((b) =>
        b.addEventListener("click", async () => {
          if (!confirm("Delete this category and all its stocks?")) return;
          await api(`/api/categories/${b.dataset.del}`, { method: "DELETE" });
          flash("Kategori silindi");
          await refreshView();
        }),
      );
    },
  });

  const showCategoryModal = async ({ platformId: presetPlatformId } = {}) => {
    const platforms = await api("/api/platforms");
    if (!platforms.length) {
      flash("Önce Platformlar sayfasından en az bir satış platformu ekleyin", "error");
      location.hash = "#platforms";
      showPlatformModal();
      return;
    }
    const platOptions = platforms
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}"${p.id === presetPlatformId ? " selected" : ""}>${escapeHtml(p.name)}</option>`,
      )
      .join("");
    openModal("Yeni kategori", `
      <form id="catForm" class="form">
        <label class="form__field"><span>Platform <em>*</em></span>
          <select name="platformId" required>
            <option value="" disabled${presetPlatformId ? "" : " selected"}>Platform seçin…</option>
            ${platOptions}
          </select>
          <p class="form__hint muted small">Listede yalnızca sizin eklediğiniz platformlar görünür.</p>
        </label>
        <label class="form__field"><span>İsim <em>*</em></span>
          <input name="name" id="catNameIn" required maxlength="80" placeholder="Netflix">
        </label>
        <label class="form__field"><span>Slug <em>*</em></span>
          <input name="slug" id="catSlugIn" required minlength="2" maxlength="64" pattern="[a-z0-9][a-z0-9-]*" placeholder="netflix">
          <p class="form__hint muted small">Public link yolu: <code>/r/<span id="catSlugPreview">…</span>/kod</code> — sadece küçük harf, rakam, tire.</p>
        </label>
        <button type="submit" class="btn btn--primary">Oluştur</button>
      </form>
    `);
    const nameIn = $("#catNameIn");
    const slugIn = $("#catSlugIn");
    const slugPreview = $("#catSlugPreview");
    let slugTouched = false;
    slugIn?.addEventListener("input", () => {
      slugTouched = true;
      if (slugPreview) slugPreview.textContent = slugIn.value || "…";
    });
    nameIn?.addEventListener("input", () => {
      if (!slugTouched && slugIn) {
        slugIn.value = slugFromName(nameIn.value);
        if (slugPreview) slugPreview.textContent = slugIn.value || "…";
      }
    });
    bindSubmit(modalBody.querySelector("#catForm"), async (fd) => {
      const data = Object.fromEntries(fd.entries());
      data.slug = slugFromName(data.slug);
      if (!data.slug || data.slug.length < 2) throw new Error("Slug zorunlu (ör. netflix)");
      await api("/api/categories", { method: "POST", body: JSON.stringify(data) });
      flash("Kategori kaydedildi");
      location.hash = "#categories";
      await refreshView();
    });
  };

  const showRenameCategoryModal = (id, name) => {
    openModal("Kategori adını değiştir", `
      <form id="catForm" class="form">
        <label class="form__field"><span>İsim</span><input name="name" value="${escapeHtml(name || "")}" required maxlength="80"></label>
        <button type="submit" class="btn btn--primary">Kaydet</button>
      </form>
    `);
    bindSubmit(modalBody.querySelector("#catForm"), async (fd) => {
      const data = Object.fromEntries(fd.entries());
      await api(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      flash("Kaydedildi");
      await refreshView();
    });
  };

  // ─── Stocks ────────────────────────────────────────────────────────────────
  const stockStatusBadge = (status) => {
    const map = {
      pending: ["badge--warn", "Bekliyor — linke tıklanmadı"],
      active: ["badge--ok", "Aktif"],
      expired: ["badge--danger", "Süresi doldu"],
      maxed: ["badge--muted", "Tıklama limiti doldu"],
      no_token: ["badge--muted", "Mail / token yok"],
    };
    const [cls, label] = map[status] || ["badge--muted", status || "—"];
    return `<span class="badge ${cls}">${label}</span>`;
  };

  const formatRemainMs = (ms) => {
    if (ms == null) return "—";
    if (ms <= 0) return "Süresi dolmuş";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h >= 48) return `${Math.floor(h / 24)} gün`;
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
  };

  const deliveryEmailBadge = (info) => {
    if (!info) return `<span class="badge badge--muted">—</span>`;
    const cls =
      info.variant === "ok"
        ? "badge--ok"
        : info.variant === "danger"
          ? "badge--danger"
          : "badge--warn";
    const err = info.error ? `<br><span class="muted small">${escapeHtml(info.error)}</span>` : "";
    return `<span class="badge ${cls}">${escapeHtml(info.short || info.label)}</span>${err}`;
  };

  const journeyCheck = (ok, label) =>
    `<li class="small" style="margin:4px 0">${ok ? "✅" : "⭕"} ${escapeHtml(label)}</li>`;

  async function renderStockDetail(id) {
    const data = await api(`/api/stocks/${id}/insights`);
    const { stock, summary, recipients, customerJourney: j, lifecycleSchedule } = data;
    const catName = stock.categoryName || stock.categoryId?.slice(0, 8) || "—";
    const unused = summary.unusedStock;
    const formClaimed = summary.leadFormClaimed;

    const recipientRows =
      recipients.length === 0
        ? `<tr><td colspan="8" class="muted">Henüz bu stoka lead / mail yok — stok boşta.</td></tr>`
        : recipients
          .map(
            (r) => `
        <tr class="recipient-row" data-lead="${escapeHtml(r.leadId || "")}">
          <td>
            <strong>${escapeHtml(r.customerName || "—")}</strong><br>
            <a class="link small" href="#customers/${escapeHtml(r.customerId)}">${escapeHtml(r.customerEmail || "—")}</a>
          </td>
          <td class="muted small">${r.leadCreatedAt ? new Date(r.leadCreatedAt).toLocaleString("tr-TR") : "—"}</td>
          <td>${stockStatusBadge(r.status)}</td>
          <td>${r.used ?? 0}${r.maxVisits != null ? ` / ${r.maxVisits}` : ""}${r.clicksLeft != null ? `<br><span class="muted small">${r.clicksLeft} kalan</span>` : ""}</td>
          <td class="muted small">${formatRemainMs(r.expiresInMs)}</td>
          <td class="muted small">${deliveryEmailBadge(r.accessEmailDeliveryInfo)}${r.clickedAccessLink ? `<br><span class="badge badge--ok">Linke tıkladı</span>` : r.accessEmailDelivery === "sent" ? `<br><span class="muted small">Tıklanmadı</span>` : ""}</td>
          <td data-stop class="muted small">
            ${r.accessUrl ? linkActionBar(r.accessUrl, { compact: true }) : "—"}
          </td>
          <td data-stop>
            ${r.token ? `<button type="button" class="btn btn--ghost btn--sm" data-token-edit="${escapeHtml(r.token)}" data-max="${r.maxVisits ?? ""}" data-used="${r.used ?? 0}">Limit</button>` : ""}
            ${r.leadId ? `<a class="btn btn--ghost btn--sm" href="#leads/${escapeHtml(r.leadId)}">Lead</a>` : ""}
          </td>
        </tr>`,
          )
          .join("");

    view.innerHTML = `
      ${detailHeader(
      "#stocks",
      escapeHtml(stock.name),
      `${escapeHtml(catName)} · ${summary.leads} lead · ${summary.totalClicks} tıklama · ${summary.publicVisits} public ziyaret`,
      `${actionBtn("Düzenle", "btn--ghost", `data-stock-edit="${escapeHtml(stock.id)}"`)}
         ${actionBtn("Kopyala", "btn--ghost", `data-copy="${escapeHtml(fullPublicUrl(stock))}"`)}`,
    )}
      ${unused ? `<div class="panel panel--warn" style="margin-bottom:12px"><p class="small" style="margin:0">📦 Bu stok henüz kimseye atanmadı — form kullanılmadı.</p></div>` : ""}
      ${formClaimed ? `<div class="panel panel--ok" style="margin-bottom:12px">
        <p class="small" style="margin:0 0 10px"><strong>🔒 Bu stokun formu kilitli</strong>${summary.leadClaimedEmail ? ` — kayıtlı e-posta: <strong>${escapeHtml(summary.leadClaimedEmail)}</strong>` : ""}${summary.leadClaimedAt ? ` · ${new Date(summary.leadClaimedAt).toLocaleString("tr-TR")}` : ""}</p>
        <div class="muted small" style="line-height:1.6;margin:0 0 12px;padding:12px;background:rgba(15,23,42,0.35);border-radius:10px;border:1px solid rgba(148,163,184,0.15)">
          <p style="margin:0 0 10px"><strong>Form kilidi nedir?</strong><br>
          ItemSatış’tan aldığınız her stok linki (<code>/r/...</code>) <strong>tek müşteriye</strong> aittir. Birisi ad + e-posta yazıp gönderince sistem o linki kapatır; başka biri veya aynı kişi farklı maille tekrar form göremez — “Bu link kullanıldı” yazar. Böylece aynı satış iki kez mail almaz.</p>
          <p style="margin:0 0 10px"><strong>“Form kilidini sıfırla” ne yapar?</strong><br>
          Sadece bu kilidi <strong>kaldırır</strong>. Aynı public link yeniden form açılır; müşteri (veya siz test için) <strong>yeni bir e-posta</strong> ile tekrar “erişim maili gönder” diyebilir. Yeni mail gider.</p>
          <p style="margin:0 0 10px"><strong>Ne yapmaz?</strong><br>
          Eski mailleri silmez · lead kayıtlarını silmez · maildeki eski /access/ linklerini iptal etmez · yeni stok oluşturmaz.</p>
          <p style="margin:0 0 10px"><strong>İkinci kez form gönderilirse ne olur?</strong><br>
          Kilidi sıfırladıktan sonra müşteri tekrar form doldurursa mail gider ve link <strong>yeniden kilitlenir</strong>. Toplam kaç kez form gönderildiği stokta tutulur${summary.leadClaimCount != null ? ` (şu an: <strong>${summary.leadClaimCount}</strong> kez)` : ""}.</p>
          <p style="margin:0"><strong>Ne zaman kullanılır?</strong><br>
          Müşteri yanlış e-posta yazdı · mail gitmedi (panelde “gönderilemedi” görüyorsanız) · destek için aynı linke tekrar form açtırmak istiyorsanız. Normal satışta çoğu stokta sıfırlamaya gerek yok.</p>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" id="clearLeadClaimBtn">Form kilidini sıfırla (aynı linki yeniden aç)</button>
      </div>` : ""}
      <div class="panel" style="margin-bottom:12px">
        <h3 class="meta-card__title" style="margin:0 0 10px">Müşteri yolculuğu (destek)</h3>
        <p class="muted small" style="margin:0 0 8px">Ürün süresi (otomatik mailler): <strong>${escapeHtml(summary.productDurationLabel || "—")}</strong> — stok oluştururken seçtiğiniz gün/ay.</p>
        <ul style="margin:0;padding-left:0;list-style:none">
          ${journeyCheck(j?.publicLinkOpened, `Public link açıldı (${j?.publicVisitCount ?? 0} ziyaret)${summary.lastPublicVisitAt ? ` · son: ${new Date(summary.lastPublicVisitAt).toLocaleString("tr-TR")}` : ""}`)}
          ${journeyCheck(j?.formSubmitted, `Form gönderildi${j?.formSubmittedAt ? ` · ${new Date(j.formSubmittedAt).toLocaleString("tr-TR")}` : ""}`)}
          ${journeyCheck(j?.accessEmailDelivery?.key === "sent", `Erişim maili Resend ile gitti${j?.accessEmailDelivery?.sentAt ? ` · ${new Date(j.accessEmailDelivery.sentAt).toLocaleString("tr-TR")}` : ""}`)}
          ${journeyCheck(j?.accessEmailDelivery?.key === "logged_only", "Uyarı: mail sadece log (Resend kapalı)")}
          ${journeyCheck(j?.accessEmailDelivery?.key === "failed", "Erişim maili HATA ile düştü")}
          ${journeyCheck(j?.clickedAccessEmailLink, "Maildeki gizli linke tıkladı")}
        </ul>
        ${j?.customerClaimLikelyTrue ? `<p class="small" style="margin:10px 0 0;padding:10px;background:rgba(99,102,241,0.08);border-radius:8px"><strong>Özet:</strong> ${escapeHtml(j.customerClaimLikelyTrue)}</p>` : ""}
      </div>
      ${(lifecycleSchedule || []).length ? `
      <div class="panel panel--flush" style="margin-bottom:12px">
        <div class="panel__head"><h3>Otomatik mail takvimi (${escapeHtml(summary.productDurationLabel || "")})</h3></div>
        <p class="muted small" style="padding:0 12px 8px">${escapeHtml(data.lifecycleScheduleNote || "")}</p>
        <table class="table table--compact">
          <thead><tr><th>Mail</th><th>Planlanan</th></tr></thead>
          <tbody>
            ${lifecycleSchedule.map((row) => `
              <tr>
                <td class="small">${escapeHtml(row.label)}</td>
                <td class="muted small">${new Date(row.dueAt).toLocaleString("tr-TR")}${row.relativeNote ? `<br>${escapeHtml(row.relativeNote)}` : ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : ""}
      <div class="stat-row" style="margin-bottom:16px">
        <div class="stat-card"><span class="stat-card__label">Lead</span><strong>${summary.leads}</strong></div>
        <div class="stat-card"><span class="stat-card__label">Bekleyen link</span><strong>${summary.pending}</strong></div>
        <div class="stat-card"><span class="stat-card__label">Aktif</span><strong>${summary.active}</strong></div>
        <div class="stat-card"><span class="stat-card__label">Süresi dolan</span><strong>${summary.expired}</strong></div>
        <div class="stat-card"><span class="stat-card__label">Limit dolan</span><strong>${summary.maxed}</strong></div>
      </div>
      <div class="detail-grid">
        <div class="detail-grid__main">
          <div class="panel panel--flush">
            <div class="panel__head"><h3>Alıcılar & erişim</h3></div>
            <table class="table table--hover">
              <thead><tr><th>Müşteri</th><th>Form</th><th>Durum</th><th>Tıklama</th><th>Kalan süre</th><th>Erişim maili</th><th>Mail linki</th><th></th></tr></thead>
              <tbody>${recipientRows}</tbody>
            </table>
          </div>
          ${recipients
        .filter((r) => r.device)
        .map(
          (r) => `
          <div style="margin-top:12px">
            <p class="muted small" style="margin:0 0 6px"><strong>${escapeHtml(r.customerName || r.customerEmail || "Cihaz")}</strong></p>
            ${metaCard(r.device, "Form / tıklama cihazı")}
          </div>`,
        )
        .join("")}
        </div>
        <div class="detail-grid__side">
          <div class="meta-card">
            <h3 class="meta-card__title">Public link (müşteriye ver)</h3>
            <p class="muted small">ItemSatış formu — <code>${escapeHtml(data.links?.publicPath || "")}</code></p>
            <p class="muted small">${escapeHtml(data.links?.domainNote || "")}</p>
            ${linkActionBar(data.links?.publicUrl || fullPublicUrl(stock))}
          </div>
          <div class="meta-card">
            <h3 class="meta-card__title">Mail erişim linki</h3>
            <p class="muted small">${escapeHtml(data.emailPreview?.note || "")}</p>
            <p class="muted small"><strong>Önizleme token</strong> (gerçek mailde değişir):</p>
            ${linkActionBar(data.links?.previewAccessUrl || data.links?.accessUrlExample)}
            ${(data.links?.sentAccessLinks || []).length ? `
              <p class="muted small" style="margin-top:12px"><strong>Gönderilmiş gerçek linkler</strong></p>
              <ul class="sent-links-list">
                ${data.links.sentAccessLinks.map((s) => `
                  <li style="margin-bottom:10px">
                    <span class="small">${escapeHtml(s.customerName || s.customerEmail || "—")} · ${s.leadCreatedAt ? new Date(s.leadCreatedAt).toLocaleString("tr-TR") : ""}</span><br>
                    ${linkActionBar(s.accessUrl, { compact: true })}
                  </li>`).join("")}
              </ul>` : `<p class="muted small">Henüz müşteriye gitmiş /access/ linki yok — form doldurulunca burada listelenir.</p>`}
            <p class="muted small">Gönderim: ${data.emailDelivery?.live ? "canlı (Resend)" : `log (${data.emailDelivery?.driver || "—"})`}</p>
          </div>
          <div class="meta-card meta-card--wide">
            <h3 class="meta-card__title">E-posta önizleme</h3>
            <p class="muted small"><strong>Konu:</strong> ${escapeHtml(data.emailPreview?.subject || "—")}</p>
            <div class="email-preview-box" id="stockEmailPreview"></div>
          </div>
          <div class="meta-card">
            <h3 class="meta-card__title">Stok varsayılanları</h3>
            <p class="muted small">Yeni maillerde geçerli. Mevcut token için satırdaki Limit.</p>
            <form id="stockDefaultsForm" class="form" style="margin-top:10px">
              <label class="form__field"><span>Erişim süresi (saat)</span>
                <input name="accessLinkTtlHours" type="number" min="1" value="${stock.accessLinkTtlHours ?? 48}">
              </label>
              <label class="form__field"><span>Maks. tıklama</span>
                <input name="accessMaxVisits" type="number" min="1" placeholder="boş = sınırsız" value="${stock.accessMaxVisits ?? ""}">
              </label>
              <button type="submit" class="btn btn--primary btn--sm">Kaydet</button>
            </form>
          </div>
        </div>
      </div>
    `;

    bindLinkActions();
    $("#clearLeadClaimBtn")?.addEventListener("click", async () => {
      if (!confirm(
        "Form kilidi kaldırılsın mı?\\n\\n" +
        "• Aynı /r/ linki tekrar form gösterecek\\n" +
        "• Yeni e-posta ile yeni erişim maili istenebilecek\\n" +
        "• Eski mailler ve kayıtlar silinmeyecek\\n\\n" +
        "Devam edilsin mi?",
      )) return;
      try {
        await api(`/api/stocks/${stock.id}`, { method: "PATCH", body: { clearLeadClaim: true } });
        toast("Form kilidi sıfırlandı");
        renderStockDetail(stock.id);
      } catch (e) {
        toast(e.message || "Hata", "error");
      }
    });
    const previewBox = $("#stockEmailPreview");
    if (previewBox && data.emailPreview?.html) {
      previewBox.innerHTML = data.emailPreview.html;
    }
    view.querySelector(`[data-stock-edit="${stock.id}"]`)?.addEventListener("click", () =>
      showStockModal(stock),
    );
    bindSubmit($("#stockDefaultsForm"), async (fd) => {
      const body = Object.fromEntries(fd.entries());
      if (!body.accessMaxVisits) delete body.accessMaxVisits;
      await api(`/api/stocks/${stock.id}`, { method: "PATCH", body: JSON.stringify(body) });
      flash("Stok varsayılanları güncellendi");
      await refreshView();
    });
    view.querySelectorAll("[data-token-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const token = btn.dataset.tokenEdit;
        openModal("Token limiti / süre", `
          <form id="tokenPatchForm" class="form">
            <p class="muted small">Kullanılan: <strong>${btn.dataset.used}</strong></p>
            <label class="form__field"><span>Maks. tıklama</span>
              <input name="maxVisits" type="number" min="0" value="${escapeHtml(btn.dataset.max)}" placeholder="boş = sınırsız">
            </label>
            <label class="form__field"><span>Süre uzat (saat)</span>
              <input name="addTtlHours" type="number" value="0" placeholder="0 = değişmez">
            </label>
            <button type="submit" class="btn btn--primary">Güncelle</button>
          </form>
        `);
        bindSubmit($("#tokenPatchForm"), async (fd) => {
          const patch = Object.fromEntries(fd.entries());
          if (!patch.maxVisits) patch.maxVisits = null;
          if (!patch.addTtlHours || Number(patch.addTtlHours) === 0) delete patch.addTtlHours;
          await api(`/api/stocks/${stock.id}/tokens/${token}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          });
          closeModal();
          flash("Token güncellendi");
          await refreshView();
        });
      });
    });
    bindDetailBack();
  }

  register("stocks", {
    title: "Stocks & Links",
    subtitle: "Kategoriye göre gruplanmış stoklar — satıra tıklayınca detay.",
    render: async (rest) => {
      if (rest?.[0]) return renderStockDetail(rest[0]);
      const [stocks, cats] = await Promise.all([fetchStocksList(false), api("/api/categories")]);
      const byCat = Object.fromEntries(cats.map((c) => [c.id, c.name]));
      const grouped = {};
      for (const s of stocks) {
        const cid = s.categoryId || "_none";
        if (!grouped[cid]) grouped[cid] = [];
        grouped[cid].push(s);
      }
      const catOrder = [
        ...cats.map((c) => c.id),
        ...Object.keys(grouped).filter((id) => !cats.some((c) => c.id === id)),
      ];
      const groupHtml = catOrder
        .filter((cid) => grouped[cid]?.length)
        .map((cid) => {
          const items = grouped[cid].sort((a, b) => (b.name || "").localeCompare(a.name || "", "tr"));
          const label = byCat[cid] || "Kategorisiz";
          return `
          <details class="stock-group">
            <summary class="stock-group__head">
              <span class="stock-group__title">${escapeHtml(label)}</span>
              <span class="badge badge--muted">${items.length} stok</span>
              <button type="button" class="btn btn--ghost btn--sm" data-export-cat="${escapeHtml(cid)}" data-stop title="Kategori dışa aktar">📤 İndir</button>
            </summary>
            <table class="table table--hover stock-group__table">
              <thead><tr><th style="width:36px"></th><th>Ad</th><th>Link</th><th>Mail linki</th><th>Ürün</th><th>Lead</th><th></th></tr></thead>
              <tbody>
                ${items
              .map(
                (s) => `
                <tr class="row-clickable" data-id="${escapeHtml(s.id)}" title="Detay için tıkla">
                  <td data-stop><input type="checkbox" data-row-id="${escapeHtml(s.id)}"></td>
                  <td><strong>${escapeHtml(s.name)}</strong></td>
                  <td data-stop>${linkActionBar(fullPublicUrl(s), { compact: true })}</td>
                  <td class="muted small">${formatAccessTtl(s)}</td>
                  <td class="muted small">${formatProductTtl(s)}</td>
                  <td>${s.leads || 0}</td>
                  <td class="row-actions" data-stop>
                    <button class="btn btn--ghost btn--sm" data-edit="${s.id}">Edit</button>
                    <button class="btn btn--danger btn--sm" data-del="${s.id}">Sil</button>
                  </td>
                </tr>`,
              )
              .join("")}
              </tbody>
            </table>
          </details>`;
        })
        .join("");

      view.innerHTML = `
        ${stocks.length && loadStockCache().length > stocks.length ? `
        <div class="panel panel--warn" style="margin-bottom:12px">
          <p class="small" style="margin:0">
            KV günlük kotası dolmuş olabilir — sunucu listesi boş; tarayıcıda kayıtlı <strong>${stocks.length}</strong> stok gösteriliyor.
            Kota sıfırlanınca <strong>Listeyi KV'den yenile</strong> ile birleştirin.
          </p>
        </div>` : ""}
        <div class="panel">
          <div class="panel__head">
            <h2>${stocks.length} stocks</h2>
            <div class="flex" style="gap:8px;flex-wrap:wrap;align-items:center">
              <div class="bulk-bar" data-bulk-bar hidden>
                <label class="small" style="display:inline-flex;align-items:center;gap:6px">
                  <input type="checkbox" data-select-all> Tümü
                </label>
                <span data-bulk-count class="muted small">0 seçili</span>
                <label class="small muted" style="display:inline-flex;align-items:center;gap:4px" title="Lead alınmamış stoklar">
                  <input type="checkbox" data-export-unused-only> Sadece boş
                </label>
                <select class="form__field btn--sm" data-export-format style="padding:6px 8px;max-width:200px" title="Dışa aktarma formatı">
                  <option value="txt">TXT (satır = link)</option>
                  <option value="csv">CSV</option>
                  <option value="tsv">TSV (ad + link)</option>
                </select>
                <button type="button" class="btn btn--ghost btn--sm" data-bulk-export>📤 Dışa aktar</button>
                <button type="button" class="btn btn--danger btn--sm" data-bulk-del>Seçilenleri sil</button>
              </div>
              <button type="button" class="btn btn--ghost btn--sm" data-action="refresh-stocks" title="GET ile meta senkron — silinenler düşer">↻ Listeyi yenile</button>
              <button type="button" class="btn btn--ghost btn--sm" data-action="repair-stocks" title="KV list kotası varsa tam tarama">KV tam tarama</button>
              <button class="btn btn--ghost btn--sm" data-action="bulk-stock">+ Toplu stok</button>
              <button class="btn btn--primary btn--sm" data-action="new-stock">+ Tek stok</button>
            </div>
          </div>
          <div id="stockBulkRoot" class="stock-groups">
            ${groupHtml || `<p class="muted" style="padding:16px 20px">Henüz stok yok — tek veya toplu stok ekleyin.</p>`}
          </div>
        </div>
      `;
      const bulkRoot = view.querySelector("#stockBulkRoot");
      const bar = view.querySelector("[data-bulk-bar]");
      if (bulkRoot && bar) {
        const selectAll = bar.querySelector("[data-select-all]");
        const countEl = bar.querySelector("[data-bulk-count]");
        const delBtn = bar.querySelector("[data-bulk-del]");
        const exportBtn = bar.querySelector("[data-bulk-export]");
        const unusedOnly = bar.querySelector("[data-export-unused-only]");
        const rowChecks = () => [...bulkRoot.querySelectorAll("input[data-row-id]")];
        const selectedIds = () => rowChecks().filter((c) => c.checked).map((c) => c.dataset.rowId);
        const syncBar = () => {
          const n = selectedIds().length;
          bar.hidden = n === 0;
          if (countEl) countEl.textContent = `${n} seçili`;
        };
        selectAll?.addEventListener("change", () => {
          rowChecks().forEach((c) => { c.checked = selectAll.checked; });
          syncBar();
        });
        rowChecks().forEach((c) => c.addEventListener("change", syncBar));
        exportBtn?.addEventListener("click", async () => {
          const ids = selectedIds();
          if (!ids.length) return;
          await requestStockExport({
            ids,
            onlyUnused: Boolean(unusedOnly?.checked),
            format: getStockExportFormat(),
          });
        });
        delBtn?.addEventListener("click", async () => {
          const ids = selectedIds();
          if (!ids.length) return;
          if (!confirm(`${ids.length} stok silinsin mi?`)) return;
          const res = await api("/api/stocks/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) });
          forgetStocks(ids);
          flash(`${res.deleted} kayıt silindi`);
          await refreshView();
        });
      }
      bindRowNav(".row-clickable", (id) => `#stocks/${id}`);
      view.querySelector('[data-action="new-stock"]').addEventListener("click", () => showStockModal());
      view.querySelector('[data-action="bulk-stock"]')?.addEventListener("click", () => showStockModal(null, { bulk: true }));
      view.querySelectorAll("[data-export-cat]").forEach((b) => {
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          requestStockExport({ categoryId: b.dataset.exportCat, format: getStockExportFormat() });
        });
      });
      view.querySelector('[data-action="refresh-stocks"]')?.addEventListener("click", async () => {
        try {
          const list = await fetchStocksList(true);
          flash(`${list.length} stok (GET senkron)`);
          await refreshView();
        } catch (e) {
          flash(e.message || "Liste alınamadı", "error");
        }
      });
      view.querySelector('[data-action="repair-stocks"]')?.addEventListener("click", async () => {
        try {
          const res = await api("/api/stocks/repair", { method: "POST" });
          if (res.items?.length) saveStockCache(res.items);
          flash(res.repaired ? `${res.repaired} stok (KV list taraması)` : "KV'de stok bulunamadı");
          await refreshView();
        } catch (e) {
          flash(e.message || "Tarama başarısız — KV kotası dolu olabilir", "error");
        }
      });
      bindLinkActions();
      view.querySelectorAll("[data-edit]").forEach((b) =>
        b.addEventListener("click", () => showStockModal(stocks.find((s) => s.id === b.dataset.edit))),
      );
      view.querySelectorAll("[data-del]").forEach((b) =>
        b.addEventListener("click", async () => {
          if (!confirm("Bu stok silinsin mi?")) return;
          const id = b.dataset.del;
          await api(`/api/stocks/${id}`, { method: "DELETE" });
          forgetStocks([id]);
          flash("Stok silindi");
          await fetchStocksList(true);
          await refreshView();
        }),
      );
    },
  });

  const formatAccessTtl = (s) => {
    const h = s.accessLinkTtlHours ?? (s.accessLinkTtlDays ? s.accessLinkTtlDays * 24 : null);
    if (!h) return "48s (varsayılan)";
    const max = s.accessMaxVisits != null ? ` · max ${s.accessMaxVisits} tık` : "";
    return h < 24 ? `${h} saat${max}` : `${Math.round(h / 24)} gün${max}`;
  };
  const formatProductTtl = (s) => {
    if (s.productDurationMonths) return `${s.productDurationMonths} ay`;
    const d = s.productDurationDays ?? s.durationDays;
    return d ? `${d} gün` : "—";
  };

  const downloadTextFile = (filename, content) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const getStockExportFormat = () => view.querySelector("[data-export-format]")?.value || "txt";

  const requestStockExport = async ({ ids, categoryId, onlyUnused = false, format }) => {
    const fmt = format || getStockExportFormat();
    const res = await api("/api/stocks/export", {
      method: "POST",
      body: JSON.stringify({ ids, categoryId, onlyUnused, format: fmt }),
    });
    downloadTextFile(res.filename || `stok-linkleri.${fmt}`, res.content || "");
    const skip = res.skipped?.length || 0;
    const fmtLabel = (res.format || fmt).toUpperCase();
    flash(
      skip
        ? `${res.count} link ${fmtLabel} indirildi (${skip} atlandı)`
        : `${res.count} link ${fmtLabel} olarak indirildi`,
    );
    return res;
  };

  const showBulkResultModal = (items) => {
    const urlsOnly = items.map((s) => fullPublicUrl(s)).join("\n");
    const ids = items.map((s) => s.id).filter(Boolean);
    openModal(`${items.length} public link oluşturuldu`, `
      <p class="muted small">Her satır ayrı müşteri linki (<code>/r/…</code>). Mağazaya yüklemek için TXT, Excel için CSV veya TSV indirin.</p>
      <textarea id="bulkLinksOut" class="form__field" rows="${Math.min(items.length + 2, 14)}" readonly style="width:100%;font-family:monospace;font-size:12px">${escapeHtml(urlsOnly)}</textarea>
      <div class="flex" style="gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
        <select id="bulkExportFormat" class="form__field" style="padding:8px;max-width:220px">
          <option value="txt">TXT — satır başına link</option>
          <option value="csv">CSV — url, ad, kod</option>
          <option value="tsv">TSV — ad + link</option>
        </select>
        <button type="button" class="btn btn--primary" id="downloadStockExport">📤 İndir</button>
        <button type="button" class="btn btn--ghost" id="copyBulkLinks">Kopyala</button>
        <button type="button" class="btn btn--ghost" data-close>Kapat</button>
      </div>
    `);
    modalBody.querySelector("#downloadStockExport")?.addEventListener("click", () => {
      const format = modalBody.querySelector("#bulkExportFormat")?.value || "txt";
      if (ids.length) requestStockExport({ ids, format });
      else downloadTextFile(`stok-linkleri-${items.length}.${format}`, `${urlsOnly}\n`);
    });
    modalBody.querySelector("#copyBulkLinks")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(urlsOnly);
        flash(`${items.length} link kopyalandı`);
      } catch {
        flash("Kopyalanamadı — metni seçip kopyalayın", "error");
      }
    });
  };

  const showStockModal = async (stockFromList, { bulk = false } = {}) => {
    const cats = await api("/api/categories");
    let stock = stockFromList;
    if (stockFromList?.id) {
      try {
        stock = await api(`/api/stocks/${stockFromList.id}`);
      } catch {
        stock = stockFromList;
      }
    }
    const isEdit = !!stock?.id;

    if (!cats.length && !isEdit) {
      openModal("Önce kategori gerekli", `
        <p class="muted">Stock eklemek için en az bir kategori oluşturun.</p>
        <button type="button" class="btn btn--primary" id="goCat">Kategori oluştur</button>
      `);
      $("#goCat")?.addEventListener("click", () => {
        closeModal();
        showCategoryModal();
      });
      return;
    }

    const accessHours = stock?.accessLinkTtlHours ?? 48;
    const accessUnit =
      stock?.accessLinkTtlDays != null ? "days" : accessHours >= 24 && accessHours % 24 === 0 ? "days" : "hours";
    const accessVal =
      accessUnit === "days" ? (stock?.accessLinkTtlDays ?? accessHours / 24) : accessHours;
    const prodMonths = stock?.productDurationMonths;
    const prodDays = stock?.productDurationDays ?? stock?.durationDays;
    const prodUnit = prodMonths ? "months" : "days";
    const prodVal = prodMonths ?? prodDays ?? "";

    const selectedCatId = stock?.categoryId && cats.some((c) => c.id === stock.categoryId)
      ? stock.categoryId
      : cats[0]?.id;

    const categoryBlock = `<div class="form__field">
          <span>Kategori <em>*</em> — birine tıkla</span>
          ${isEdit && stock?.categoryId && !cats.some((c) => c.id === stock.categoryId)
        ? `<p class="form__hint" style="color:var(--warn)">Eski kategori silinmiş — yeniden seçin.</p>`
        : ""}
          <div class="category-picker" id="categoryPicker">
            ${cats.map((c) => `
              <label class="category-pick">
                <input type="radio" name="categoryId" value="${escapeHtml(c.id)}" required
                  ${c.id === selectedCatId ? "checked" : ""}>
                <span>${escapeHtml(c.name)}</span>
              </label>`).join("")}
          </div>
        </div>`;

    openModal(isEdit ? "Stock düzenle" : bulk ? "Toplu stok / link" : "Yeni stock / link", `
      <form id="stockForm" class="form">
        ${categoryBlock}
        ${!isEdit && bulk ? `
        <label class="form__field"><span>Stok adı öneki <em>*</em></span>
          <input name="name" required maxlength="120" placeholder="Örn. Adobe CC — Müşteri" value="${escapeHtml(stock?.name || "")}">
          <p class="form__hint">Oluşan isimler: <strong>Önek #1</strong>, <strong>Önek #2</strong>, …</p>
        </label>
        <label class="form__field"><span>Kaç adet? <em>*</em></span>
          <input name="bulkCount" type="number" min="2" max="100" required value="5">
          <p class="form__hint">Hepsi aynı gizli URL; her biri farklı public link (max 100). Sonra TXT / CSV / TSV indir.</p>
        </label>` : `
        <label class="form__field"><span>Stok adı <em>*</em></span>
          <input name="name" ${isEdit ? "" : "required"} maxlength="120" placeholder="Örn. Adobe Creative Cloud" value="${escapeHtml(stock?.name || "")}">
        </label>
        <label class="form__field"><span>Ürün anlatımı <em class="muted">mail & OpenAI</em></span>
          <textarea name="productGuide" rows="4" maxlength="4000" placeholder="Kurulum, hesap, dikkat…">${escapeHtml(stock?.productGuide || "")}</textarea>
        </label>`}
        <label class="form__field"><span>Gizli hedef URL <em>*</em></span>
          <input name="realUrl" required type="url" value="${escapeHtml(stock?.realUrl || "")}" placeholder="https://mega.nz/...">
          <p class="form__hint">Müşteriye <strong>tam public link</strong> ver (https://…/r/kod). Gizli hedef URL sadece sunucuda kalır.</p>
        </label>

        <p class="form__hint" style="margin:8px 0 0;font-weight:600;color:var(--text-dim)">1) E-postadaki erişim linki (/access/…)</p>
        <label class="form__field"><span>Erişim linki süresi <em>*</em></span>
          <p class="muted small">Süre, müşteri maildeki linke <strong>ilk tıkladığında</strong> başlar (stok bekletilebilir).</p>
          <input name="accessLinkTtlValue" type="number" min="1" required value="${accessVal}" placeholder="25">
        </label>
        <div class="form__field">
          <span>Birim</span>
          <div class="flex" style="gap:10px;flex-wrap:wrap">
            <label class="category-pick" style="flex:1;min-width:120px">
              <input type="radio" name="accessLinkTtlUnit" value="hours" ${accessUnit === "hours" ? "checked" : ""}>
              <span>Saat</span>
            </label>
            <label class="category-pick" style="flex:1;min-width:120px">
              <input type="radio" name="accessLinkTtlUnit" value="days" ${accessUnit === "days" ? "checked" : ""}>
              <span>Gün</span>
            </label>
          </div>
        </div>
        <p class="form__hint">Süre dolunca link çalışmaz (giriş yapılsa da yapılmasa da). Örn. 2 gün = 48 saat sonra expired.</p>
        <label class="form__field"><span>Maks. tıklama (e-posta linki)</span>
          <input name="accessMaxVisits" type="number" min="1" value="${stock?.accessMaxVisits ?? ""}" placeholder="boş = sınırsız tıklama">
        </label>

        <p class="form__hint" style="margin:10px 0 0;font-weight:600;color:var(--text-dim)">Muhasebe</p>
        <label class="form__field"><span>${t("listPrice")} <em>*</em></span>
          <input name="listPrice" type="number" min="0" step="0.01" required value="${stock?.listPrice ?? ""}" placeholder="299.90">
          <p class="form__hint muted small">${t("listPrice")} — mağazadaki ilan fiyatı (brüt gelir).</p>
        </label>
        <label class="form__field"><span>${t("currency")}</span>
          <input name="currency" maxlength="8" value="${escapeHtml(stock?.currency || "TRY")}" placeholder="TRY">
        </label>
        <p class="form__hint" style="margin:12px 0 0;font-weight:600;color:var(--text-dim)">2) Ürün / lisans süresi (kampanya mailleri)</p>
        <label class="form__field"><span>Ürün süresi (sayı)</span>
          <input name="productDurationValue" type="number" min="1" value="${prodVal}" placeholder="14">
        </label>
        <div class="form__field">
          <span>Ürün birimi</span>
          <div class="flex" style="gap:10px">
            <label class="category-pick" style="flex:1">
              <input type="radio" name="productDurationUnit" value="days" ${prodUnit === "days" ? "checked" : ""}>
              <span>Gün</span>
            </label>
            <label class="category-pick" style="flex:1">
              <input type="radio" name="productDurationUnit" value="months" ${prodUnit === "months" ? "checked" : ""}>
              <span>Ay</span>
            </label>
          </div>
        </div>
        <p class="form__hint">7 ve 3 gün kala, son gün, süre bitti, haftalık upsell ve <strong>ayda bir</strong> mağaza/görüş mailleri buna göre gider. Erişim linki TTL’sinden bağımsızdır.</p>
        <button type="submit" class="btn btn--primary">${isEdit ? "Kaydet" : "Oluştur"}</button>
      </form>
    `);

    bindSubmit(modalBody.querySelector("#stockForm"), async (fd) => {
      const data = Object.fromEntries(fd.entries());
      if (!data.categoryId) throw new Error("Lütfen bir kategori seçin");
      if (!data.productDurationValue) delete data.productDurationValue;
      if (!data.accessMaxVisits) delete data.accessMaxVisits;
      if (isEdit) {
        await api(`/api/stocks/${stock.id}`, { method: "PATCH", body: JSON.stringify(data) });
        flash("Kaydedildi");
        await refreshView();
      } else if (bulk) {
        const count = Number(data.bulkCount || 2);
        if (count < 2 || count > 100) throw new Error("Adet 2–100 arasında olmalı");
        if (!data.name?.trim()) throw new Error("Stok adı öneki girin");
        const res = await api("/api/stocks/bulk", {
          method: "POST",
          body: JSON.stringify({ ...data, count, namePrefix: data.name }),
        });
        for (const s of res.items || []) rememberStock({ ...s, publicUrl: fullPublicUrl(s) });
        closeModal();
        showBulkResultModal(res.items || []);
        flash(`${res.count} stok oluşturuldu`);
        await navigateTo("#stocks");
      } else {
        if (!data.name?.trim()) throw new Error("Stok adı girin");
        const created = await api("/api/stocks", { method: "POST", body: JSON.stringify(data) });
        created.publicUrl = fullPublicUrl(created);
        rememberStock(created);
        const link = created.publicUrl;
        flash("Stock oluşturuldu — tam link panoya kopyalandı");
        try {
          await navigator.clipboard.writeText(link);
        } catch { /* ignore */ }
        await navigateTo("#stocks");
      }
    });
  };

  // ─── Leads ────────────────────────────────────────────────────────────────
  register("leads", {
    title: "Leads",
    subtitle: "Satıra tıkla → tüm Cloudflare detayı. Gizli link sadece admin.",
    render: async (rest) => {
      if (rest?.[0]) return renderLeadDetail(rest[0]);
      const leads = await api("/api/leads?limit=200");
      view.innerHTML = `
        <div class="panel">
          <div class="panel__head">
            <h2>Leads</h2>
            <div class="flex" style="gap:8px;flex-wrap:wrap;align-items:center">
              <div class="bulk-bar" data-bulk-bar hidden>
                <label class="small" style="display:inline-flex;align-items:center;gap:6px">
                  <input type="checkbox" data-select-all> Tümü
                </label>
                <span data-bulk-count class="muted small">0 seçili</span>
                <button type="button" class="btn btn--danger btn--sm" data-bulk-del>Seçilenleri sil</button>
              </div>
              <span class="muted small">${leads.length} form — satıra tıklayın</span>
            </div>
          </div>
        </div>
        <div class="panel panel--flush">
          <table class="table table--hover" id="leadTable">
            <thead><tr>
              <th style="width:36px"></th><th>Tarih</th><th>İsim</th><th>E-posta</th><th>Ürün</th><th>OS</th><th>VPN</th><th></th>
            </tr></thead>
            <tbody>
              ${leads.map((l) => {
        const ctx = l.context || {};
        return `
                <tr class="row-clickable" data-id="${escapeHtml(l.id)}" title="Detay için tıkla">
                  <td data-stop><input type="checkbox" data-row-id="${escapeHtml(l.id)}"></td>
                  <td class="muted small">${new Date(l.createdAt).toLocaleString("tr-TR")}</td>
                  <td><strong>${escapeHtml(l.customerName || "—")}</strong></td>
                  <td data-stop><a href="#customers/${l.customerId}">${escapeHtml(l.customerEmail || "—")}</a></td>
                  <td>${escapeHtml(l.stockName || l.stockId?.slice(0, 8) || "—")}</td>
                  <td>${osLabel(ctx)}</td>
                  <td>${vpnBadge(ctx.vpnLikely)}</td>
                  <td data-stop><span class="muted small">Detay →</span></td>
                </tr>`;
      }).join("") || `<tr><td colspan="8" class="muted">Henüz lead yok.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
      bindBulkDelete({
        tableSel: "#leadTable",
        apiPath: "/api/leads/bulk-delete",
        confirmText: (n) => `${n} lead kaydı silinsin mi?`,
      });
      bindRowNav(".row-clickable", (id) => `#leads/${id}`);
    },
  });

  const accessStatusBadge = (status) => {
    const map = {
      no_mail: ["badge--muted", "Mail yok"],
      no_token: ["badge--muted", "Token yok"],
      pending: ["badge--warn", "Bekliyor tıklama"],
      active: ["badge--ok", "Aktif"],
      expired: ["badge--danger", "Süresi doldu"],
      maxed: ["badge--muted", "Limit doldu"],
    };
    const [cls, label] = map[status] || ["badge--muted", status || "—"];
    return `<span class="badge ${cls}">${label}</span>`;
  };

  async function renderLeadDetail(id) {
    const l = await api(`/api/leads/${id}`);
    const ctx = l.context || {};
    const link = l.accessUrl || "";
    const a = l.access || {};
    const actions = [
      link ? actionBtn("📋 Link kopyala", "btn--ghost", `data-copy="${escapeHtml(link)}"`) : "",
      link ? actionBtn("🔗 Erişimi aç", "btn--ghost", `data-open="${escapeHtml(link)}"`) : "",
      l.customer ? actionBtn("👤 Müşteri", "btn--primary", `data-goto="#customers/${l.customer.id}"`) : "",
      actionBtn("🗑 Sil", "btn--danger", "id=\"delLeadBtn\""),
    ].filter(Boolean).join("");

    view.innerHTML = `
      ${detailHeader("#leads", escapeHtml(leadCustomerLabel(l)), `${escapeHtml(stockDisplayLabel(l))} · ${new Date(l.createdAt).toLocaleString("tr-TR")}`, actions)}
      <div class="detail-grid">
        <div class="detail-grid__main">
          ${metaCard(ctx, "Form gönderildiğinde (Cloudflare)")}
          <div class="meta-card meta-card--accent">
            <h3 class="meta-card__title">📧 Erişim maili — son durum</h3>
            <div class="meta-row">
              <span class="meta-row__icon">📊</span>
              <span class="meta-row__label">Durum</span>
              <span class="meta-row__value">${accessStatusBadge(a.status)}<br><span class="muted small">${escapeHtml(a.statusLabel || "—")}</span></span>
            </div>
            <div class="meta-row"><span class="meta-row__icon">📤</span><span class="meta-row__label">Erişim maili</span>
              <span class="meta-row__value">${deliveryEmailBadge({ short: a.accessEmailDeliveryShort, label: a.accessEmailDeliveryLabel, variant: a.accessEmailDelivery === "sent" ? "ok" : a.accessEmailDelivery === "failed" ? "danger" : "warn", error: a.accessEmailError })}${a.mailSentAt ? `<br><span class="muted small">${new Date(a.mailSentAt).toLocaleString("tr-TR")}</span>` : ""}</span></div>
            <div class="meta-row"><span class="meta-row__icon">📝</span><span class="meta-row__label">Form gönderildi</span>
              <span class="meta-row__value">${a.formSubmittedAt ? new Date(a.formSubmittedAt).toLocaleString("tr-TR") : "—"}</span></div>
            <div class="meta-row"><span class="meta-row__icon">👆</span><span class="meta-row__label">İlk tıklama</span>
              <span class="meta-row__value">${a.activatedAt ? new Date(a.activatedAt).toLocaleString("tr-TR") : "Henüz yok"}</span></div>
            <div class="meta-row"><span class="meta-row__icon">🔢</span><span class="meta-row__label">Tıklama</span>
              <span class="meta-row__value">${a.used ?? 0}${a.maxVisits != null ? ` / ${a.maxVisits}` : ""}${a.clicksLeft != null ? ` · ${a.clicksLeft} kalan` : ""}</span></div>
            <div class="meta-row"><span class="meta-row__icon">⏱</span><span class="meta-row__label">Kalan süre</span>
              <span class="meta-row__value">${formatRemainMs(a.expiresInMs)}</span></div>
            ${a.lastUsedAt ? `<div class="meta-row"><span class="meta-row__icon">🕒</span><span class="meta-row__label">Son tıklama</span>
              <span class="meta-row__value">${new Date(a.lastUsedAt).toLocaleString("tr-TR")}</span></div>` : ""}
          </div>
          ${link ? `
          <div class="meta-card">
            <h3 class="meta-card__title">🔐 Gizli erişim linki (admin)</h3>
            ${linkActionBar(link)}
            <p class="muted small">Müşteriye bu sayfada gösterilmez — sadece e-posta veya buradan.</p>
          </div>` : ""}
        </div>
        <div class="detail-grid__side">
          <div class="meta-card">
            <h3 class="meta-card__title">Bağlantılar</h3>
            <div class="meta-row"><span class="meta-row__icon">👤</span><span class="meta-row__label">Müşteri</span>
              <span class="meta-row__value">
                ${l.customer?.fullName || l.customerName ? `<strong>${escapeHtml(l.customer?.fullName || l.customerName)}</strong><br>` : ""}
                <a class="link" href="#customers/${l.customerId}">${escapeHtml(l.customer?.email || l.customerEmail || "—")}</a>
              </span></div>
            <div class="meta-row"><span class="meta-row__icon">📦</span><span class="meta-row__label">Stok</span>
              <span class="meta-row__value">
                <strong>${escapeHtml(l.stockName || "—")}</strong>
                ${l.stockCode ? `<br><a class="link" href="${escapeHtml(l.stockPublicUrl || fullPublicUrl({ code: l.stockCode, publicUrl: l.stockPublicUrl }))}" target="_blank">${escapeHtml(l.stockPublicUrl || fullPublicUrl({ code: l.stockCode, publicUrl: l.stockPublicUrl }))}</a>` : ""}
              </span></div>
            <div class="meta-row"><span class="meta-row__icon">📋</span><span class="meta-row__label">Lead kaydı</span>
              <span class="meta-row__value">${escapeHtml(l.status || "new")}</span></div>
          </div>
        </div>
      </div>
    `;
    bindLinkActions();
    view.querySelectorAll("[data-copy]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(el.dataset.copy);
        flash("Kopyalandı");
      }),
    );
    view.querySelectorAll("[data-open]").forEach((el) =>
      el.addEventListener("click", () => window.open(el.dataset.open, "_blank")),
    );
    view.querySelectorAll("[data-goto]").forEach((el) =>
      el.addEventListener("click", () => { location.hash = el.dataset.goto; }),
    );
    $("#delLeadBtn")?.addEventListener("click", async () => {
      if (!confirm("Bu lead silinsin mi?")) return;
      await api(`/api/leads/${id}`, { method: "DELETE" });
      flash("Lead silindi");
      location.hash = "#leads";
      await refreshView();
    });
    bindDetailBack();
  }

  // ─── Customers ─────────────────────────────────────────────────────────────
  const CRM_EVENT_LABELS = {
    form_success: "Form başarılı · mail gönderildi",
    form_failed: "Form hata",
    email_failed: "Mail gönderilemedi",
  };

  register("customers", {
    title: "Müşteriler (CRM)",
    subtitle: "Aynı kişi e-posta ile tanınır — public formda yazdığı ad, platform ve kullanıcı adı burada görünür.",
    render: async (rest) => {
      if (rest && rest[0]) return renderCustomerDetail(rest[0]);
      const stages = await api("/api/customers/stages");
      const list = await api("/api/customers?limit=200");
      view.innerHTML = `
        <div class="panel">
          <div class="panel__head">
            <h2>${list.length} müşteri</h2>
            <div class="flex" style="gap:8px;flex-wrap:wrap;align-items:center">
              <div class="bulk-bar" data-bulk-bar hidden>
                <label class="small" style="display:inline-flex;align-items:center;gap:6px">
                  <input type="checkbox" data-select-all> Tümü
                </label>
                <span data-bulk-count class="muted small">0 seçili</span>
                <button type="button" class="btn btn--danger btn--sm" data-bulk-del>Seçilenleri sil</button>
              </div>
              <input id="cQ" class="form__field" style="padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text)" placeholder="E-posta veya ad ara…">
              <select id="cStage" class="form__field" style="padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text)">
                <option value="">Tüm aşamalar</option>
                ${stages.map((s) => `<option>${s}</option>`).join("")}
              </select>
              <button type="button" class="btn btn--ghost btn--sm" id="repairCustomersBtn">Listeyi yenile</button>
            </div>
          </div>
          <p class="muted small" style="padding:0 12px 12px;margin:0">Müşteri, public formda <strong>ilk kez e-posta gönderdiğinde</strong> oluşur. Aynı e-posta tekrar gelirse aynı kayıt güncellenir (yeni kişi değil).</p>
          <table class="table table--hover" id="cTable">
            <thead><tr><th style="width:36px"></th><th>E-posta</th><th>Ad</th><th>Platform</th><th>Aşama</th><th>Stok</th><th>Ziyaret</th><th>Son görülme</th><th></th></tr></thead>
            <tbody>${renderCustomerRows(list)}</tbody>
          </table>
        </div>
      `;
      bindBulkDelete({
        tableSel: "#cTable",
        apiPath: "/api/customers/bulk-delete",
        confirmText: (n) => `${n} müşteri kaydı silinsin mi? (Lead kayıtları kalır)`,
      });
      const cTable = view.querySelector("#cTable");
      const cBulkBar = view.querySelector("[data-bulk-bar]");
      const syncCustBulkBar = () => {
        if (!cTable || !cBulkBar) return;
        const n = [...cTable.querySelectorAll("tbody input[data-row-id]:checked")].length;
        cBulkBar.hidden = n === 0;
        const countEl = cBulkBar.querySelector("[data-bulk-count]");
        if (countEl) countEl.textContent = `${n} seçili`;
      };
      cTable?.addEventListener("change", (e) => {
        if (e.target.matches("input[data-row-id]")) syncCustBulkBar();
      });
      cBulkBar?.querySelector("[data-select-all]")?.addEventListener("change", (e) => {
        const on = e.target.checked;
        cTable?.querySelectorAll("tbody input[data-row-id]").forEach((c) => { c.checked = on; });
        syncCustBulkBar();
      });
      const refilter = async () => {
        const q = $("#cQ").value.trim();
        const stage = $("#cStage").value;
        const filtered = await api(`/api/customers?limit=200${q ? `&q=${encodeURIComponent(q)}` : ""}${stage ? `&stage=${encodeURIComponent(stage)}` : ""}`);
        $("#cTable tbody").innerHTML = renderCustomerRows(filtered);
        syncCustBulkBar();
      };
      const bindCustActions = () => {
        view.querySelectorAll("[data-edit-cust]").forEach((btn) =>
          btn.addEventListener("click", async () => {
            const c = await api(`/api/customers/${btn.dataset.editCust}`);
            showCustomerModal(c);
          }),
        );
      };
      bindCustActions();
      bindRowNav("#cTable .row-clickable", (id) => `#customers/${id}`);
      $("#cQ").addEventListener("input", debounce(async () => { await refilter(); bindCustActions(); bindRowNav("#cTable .row-clickable", (id) => `#customers/${id}`); }, 250));
      $("#cStage").addEventListener("change", async () => { await refilter(); bindCustActions(); bindRowNav("#cTable .row-clickable", (id) => `#customers/${id}`); });
      $("#repairCustomersBtn")?.addEventListener("click", async () => {
        await api("/api/customers/repair", { method: "POST" });
        flash("Müşteri listesi lead kayıtlarından yenilendi");
        await refreshView();
      });
    },
  });

  function renderCustomerRows(list) {
    if (!list.length) {
      return `<tr><td colspan="9" class="muted">Henüz müşteri yok. Birisi public form gönderince burada görünür. “Listeyi yenile” ile lead’lerden de çekilebilir.</td></tr>`;
    }
    return list.map((c) => {
      const stockCount = (c.stockHistory || []).length;
      const plat = c.purchasePlatform
        ? `${escapeHtml(c.purchasePlatform)}${c.platformUsername ? ` · ${escapeHtml(c.platformUsername)}` : ""}`
        : "—";
      return `
      <tr class="row-clickable" data-id="${escapeHtml(c.id)}" title="Detay için tıkla">
        <td data-stop><input type="checkbox" data-row-id="${escapeHtml(c.id)}"></td>
        <td><strong>${escapeHtml(c.email)}</strong></td>
        <td>${escapeHtml(c.fullName || "—")}</td>
        <td class="muted small">${plat}</td>
        <td><span class="badge ${stageVariant(c.lifecycleStage)}">${escapeHtml(c.lifecycleStage)}</span></td>
        <td class="muted small">${stockCount ? `${stockCount} ürün` : "—"}</td>
        <td>${c.visits || 0}</td>
        <td class="muted small">${c.lastActivityAt ? new Date(c.lastActivityAt).toLocaleString("tr-TR") : "—"}</td>
        <td class="row-actions" data-stop>
          <button type="button" class="btn btn--ghost btn--sm" data-edit-cust="${escapeHtml(c.id)}">Düzenle</button>
        </td>
      </tr>`;
    }).join("");
  }

  const showCustomerModal = (customer) => {
    openModal("Müşteri düzenle", `
      <form id="custForm" class="form">
        <label class="form__field"><span>E-posta <em>*</em></span>
          <input name="email" type="email" required value="${escapeHtml(customer.email)}">
        </label>
        <label class="form__field"><span>Ad soyad</span>
          <input name="fullName" value="${escapeHtml(customer.fullName || "")}" maxlength="120">
        </label>
        <label class="form__field"><span>Telegram</span>
          <input name="telegram" value="${escapeHtml(customer.telegram || "")}">
        </label>
        <label class="form__field"><span>Discord</span>
          <input name="discord" value="${escapeHtml(customer.discord || "")}">
        </label>
        <label class="form__field"><span>Lifecycle</span>
          <select name="stage">
            ${["lead", "active", "expiring", "churned", "renewed"].map((s) =>
      `<option value="${s}" ${s === customer.lifecycleStage ? "selected" : ""}>${s}</option>`,
    ).join("")}
          </select>
        </label>
        <label class="form__field"><span>Notlar (sadece admin)</span>
          <textarea name="notes" rows="3" placeholder="İç not…">${escapeHtml(customer.notes || "")}</textarea>
        </label>
        <button type="submit" class="btn btn--primary">Kaydet</button>
      </form>
    `);
    bindSubmit(modalBody.querySelector("#custForm"), async (fd) => {
      const data = Object.fromEntries(fd.entries());
      await api(`/api/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify(data) });
      flash("Müşteri güncellendi");
      await refreshView({ silent: true });
    });
  };
  const stageVariant = (s) => s === "active" ? "badge--ok" : s === "expiring" ? "badge--warn" : s === "churned" ? "badge--danger" : "";

  async function renderCustomerDetail(id) {
    const [c, events, comms, leads] = await Promise.all([
      api(`/api/customers/${id}`),
      api(`/api/analytics/events?customerId=${id}&limit=50`),
      api(`/api/customers/${id}/communications`),
      api(`/api/leads?customerId=${id}&limit=50`),
    ]);

    const actions = [
      actionBtn("✏️ Düzenle", "btn--primary", "id=\"editCustBtn\""),
      actionBtn("🗑 Sil", "btn--danger", "id=\"delCustBtn\""),
      actionBtn("📋 E-posta kopyala", "btn--ghost", `data-copy="${escapeHtml(c.email)}"`),
    ].join("");

    view.innerHTML = `
      ${detailHeader("#customers", escapeHtml(c.fullName || c.email), `<span class="badge ${stageVariant(c.lifecycleStage)}">${escapeHtml(c.lifecycleStage)}</span> · ${c.visits || 0} ziyaret`, actions)}

      <div class="detail-grid">
        <div class="detail-grid__main">
          ${metaCard(c, "Son bilinen cihaz (Cloudflare)")}
          <div class="panel">
            <div class="panel__head"><h2>📧 E-posta sırası (bu müşteri)</h2><span class="muted small">Tekilleştirilmiş · gönderilen + planlanan</span></div>
            <div class="panel__body">${emailTimelineHtml(comms)}</div>
          </div>
          <div class="panel">
            <div class="panel__head"><h2>📋 Lead kayıtları</h2><span class="muted small">${leads.length} form</span></div>
            <table class="table table--hover">
              <tbody>
                ${leads.map((l) => `
                  <tr class="row-clickable" data-id="${escapeHtml(l.id)}">
                    <td class="muted small">${new Date(l.createdAt).toLocaleString("tr-TR")}</td>
                    <td>${escapeHtml(l.stockName || l.stockId?.slice(0, 8) || "—")}</td>
                    <td>${vpnBadge(l.context?.vpnLikely)}</td>
                    <td><span class="muted small">Detay →</span></td>
                  </tr>`).join("") || `<tr><td colspan="4" class="muted">Lead yok</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <div class="detail-grid__side">
          <div class="meta-card">
            <h3 class="meta-card__title">İletişim</h3>
            ${c.telegram ? `<div class="meta-row"><span class="meta-row__icon">✈️</span><span class="meta-row__label">Telegram</span><span class="meta-row__value">${escapeHtml(c.telegram)}</span></div>` : ""}
            ${c.discord ? `<div class="meta-row"><span class="meta-row__icon">💬</span><span class="meta-row__label">Discord</span><span class="meta-row__value">${escapeHtml(c.discord)}</span></div>` : ""}
            <div class="meta-row"><span class="meta-row__icon">📧</span><span class="meta-row__label">E-posta</span><span class="meta-row__value">${escapeHtml(c.email)}</span></div>
            ${c.notes ? `<div class="meta-row"><span class="meta-row__icon">📝</span><span class="meta-row__label">Not</span><span class="meta-row__value">${escapeHtml(c.notes)}</span></div>` : ""}
            <div class="meta-row"><span class="meta-row__icon">🕐</span><span class="meta-row__label">İlk görülme</span><span class="meta-row__value">${new Date(c.firstSeenAt).toLocaleString("tr-TR")}</span></div>
            <div class="meta-row"><span class="meta-row__icon">🕑</span><span class="meta-row__label">Son aktivite</span><span class="meta-row__value">${new Date(c.lastActivityAt).toLocaleString("tr-TR")}</span></div>
          </div>
          <div class="panel">
            <div class="panel__head"><h2>Stoklar</h2></div>
            ${(c.stockHistory || []).map((h) => `
              <div class="stock-chip">
                <code>${escapeHtml(h.stockId?.slice(0, 10) || "")}…</code>
                <span class="muted small">${new Date(h.attachedAt).toLocaleString("tr-TR")}</span>
                ${h.accessActivatedAt ? `<span class="badge badge--ok">Aktif ${new Date(h.accessActivatedAt).toLocaleDateString("tr-TR")}</span>` : `<span class="badge badge--muted">Bekliyor</span>`}
              </div>`).join("") || `<p class="muted small">Stok yok</p>`}
          </div>
          <div class="panel">
            <div class="panel__head"><h2>Destek geçmişi</h2><span class="muted small">Form / mail olayları</span></div>
            ${(c.crmEvents || []).length ? (c.crmEvents || []).map((ev) => `
              <div class="stock-chip" style="margin-bottom:8px">
                <span class="badge badge--muted">${escapeHtml(CRM_EVENT_LABELS[ev.type] || ev.type)}</span>
                <span class="muted small">${new Date(ev.at).toLocaleString("tr-TR")}</span>
                ${ev.stockName ? `<strong class="small">${escapeHtml(ev.stockName)}</strong>` : ""}
                ${ev.note ? `<p class="muted small" style="margin:4px 0 0">${escapeHtml(ev.note)}</p>` : ""}
              </div>`).join("") : `<p class="muted small">Henüz olay yok — yeni formlardan sonra dolar.</p>`}
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel__head"><h2>Aktivite geçmişi</h2></div>
        <table class="table table--hover">
          <thead><tr><th>Zaman</th><th>Olay</th><th>IP</th><th>OS</th><th>VPN</th><th>Ülke</th></tr></thead>
          <tbody>
            ${events.map((e) => `
              <tr>
                <td class="muted small">${new Date(e.iso).toLocaleString("tr-TR")}</td>
                <td><span class="badge">${escapeHtml(e.type)}</span></td>
                <td><code class="small">${escapeHtml(e.ip || "—")}</code></td>
                <td>${osLabel(e)}</td>
                <td>${vpnBadge(e.vpnLikely)}</td>
                <td>${escapeHtml(e.country || "—")}</td>
              </tr>`).join("") || `<tr><td colspan="6" class="muted">Aktivite yok</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    $("#editCustBtn")?.addEventListener("click", () => showCustomerModal(c));
    $("#delCustBtn")?.addEventListener("click", async () => {
      if (!confirm(`${c.email} silinsin mi? Bu işlem geri alınamaz.`)) return;
      try {
        await api(`/api/customers/${id}`, { method: "DELETE" });
        flash("Müşteri silindi");
        location.hash = "#customers";
        await refreshView();
      } catch (e) { flash(e.message, "error"); }
    });
    view.querySelectorAll("[data-copy]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(el.dataset.copy);
        flash("Kopyalandı");
      }),
    );
    bindRowNav(".row-clickable", (lid) => `#leads/${lid}`);
    bindDetailBack();
  }

  // ─── Finance (muhasebe) ────────────────────────────────────────────────────
  register("finance", {
    title: () => t("financeTitle"),
    subtitle: () => t("financeSubtitle"),
    render: async () => {
      let period = "month";
      let customFrom = "";
      let customTo = "";
      const defaultRange = () => {
        const to = new Date();
        const from = new Date();
        from.setUTCDate(from.getUTCDate() - 29);
        return {
          to: to.toISOString().slice(0, 10),
          from: from.toISOString().slice(0, 10),
        };
      };
      const renderFinance = async () => {
        const q =
          period === "custom" && customFrom && customTo
            ? `from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`
            : `period=${period}`;
        const f = await api(`/api/finance/summary?${q}`);
        const cur = f.currency || "TRY";
        const p = f.periods || {};
        const series = f.series14 || [];
        const maxNet = Math.max(1, ...series.map((d) => d.net || 0), 1);
        const bars = series
          .map((d) => {
            const h = Math.max(4, Math.round(((d.net || 0) / maxNet) * 72));
            return `<div class="spark__col" title="${escapeHtml(d.date)}: ${fmtMoney(d.net, cur)}">
              <div class="spark__bar spark__bar--money" style="height:${h}px"></div>
              <span class="spark__label">${escapeHtml(d.date?.slice(5) || "")}</span>
            </div>`;
          })
          .join("");

        const periodBtn = (id, label) =>
          `<button type="button" class="btn btn--sm ${period === id ? "btn--primary" : "btn--ghost"}" data-fin-period="${id}">${label}</button>`;
        const dr = defaultRange();

        view.innerHTML = `
          <div class="finance-hero">
            <div class="flex" style="justify-content:flex-end;margin-bottom:10px">
              <button type="button" class="btn btn--danger btn--sm" id="finResetAll">${t("financeReset")}</button>
            </div>
            <div class="panel finance-range" style="margin-bottom:14px;padding:14px 16px">
              <p class="small muted" style="margin:0 0 10px">📅 ${t("customRange")}</p>
              <div class="flex" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
                <label class="form__field" style="margin:0;min-width:140px">
                  <span class="muted small">${t("dateFrom")}</span>
                  <input type="date" id="finFrom" value="${escapeHtml(customFrom || dr.from)}">
                </label>
                <label class="form__field" style="margin:0;min-width:140px">
                  <span class="muted small">${t("dateTo")}</span>
                  <input type="date" id="finTo" value="${escapeHtml(customTo || dr.to)}">
                </label>
                <button type="button" class="btn btn--primary btn--sm" id="finApplyRange">${t("dateApply")}</button>
              </div>
            </div>
            <p class="muted small" style="margin:0 0 10px">${t("dateClear")}:</p>
            <div class="flex" style="gap:8px;flex-wrap:wrap;margin-bottom:16px">
              ${periodBtn("day", t("periodDay"))}
              ${periodBtn("week", t("periodWeek"))}
              ${periodBtn("month", t("periodMonth"))}
              ${periodBtn("year", t("periodYear"))}
              ${period === "custom" ? `<span class="badge badge--ok">${escapeHtml(f.from)} → ${escapeHtml(f.to)}</span>` : ""}
            </div>
            <section class="grid finance-kpis">
              <div class="finance-kpi finance-kpi--gross">
                <span class="finance-kpi__label">${t("gross")}</span>
                <span class="finance-kpi__value">${fmtMoney(f.current?.gross, cur)}</span>
                <span class="finance-kpi__hint">${f.current?.count || 0} ${t("sales")}</span>
              </div>
              <div class="finance-kpi finance-kpi--fee">
                <span class="finance-kpi__label">${t("commission")}</span>
                <span class="finance-kpi__value">${fmtMoney(f.current?.commission, cur)}</span>
                <span class="finance-kpi__hint">${f.effectiveCommissionRate || 0}% ${t("effectiveRate")}</span>
              </div>
              <div class="finance-kpi finance-kpi--net">
                <span class="finance-kpi__label">${t("net")}</span>
                <span class="finance-kpi__value">${fmtMoney(f.current?.net, cur)}</span>
                <span class="finance-kpi__hint">${t("avgOrder")}: ${fmtMoney(f.avgOrderValue, cur)}</span>
              </div>
            </section>
            <div class="grid finance-mini-kpis">
              <div class="card"><h3>${t("periodDay")}</h3><div class="value">${fmtMoney(p.day?.net, cur)}</div></div>
              <div class="card"><h3>${t("periodWeek")}</h3><div class="value">${fmtMoney(p.week?.net, cur)}</div></div>
              <div class="card"><h3>${t("periodMonth")}</h3><div class="value">${fmtMoney(p.month?.net, cur)}</div></div>
              <div class="card"><h3>${t("periodYear")}</h3><div class="value">${fmtMoney(p.year?.net, cur)}</div></div>
            </div>
          </div>
          <div class="panel overview-chart">
            <div class="panel__head"><h2>${period === "custom" ? (panelLang === "tr" ? "Seçilen aralık — net gelir" : "Selected range — net revenue") : panelLang === "tr" ? "Son günler — net gelir" : "Recent days — net revenue"}</h2></div>
            <div class="spark spark--labeled">${bars || `<span class="muted">—</span>`}</div>
          </div>
          <div class="grid overview-panels">
            <div class="panel">
              <div class="panel__head"><h2>${t("byPlatform")}</h2></div>
              <table class="table table--compact">
                <thead><tr><th>${t("platform")}</th><th>${t("rate")}</th><th>${t("gross")}</th><th>${t("commission")}</th><th>${t("net")}</th></tr></thead>
                <tbody>
                  ${(f.byPlatform || []).map((row) => `
                    <tr>
                      <td><strong>${escapeHtml(row.name)}</strong></td>
                      <td>${row.commissionPercent ?? 0}%</td>
                      <td>${fmtMoney(row.gross, cur)}</td>
                      <td class="muted">${fmtMoney(row.commission, cur)}</td>
                      <td><strong>${fmtMoney(row.net, cur)}</strong></td>
                    </tr>`).join("") || `<tr><td colspan="5" class="muted">${t("noSales")}</td></tr>`}
                </tbody>
              </table>
            </div>
            <div class="panel">
              <div class="panel__head"><h2>${t("byProduct")}</h2></div>
              <table class="table table--compact">
                <thead><tr><th>${t("product")}</th><th>${t("platform")}</th><th>${t("net")}</th><th>${t("sales")}</th></tr></thead>
                <tbody>
                  ${(f.byProduct || []).map((row) => `
                    <tr>
                      <td>${escapeHtml(row.stockName || "—")}</td>
                      <td class="muted small">${escapeHtml(row.platformName || "—")}</td>
                      <td><strong>${fmtMoney(row.net, cur)}</strong></td>
                      <td>${row.count}</td>
                    </tr>`).join("") || `<tr><td colspan="4" class="muted">—</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
          <div class="panel">
            <div class="panel__head"><h2>${t("recentSales")}</h2></div>
            <table class="table table--hover">
              <thead><tr><th>${t("when")}</th><th>${t("product")}</th><th>${t("platform")}</th><th>${t("gross")}</th><th>${t("commission")}</th><th>${t("net")}</th></tr></thead>
              <tbody>
                ${(f.recent || []).map((s) => `
                  <tr>
                    <td class="muted small">${new Date(s.at).toLocaleString(panelLang === "tr" ? "tr-TR" : "en-US")}</td>
                    <td>${escapeHtml(s.stockName || "—")}</td>
                    <td>${escapeHtml(s.platformName || "—")}</td>
                    <td>${fmtMoney(s.gross, s.currency || cur)}</td>
                    <td class="muted">${fmtMoney(s.commission, s.currency || cur)} <span class="muted small">(${s.commissionRate || 0}%)</span></td>
                    <td><strong>${fmtMoney(s.net, s.currency || cur)}</strong></td>
                  </tr>`).join("") || `<tr><td colspan="6" class="muted">${t("noSales")}</td></tr>`}
              </tbody>
            </table>
          </div>
        `;

        view.querySelectorAll("[data-fin-period]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            period = btn.dataset.finPeriod;
            await renderFinance();
          });
        });
        $("#finApplyRange")?.addEventListener("click", async () => {
          customFrom = $("#finFrom")?.value || "";
          customTo = $("#finTo")?.value || "";
          if (!customFrom || !customTo) {
            flash(panelLang === "tr" ? "İki tarihi de seçin" : "Pick both dates", "error");
            return;
          }
          if (customFrom > customTo) {
            flash(panelLang === "tr" ? "Başlangıç, bitişten sonra olamaz" : "Start must be before end", "error");
            return;
          }
          period = "custom";
          await renderFinance();
        });

        $("#finResetAll")?.addEventListener("click", async () => {
          if (!confirm(t("financeResetConfirm1"))) return;
          if (!confirm(t("financeResetConfirm2"))) return;
          const res = await api("/api/finance/reset", {
            method: "POST",
            body: JSON.stringify({ confirm: true }),
          });
          const extra = res.truncated
            ? panelLang === "tr"
              ? " (limit — kalan kayıtlar için tekrar deneyin)"
              : " (limit — run again if needed)"
            : "";
          flash(`${t("financeResetDone")}: ${res.deleted}${extra}`);
          await renderFinance();
        });
      };
      await renderFinance();
    },
  });

  // ─── Email queue ───────────────────────────────────────────────────────────
  register("emails", {
    title: "E-posta kuyruğu",
    subtitle: () => t("emailClickHint"),
    render: async () => {
      const q = await api("/api/emails/queue?group=1");
      const formatDue = (ms) => {
        if (ms == null) return "—";
        const abs = Math.abs(ms);
        const h = Math.floor(abs / 3600000);
        const m = Math.floor((abs % 3600000) / 60000);
        if (ms < 0) return `${h ? `${h}sa ` : ""}${m}dk gecikmiş`;
        if (h >= 48) return `${Math.floor(h / 24)} gün sonra`;
        if (h > 0) return `${h}sa ${m}dk sonra`;
        return `${m}dk sonra`;
      };
      let customers = q.customers || [];
      let flatItems = [];
      if (!customers.length && q.size === 0) {
        const flat = await api("/api/emails/queue").catch(() => ({ items: [] }));
        flatItems = flat.items || [];
        if (flatItems.length) {
          customers = [
            {
              id: "flat",
              customerName: "Planlı mailler",
              customerEmail: `${flatItems.length} kayıt`,
              count: flatItems.length,
              items: flatItems,
              nextDueAt: flatItems[0]?.dueAt,
            },
          ];
        }
      }
      const orphanN = (q.orphanKeys || []).length;
      view.innerHTML = `
        <div class="panel">
          <div class="panel__head">
            <h2>${q.size ?? 0} planlı mail · ${customers.length} grup</h2>
            <div class="flex" style="gap:8px;flex-wrap:wrap">
              <button type="button" class="btn btn--ghost btn--sm" id="emailCancelSelected" disabled>Seçilenleri iptal</button>
              <button type="button" class="btn btn--danger btn--sm" id="emailCancelAll">Tüm kuyruğu boşalt</button>
              ${orphanN ? `<button type="button" class="btn btn--ghost btn--sm" id="emailPurgeOrphans">${orphanN} bozuk anahtarı sil</button>` : ""}
              <button class="btn btn--primary btn--sm" id="sendNow">Test maili</button>
            </div>
          </div>
          ${q.keyCount > q.size ? `<p class="badge badge--warn" style="margin:0 0 12px">KV'de ${q.keyCount} anahtar var, ${q.size} mail okunabildi${orphanN ? ` · ${orphanN} bozuk` : ""}.</p>` : ""}
          ${q.truncated ? `<p class="badge badge--warn" style="margin:0 0 12px">KV kotası: yalnızca ilk ${q.totalListed || "?"} kayıt listeleniyor.</p>` : ""}
          <p class="muted small" style="margin:0 0 12px">${t("emailClickHint")}</p>
          <div class="email-queue-groups">
            ${customers.map((g) => `
              <details class="email-queue-group">
                <summary class="email-queue-group__head">
                  <label class="email-queue-check" onclick="event.stopPropagation()">
                    <input type="checkbox" class="email-cust-check" data-customer-id="${escapeHtml(g.customerId || "")}" data-keys="${escapeHtml(g.items.map((i) => i.key).join(","))}">
                  </label>
                  <span class="email-queue-group__who">
                    <strong>${escapeHtml(g.customerName)}</strong>
                    <span class="muted small">${escapeHtml(g.customerEmail)}</span>
                  </span>
                  <span class="badge">${g.count} mail</span>
                  <span class="muted small">${g.nextDueAt ? new Date(g.nextDueAt).toLocaleString("tr-TR") : "—"}</span>
                  ${g.customerId ? `<button type="button" class="btn btn--ghost btn--sm email-cancel-cust" data-customer-id="${escapeHtml(g.customerId)}">Tümünü iptal</button>` : ""}
                  ${g.customerId ? `<a class="btn btn--ghost btn--sm" href="#customers/${escapeHtml(g.customerId)}">CRM</a>` : ""}
                </summary>
                <table class="table table--compact">
                  <thead><tr><th>Zaman</th><th>Tür</th><th>Konu</th><th></th></tr></thead>
                  <tbody>
                    ${g.items.map((j) => `
                      <tr class="email-queue-row" data-key="${escapeHtml(j.key)}" title="${escapeHtml(t("emailEdit"))}">
                        <td class="muted small">${j.dueAt ? new Date(j.dueAt).toLocaleString(panelLang === "tr" ? "tr-TR" : "en-US") : "—"}<br>${escapeHtml(formatDue(j.dueInMs))}</td>
                        <td><span class="badge badge--muted">${escapeHtml(j.kindLabel || j.kind)}</span></td>
                        <td class="email-queue-row__subject">${escapeHtml(j.subject || "—")}</td>
                        <td class="email-queue-row__actions">
                          <button type="button" class="btn btn--ghost btn--sm email-edit-one" data-key="${escapeHtml(j.key)}">${t("emailEdit")}</button>
                          <button type="button" class="btn btn--danger btn--sm email-cancel-one" data-key="${escapeHtml(j.key)}">İptal</button>
                        </td>
                      </tr>`).join("")}
                  </tbody>
                </table>
              </details>`).join("") || `<p class="muted">Planlı mail yok. Müşteri erişim linkine ilk tıklayınca otomasyon kuyruğa eklenir.</p>`}
          </div>
        </div>
      `;

      const selectedKeys = () => {
        const keys = [];
        view.querySelectorAll(".email-cust-check:checked").forEach((cb) => {
          (cb.dataset.keys || "").split(",").filter(Boolean).forEach((k) => keys.push(k));
        });
        return keys;
      };
      const syncBulkBtn = () => {
        const btn = $("#emailCancelSelected");
        if (btn) btn.disabled = selectedKeys().length === 0;
      };
      view.querySelectorAll(".email-cust-check").forEach((cb) => cb.addEventListener("change", syncBulkBtn));

      $("#emailPurgeOrphans")?.addEventListener("click", async () => {
        if (!confirm(`${orphanN} bozuk kuyruk anahtarı silinsin mi?`)) return;
        const res = await api("/api/emails/queue/purge-orphans", {
          method: "POST",
          body: JSON.stringify({ keys: q.orphanKeys || [] }),
        });
        flash(`${res.deleted} bozuk anahtar silindi`);
        await refreshView();
      });

      $("#emailCancelSelected")?.addEventListener("click", async () => {
        const keys = selectedKeys();
        if (!keys.length || !confirm(`${keys.length} planlı mail iptal edilsin mi?`)) return;
        const res = await api("/api/emails/queue/cancel", { method: "POST", body: JSON.stringify({ keys }) });
        flash(`${res.cancelled} mail iptal edildi`);
        await refreshView();
      });

      const toDatetimeLocal = (iso) => {
        if (!iso) return "";
        const d = new Date(iso);
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
      };

      const extractEmailMainHtml = (html) => {
        if (!html) return "<p></p>";
        const hr = html.search(/<hr\b/i);
        const head = hr > -1 ? html.slice(0, hr) : html;
        const m = head.match(/<div[^>]*max-width:\s*560px[^>]*>([\s\S]*)$/i);
        if (m) return m[1].trim();
        const body = head.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        return body ? body[1].trim() : head;
      };

      const rebuildEmailHtml = (original, mainInner) => {
        if (!original) return mainInner;
        if (/<hr\b/i.test(original)) {
          const next = original.replace(
            /(<div[^>]*max-width:\s*560px[^>]*>)([\s\S]*?)(<hr\b)/i,
            `$1${mainInner}$3`,
          );
          if (next !== original) return next;
        }
        return original;
      };

      const openEmailEdit = async (key) => {
        if (!key) return;
        const job = await api(`/api/emails/queue/${encodeURIComponent(key)}`);
        const originalHtml = job.html || "";
        openModal(t("emailEditTitle"), `
          <form id="emailEditForm" class="form email-visual-edit">
            <input type="hidden" name="key" value="${escapeHtml(job.key)}">
            <p class="muted small" style="margin:0 0 12px">
              <span class="badge badge--muted">${escapeHtml(job.kindLabel || job.kind)}</span>
              ${job.customerName ? `<strong>${escapeHtml(job.customerName)}</strong> · ` : ""}
              ${escapeHtml(job.customerEmail || job.to || "")}
            </p>
            <label class="form__field"><span>${t("emailSubject")}</span>
              <input name="subject" type="text" required maxlength="200" value="${escapeHtml(job.subject || "")}">
            </label>
            <label class="form__field"><span>${t("emailDue")}</span>
              <input name="dueAt" type="datetime-local" required value="${escapeHtml(toDatetimeLocal(job.dueAtIso))}">
            </label>
            <p class="muted small" style="margin:8px 0 6px">${t("emailEditHint")}</p>
            <div class="email-visual-edit__canvas" id="emailBodyCanvas" contenteditable="true"></div>
            <p class="muted small" style="margin:10px 0 6px">Önizleme</p>
            <iframe class="email-visual-edit__preview" id="emailPreviewFrame" title="Önizleme"></iframe>
            <button type="submit" class="btn btn--primary" style="margin-top:12px">${t("save")}</button>
          </form>
        `);
        const canvas = modalBody.querySelector("#emailBodyCanvas");
        const iframe = modalBody.querySelector("#emailPreviewFrame");
        const syncPreview = () => {
          if (iframe) iframe.srcdoc = rebuildEmailHtml(originalHtml, canvas?.innerHTML || "");
        };
        if (canvas) {
          canvas.innerHTML = extractEmailMainHtml(originalHtml);
          canvas.addEventListener("input", syncPreview);
          syncPreview();
        }
        bindSubmit(modalBody.querySelector("#emailEditForm"), async (fd) => {
          const data = Object.fromEntries(fd.entries());
          const dueAt = data.dueAt ? new Date(data.dueAt).toISOString() : null;
          const html = rebuildEmailHtml(originalHtml, canvas?.innerHTML || "");
          await api("/api/emails/queue/update", {
            method: "POST",
            body: JSON.stringify({
              key: data.key,
              subject: data.subject,
              html,
              dueAt,
            }),
          });
          flash(t("emailSaved"));
          await refreshView();
        });
      };

      view.querySelectorAll(".email-queue-row").forEach((row) => {
        row.addEventListener("click", (e) => {
          if (e.target.closest("button, a, input, label")) return;
          openEmailEdit(row.dataset.key);
        });
      });
      view.querySelectorAll(".email-edit-one").forEach((btn) =>
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openEmailEdit(btn.dataset.key);
        }),
      );

      view.querySelectorAll(".email-cancel-one").forEach((btn) =>
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(panelLang === "tr" ? "Bu mail iptal edilsin mi?" : "Cancel this email?")) return;
          await api("/api/emails/queue/cancel", { method: "POST", body: JSON.stringify({ keys: [btn.dataset.key] }) });
          flash(panelLang === "tr" ? "İptal edildi" : "Cancelled");
          await refreshView();
        }),
      );

      view.querySelectorAll(".email-cancel-cust").forEach((btn) =>
        btn.addEventListener("click", async () => {
          if (!confirm("Bu müşterinin tüm planlı mailleri iptal edilsin mi?")) return;
          const res = await api("/api/emails/queue/cancel", {
            method: "POST",
            body: JSON.stringify({ customerId: btn.dataset.customerId }),
          });
          flash(`${res.cancelled} mail iptal edildi`);
          await refreshView();
        }),
      );

      $("#emailCancelAll")?.addEventListener("click", async () => {
        if (!confirm("Tüm e-posta kuyruğu boşaltılsın mı? (Geri alınamaz)")) return;
        const res = await api("/api/emails/queue/cancel", { method: "POST", body: JSON.stringify({ all: true }) });
        flash(`${res.cancelled} mail kuyruktan silindi`);
        await refreshView();
      });

      $("#sendNow").addEventListener("click", async () => {
        let fromAddr = "onboarding@resend.dev";
        try {
          const s = await api("/api/settings");
          fromAddr = s.effectiveEmailFrom || s.emailFrom || fromAddr;
        } catch {
          /* ignore */
        }
        openModal(panelLang === "tr" ? "Test maili" : "Test email", `
          <form id="emailForm" class="form">
            <p class="muted small" style="margin:0 0 12px">${t("emailTestHint")}<br><strong>Gönderen:</strong> ${escapeHtml(fromAddr)}</p>
            <label class="form__field"><span>${panelLang === "tr" ? "Alıcı" : "To"}</span>
              <input name="to" type="email" required placeholder="Resend hesap e-postanız">
            </label>
            <label class="form__field"><span>${panelLang === "tr" ? "Konu" : "Subject"}</span>
              <input name="subject" required value="CRM test — gerçek gönderim ✉️">
            </label>
            <label class="form__field"><span>${panelLang === "tr" ? "Mesaj" : "Message"}</span>
              <textarea name="html" rows="5" required>&lt;p&gt;Merhaba — bu bir &lt;strong&gt;gerçek&lt;/strong&gt; Resend testidir. 🎉&lt;/p&gt;</textarea>
            </label>
            <button class="btn btn--primary">${panelLang === "tr" ? "Şimdi gönder" : "Send now"}</button>
          </form>
        `);
        bindSubmit(modalBody.querySelector("#emailForm"), async (fd) => {
          const data = Object.fromEntries(fd.entries());
          const res = await api("/api/emails/send", { method: "POST", body: JSON.stringify(data) });
          const okMsg =
            res.delivered === false
              ? panelLang === "tr"
                ? "Console modu — gerçek mail gitmedi (RESEND_API_KEY + EMAIL_DRIVER)"
                : "Console mode — not delivered"
              : panelLang === "tr"
                ? "E-posta Resend ile gönderildi — gelen kutusunu kontrol edin"
                : "Sent via Resend — check inbox";
          flash(okMsg, res.delivered === false ? "error" : "ok");
          await refreshView();
        });
      });
    },
  });

  // ─── Automations ───────────────────────────────────────────────────────────
  register("automations", {
    title: "Otomasyonlar",
    subtitle: "CRM asistanı + yaşam döngüsü e-posta şablonları.",
    render: async () => {
      const [t, aiStatus] = await Promise.all([
        api("/api/automations/default"),
        api("/api/ai/status").catch(() => ({ openai: false })),
      ]);
      const bodyKeys = [...new Set(t.steps.map((s) => s.template).filter((k) => k !== "access"))];
      const TEMPLATE_LABELS = {
        welcome: "Hoş geldin",
        access: "Erişim linki (form sonrası)",
        "expiring-7": "Süre bitiyor (7 gün önce)",
        "expiring-3": "Bitmek üzere (3 gün önce)",
        expiring: "Süre bitiyor",
        "expiring-final": "Son gün",
        expired: "Süre doldu",
        upsell: "Upsell (1. hafta)",
        "upsell-monthly": "Aylık — mağaza & görüş",
      };

      const chatHistory = (() => {
        try {
          return JSON.parse(sessionStorage.getItem("crm:ai-chat") || "[]");
        } catch {
          return [];
        }
      })();

      view.innerHTML = `
        <div class="auto-tabs">
          <button type="button" class="auto-tabs__btn active" data-auto-tab="chat">💬 Asistan</button>
          <button type="button" class="auto-tabs__btn" data-auto-tab="templates">✉️ E-posta şablonları</button>
        </div>
        <div id="autoTabChat">
        <div class="panel panel--accent-ai ai-chat" id="aiChatPanel">
          <div class="panel__head">
            <h2>CRM asistanı</h2>
            <span class="badge ${aiStatus.openai ? "badge--ok" : "badge--warn"}">${aiStatus.openai ? "OpenAI bağlı" : "OpenAI yok"}</span>
          </div>
          <p class="muted small" style="padding:0 20px 10px;margin:0">Sorunuzu yazın — <strong>Enter</strong> gönderir, <strong>Shift+Enter</strong> yeni satır.</p>
          <div class="ai-chat__messages" id="aiChatMessages">
            ${chatHistory.length ? chatHistory.map((m) => `
              <div class="ai-chat__bubble ai-chat__bubble--${m.role === "assistant" ? "bot" : "user"}">${escapeHtml(m.content)}</div>
            `).join("") : `<p class="muted small ai-chat__empty">Merhaba — CRM, stok, mail veya ayarlar hakkında soru sorabilirsiniz.</p>`}
          </div>
          <form id="aiChatForm" class="ai-chat__composer">
            <textarea id="aiChatInput" rows="3" placeholder="Mesajınızı yazın…" required></textarea>
            <div class="flex" style="gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center">
              <button type="submit" class="btn btn--primary">Gönder</button>
              <button type="button" class="btn btn--ghost btn--sm" id="aiChatClear">Temizle</button>
            </div>
          </form>
        </div>
        </div>
        <div id="autoTabTemplates" hidden>
        <div class="panel" id="autoFormPanel">
          <div class="panel__head">
            <h2>${escapeHtml(t.name)}</h2>
            <div class="flex" style="gap:8px;flex-wrap:wrap">
              ${t.customized ? `<span class="badge badge--ok">Özelleştirilmiş</span>` : `<span class="badge badge--muted">Varsayılan</span>`}
              <button type="button" class="btn btn--ghost btn--sm" id="autoReset">Varsayılana dön</button>
            </div>
          </div>
          <p class="form__hint muted small">Değişkenler: <code>{{firstName}}</code> <code>{{stockName}}</code> <code>{{purchasePlatform}}</code> <code>{{accessUrl}}</code> (erişim butonu). Mağaza linki platformda tanımlıysa mailin altında otomatik <strong>mağazayı ziyaret edin</strong> butonu eklenir. ${t.monthlyNote ? `<br>${escapeHtml(t.monthlyNote)}` : ""}</p>
          <form id="autoForm" class="form">
            <details class="auto-details" open>
              <summary><strong>Zamanlama & konular</strong></summary>
              <table class="table" style="margin:12px 0">
                <thead><tr><th>Ne zaman</th><th>Mail</th><th>Konu</th></tr></thead>
                <tbody>
                  ${t.steps.map((s, i) => `
                    <tr>
                      <td class="muted small">${escapeHtml(describeOffset(s.offsetDays, s.kind))}</td>
                      <td><span class="badge">${escapeHtml(TEMPLATE_LABELS[s.template] || s.kind)}</span></td>
                      <td>${s.kind === "access" ? `<span class="muted small">Konu access şablonundan</span>` : `<input class="form__field" style="width:100%;padding:8px" name="subject_${i}" value="${escapeHtml(s.subject)}" maxlength="200">`}</td>
                    </tr>`).join("")}
                </tbody>
              </table>
            </details>
            ${bodyKeys.map((key) => `
            <details class="auto-details">
              <summary><strong>${escapeHtml(TEMPLATE_LABELS[key] || key)}</strong> — HTML gövde</summary>
              <textarea name="body_${escapeHtml(key)}" rows="8" class="auto-ta">${escapeHtml((t.bodies && t.bodies[key]) || "")}</textarea>
            </details>`).join("")}
            <details class="auto-details" open>
              <summary><strong>Erişim maili (access)</strong></summary>
              <textarea name="body_access" rows="8" class="auto-ta">${escapeHtml(t.bodies?.access || "")}</textarea>
            </details>
            <button type="submit" class="btn btn--primary" style="margin-top:12px">Şablonları kaydet</button>
          </form>
        </div>
        </div>
      `;

      $$("[data-auto-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          $$("[data-auto-tab]").forEach((b) => b.classList.toggle("active", b === btn));
          const tab = btn.dataset.autoTab;
          $("#autoTabChat").hidden = tab !== "chat";
          $("#autoTabTemplates").hidden = tab !== "templates";
        });
      });

      const saveChat = (msgs) => {
        try {
          sessionStorage.setItem("crm:ai-chat", JSON.stringify(msgs.slice(-40)));
        } catch { /* ignore */ }
      };
      const appendBubble = (role, content) => {
        const box = $("#aiChatMessages");
        const empty = box?.querySelector(".ai-chat__empty");
        if (empty) empty.remove();
        const div = document.createElement("div");
        div.className = `ai-chat__bubble ai-chat__bubble--${role === "assistant" ? "bot" : "user"}`;
        div.textContent = content;
        box?.appendChild(div);
        box?.scrollTo(0, box.scrollHeight);
      };
      const applyAiResult = (generated, save) => {
        const form = $("#autoForm");
        if (!form) return;
        generated.steps.forEach((s, i) => {
          const sub = form.querySelector(`[name="subject_${i}"]`);
          if (sub && s.subject) sub.value = s.subject;
        });
        for (const [key, html] of Object.entries(generated.bodies || {})) {
          const ta = form.querySelector(`[name="body_${key}"]`);
          if (ta && html) ta.value = html;
        }
        $$("[data-auto-tab]").forEach((b) => b.classList.toggle("active", b.dataset.autoTab === "templates"));
        $("#autoTabChat").hidden = true;
        $("#autoTabTemplates").hidden = false;
        $("#autoFormPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (save) flash("OpenAI şablonları kaydedildi");
        else flash("Üretildi — E-posta şablonları sekmesinde kontrol edip kaydedin");
      };

      let chatMsgs = [...chatHistory];
      const chatInput = $("#aiChatInput");
      chatInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          $("#aiChatForm")?.requestSubmit();
        }
      });

      bindSubmit($("#aiChatForm"), async () => {
        const text = (chatInput?.value || "").trim();
        if (!text) return;
        const submitBtn = $("#aiChatForm")?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        chatMsgs.push({ role: "user", content: text });
        appendBubble("user", text);
        chatInput.value = "";
        saveChat(chatMsgs);
        try {
          const { reply } = await api("/api/ai/chat", {
            method: "POST",
            body: JSON.stringify({ messages: chatMsgs }),
          });
          chatMsgs.push({ role: "assistant", content: reply });
          appendBubble("assistant", reply);
          saveChat(chatMsgs);
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      }, { closeModalOnSuccess: false });

      $("#aiChatClear")?.addEventListener("click", () => {
        chatMsgs = [];
        saveChat([]);
        $("#aiChatMessages").innerHTML = `<p class="muted small ai-chat__empty">Sohbet temizlendi.</p>`;
      });

      $("#autoReset")?.addEventListener("click", async () => {
        if (!confirm("Tüm özelleştirmeler silinsin, varsayılan metinlere dönülsün mü?")) return;
        await api("/api/automations/default/reset", { method: "POST" });
        flash("Varsayılan şablonlar yüklendi");
        await refreshView();
      });

      bindSubmit($("#autoForm"), async (fd) => {
        const data = Object.fromEntries(fd.entries());
        const steps = t.steps.map((s, i) => ({
          ...s,
          subject: data[`subject_${i}`] != null ? data[`subject_${i}`] : s.subject,
        }));
        const bodies = { ...(t.bodies || {}) };
        for (const key of [...bodyKeys, "access"]) {
          const v = data[`body_${key}`];
          if (v != null) bodies[key] = v;
        }
        await api("/api/automations/default", {
          method: "PATCH",
          body: JSON.stringify({ steps, bodies, name: t.name }),
        });
        flash("Otomasyon e-postaları kaydedildi");
        await refreshView();
      });
    },
  });

  const describeOffset = (d, kind) => {
    if (kind === "expired" && d === 0) return "Ürün süresi sonunda (stoktaki ay/gün)";
    if (d === 0) return "İlk erişimde (mail linkine ilk tıklama)";
    if (d < 0) return `Ürün bitişinden ${Math.abs(d)} gün önce`;
    return `İlk erişimden ${d} gün sonra`;
  };

  // ─── Settings ──────────────────────────────────────────────────────────────
  register("settings", {
    title: "Ayarlar",
    subtitle: "Admin e-posta/şifre ve müşteriye giden mail başlıkları (varsayılan example.com değil).",
    render: async () => {
      const s = await api("/api/settings");
      view.innerHTML = `
        <div class="panel" style="max-width:560px;margin-bottom:16px">
          <h3 style="margin:0 0 8px">E-posta gönderimi</h3>
          <p class="small" style="margin:0">
            ${s.emailLive
              ? "✅ <strong>Resend canlı</strong> — form ve erişim mailleri gider."
              : "❌ <strong>Henüz log modu</strong> — terminalde <code>npm run secrets:resend</code>, Resend’de domain doğrula, gönderen adresi ayarla."}
          </p>
          <p class="small" style="margin:10px 0 0">
            ${s.openaiConfigured
              ? `✅ <strong>OpenAI bağlı</strong>${s.openaiKeyPreview ? ` (${escapeHtml(s.openaiKeyPreview)})` : ""}`
              : "❌ <strong>OpenAI yok</strong> — aşağıya API anahtarını yapıştırıp kaydedin."}
          </p>
        </div>
        <div class="panel" style="max-width:560px">
          <form id="settingsForm" class="form">
            <h3 style="margin:0 0 12px">Marka & e-posta</h3>
            <label class="form__field"><span>Uygulama adı</span>
              <input name="appName" required maxlength="80" value="${escapeHtml(s.appName || "")}">
            </label>
            <label class="form__field"><span>Gönderen e-posta</span>
              <input name="emailFrom" id="emailFromIn" type="email" required maxlength="120" value="${escapeHtml(s.emailFrom || s.effectiveEmailFrom || "")}" placeholder="noreply@salediscount.online">
              <p class="form__hint muted small">
                <strong>Şu an gönderen:</strong> <code>${escapeHtml(s.effectiveEmailFrom || "—")}</code>
                (${escapeHtml(s.emailFromSource || "—")}) — değişmesi için <strong>Kaydet</strong> gerekir.
                Resend’de <code>salediscount.online</code> doğrulanmalı.
              </p>
            </label>
            <label class="form__field"><span>Gönderen görünen ad</span>
              <input name="emailFromName" required maxlength="80" value="${escapeHtml(s.emailFromName || "")}">
            </label>
            <label class="form__field"><span>Müşteri linkleri (public worker)</span>
              <input name="publicBaseUrl" id="publicBaseUrlIn" type="text" maxlength="200" value="${escapeHtml(s.publicBaseUrl || s.publicSiteUrl || "")}" placeholder="https://links.salediscount.online">
              <p class="form__hint muted small"><code>https://</code> yazmasanız da olur — kayıtta otomatik eklenir.</p>
            </label>
            <label class="form__field"><span>Admin panel adresi</span>
              <input name="adminBaseUrl" id="adminBaseUrlIn" type="text" maxlength="200" value="${escapeHtml(s.adminBaseUrl || s.adminSiteUrl || "")}" placeholder="crm.salediscount.online veya https://…">
              <p class="form__hint muted small">Giriş, e-posta doğrulama ve şifre sıfırlama linkleri bu adreste açılır.</p>
            </label>
            <p class="form__hint muted small">Kaynak: <strong>${escapeHtml(s.source || "—")}</strong>${s.adminEmail ? ` · Admin: ${escapeHtml(s.adminEmail)}` : ""}</p>
            <hr style="border:0;border-top:1px solid var(--border);margin:20px 0">
            <h3 style="margin:0 0 12px">OpenAI (asistan & mail üretimi)</h3>
            <label class="form__field"><span>API anahtarı</span>
              <input name="openaiApiKey" type="password" autocomplete="off" placeholder="${s.openaiConfigured ? "Dolu — değiştirmek için yeni sk-… yapıştırın" : "sk-proj-…"}">
              <p class="form__hint muted small">Panelde güvenli saklanır. Boş bırakırsanız mevcut anahtar kalır.</p>
            </label>
            <hr style="border:0;border-top:1px solid var(--border);margin:20px 0">
            <h3 style="margin:0 0 12px">Admin hesabı</h3>
            <label class="form__field"><span>Yeni admin e-posta</span>
              <input name="adminEmail" type="email" maxlength="254" placeholder="${escapeHtml(s.adminEmail || "boş = değişmez")}">
            </label>
            <label class="form__field"><span>Mevcut şifre <em>*</em></span>
              <input name="currentPassword" type="password" autocomplete="current-password" placeholder="Değişiklik için gerekli">
            </label>
            <label class="form__field"><span>Yeni şifre</span>
              <input name="newPassword" type="password" autocomplete="new-password" minlength="8" placeholder="boş = değişmez">
            </label>
            <button type="submit" class="btn btn--primary">Kaydet</button>
          </form>
        </div>
      `;
      const normUrlInput = (v) => {
        const t = String(v || "").trim();
        if (!t) return "";
        return /^https?:\/\//i.test(t) ? t.replace(/\/+$/, "") : `https://${t.replace(/\/+$/, "")}`;
      };

      bindSubmit($("#settingsForm"), async (fd) => {
        const data = Object.fromEntries(fd.entries());
        if (data.publicBaseUrl) data.publicBaseUrl = normUrlInput(data.publicBaseUrl);
        if (data.adminBaseUrl) data.adminBaseUrl = normUrlInput(data.adminBaseUrl);
        if (!data.openaiApiKey?.trim()) delete data.openaiApiKey;
        if (!data.currentPassword?.trim() && (data.adminEmail || data.newPassword)) {
          throw new Error("E-posta veya şifre değişimi için mevcut şifre gerekli");
        }
        const hasAdminChange = data.adminEmail?.trim() || data.newPassword?.trim();
        if (!hasAdminChange) {
          delete data.currentPassword;
          delete data.adminEmail;
          delete data.newPassword;
        } else {
          if (!data.adminEmail?.trim()) delete data.adminEmail;
          if (!data.newPassword?.trim()) delete data.newPassword;
        }
        await api("/api/settings", { method: "PATCH", body: JSON.stringify(data) });
        await loadSiteUrls();
        flash("Ayarlar kaydedildi — stok linkleri artık müşteri domainini kullanır");
      });
    },
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function initShellControls() {
    const themeBtn = $("#themeToggle");
    const clearBtn = $("#clearCacheBtn");
    if (!themeBtn || themeBtn.dataset.bound) return;
    themeBtn.dataset.bound = "1";

    const applyTheme = (t) => {
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("ri-theme", t);
      themeBtn.textContent = t === "light" ? "🌙" : "☀️";
      themeBtn.title = t === "light" ? "Koyu mod" : "Açık mod";
    };
    applyTheme(localStorage.getItem("ri-theme") || "dark");

    themeBtn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(cur === "light" ? "dark" : "light");
    });

    $("#panelLang")?.addEventListener("change", async (e) => {
      panelLang = e.target.value === "en" ? "en" : "tr";
      localStorage.setItem("crm:panel-lang", panelLang);
      applyPanelNavLang();
      await refreshView({ silent: true });
    });

    clearBtn?.addEventListener("click", async () => {
      if (!confirm("Tarayıcı önbelleği temizlensin ve veriler yeniden yüklensin mi?\n(Giriş oturumun kalır.)")) return;
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch { /* ignore */ }
      const hash = location.hash || "#overview";
      location.replace(`/admin?fresh=${Date.now()}${hash}`);
    });
  }

  initShellControls();
  applyPanelNavLang();
  loadRoute();
})();
