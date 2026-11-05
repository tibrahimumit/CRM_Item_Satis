/**
 * Admin panel — TR / EN (natural labels, not forced literal translations).
 */

export const PANEL_LANG_KEY = "crm:panel-lang";

export const LANG_OPTIONS = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
];

const STR = {
  tr: {
    overview: "Genel bakış",
    platforms: "Mağazalar",
    categories: "Kategoriler",
    stocks: "Stok & linkler",
    leads: "Lead'ler",
    customers: "Müşteriler",
    finance: "Muhasebe",
    emails: "E-posta kuyruğu",
    automations: "Otomasyonlar",
    settings: "Ayarlar",
    signOut: "Çıkış",
    live: "Canlı",
    refresh: "Yenile",
    theme: "Tema",
    lang: "Dil",
    financeTitle: "Muhasebe",
    financeSubtitle: "Mağaza kesintisi ve ilan fiyatına göre brüt, komisyon ve net gelir.",
    periodDay: "Bugün",
    periodWeek: "Bu hafta",
    periodMonth: "Bu ay",
    periodYear: "Bu yıl",
    gross: "Brüt",
    commission: "Komisyon",
    net: "Net",
    sales: "Satış",
    avgOrder: "Ort. sipariş",
    effectiveRate: "Efektif kesinti",
    byPlatform: "Mağazaya göre (bu ay)",
    byProduct: "Ürüne göre (son satışlar)",
    recentSales: "Son satışlar",
    noSales: "Henüz kayıtlı satış yok — lead + ilan fiyatı gerekir.",
    platform: "Mağaza",
    product: "Ürün",
    rate: "Kesinti %",
    when: "Zaman",
    selectBulk: "seçili",
    bulkDelete: "Seçilenleri sil",
    newPlatform: "Yeni mağaza",
    storeUrl: "Mağaza linki (opsiyonel)",
    commissionPercent: "Mağaza kesintisi (%)",
    listPrice: "İlandaki fiyat",
    listPriceHint: "Muhasebede brüt gelir bu fiyattan hesaplanır.",
    currency: "Para birimi",
    edit: "Düzenle",
    delete: "Sil",
    save: "Kaydet",
    cancel: "İptal",
    copied: "Kopyalandı",
    saved: "Kaydedildi",
    confirmDelete: "Silinsin mi?",
  },
  en: {
    overview: "Overview",
    platforms: "Stores",
    categories: "Categories",
    stocks: "Stocks & links",
    leads: "Leads",
    customers: "Customers",
    finance: "Finance",
    emails: "Email queue",
    automations: "Automations",
    settings: "Settings",
    signOut: "Sign out",
    live: "Live",
    refresh: "Refresh",
    theme: "Theme",
    lang: "Language",
    financeTitle: "Finance",
    financeSubtitle: "Gross, marketplace fee, and net revenue from listing price per sale.",
    periodDay: "Today",
    periodWeek: "This week",
    periodMonth: "This month",
    periodYear: "This year",
    gross: "Gross",
    commission: "Fee",
    net: "Net",
    sales: "Sales",
    avgOrder: "Avg. order",
    effectiveRate: "Effective fee",
    byPlatform: "By store (this month)",
    byProduct: "By product (recent)",
    recentSales: "Recent sales",
    noSales: "No sales yet — needs a completed lead and listing price on the stock.",
    platform: "Store",
    product: "Product",
    rate: "Fee %",
    when: "When",
    selectBulk: "selected",
    bulkDelete: "Delete selected",
    newPlatform: "New store",
    storeUrl: "Store URL (optional)",
    commissionPercent: "Marketplace fee (%)",
    listPrice: "Listing price",
    listPriceHint: "Gross revenue in finance is calculated from this price.",
    currency: "Currency",
    edit: "Edit",
    delete: "Delete",
    save: "Save",
    cancel: "Cancel",
    copied: "Copied",
    saved: "Saved",
    confirmDelete: "Delete?",
  },
};

export function normalizePanelLang(code) {
  return code === "en" ? "en" : "tr";
}

export function t(lang, key) {
  const l = normalizePanelLang(lang);
  return STR[l][key] ?? STR.en[key] ?? key;
}

export function allPanelStrings(lang) {
  const l = normalizePanelLang(lang);
  return { ...STR[l], lang: l };
}
