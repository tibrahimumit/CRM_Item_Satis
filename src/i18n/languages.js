/**
 * Müşteri dili + lead akışı metinleri + e-posta şablonları (platformdan bağımsız mağaza metni).
 */

export const LANG_OPTIONS = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "hi", label: "हिन्दी" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "pl", label: "Polski" },
  { code: "uk", label: "Українська" },
];

const SUPPORTED = new Set(LANG_OPTIONS.map((l) => l.code));

export function normalizeLang(code) {
  const c = String(code || "tr").toLowerCase().slice(0, 8);
  return SUPPORTED.has(c) ? c : "tr";
}

/** Platformdan bağımsız — genel mağaza / süreç anlatımı */
const INTRO = {
  tr: {
    title: "Hoş geldiniz — lütfen okuyun",
    productLine: "Satın aldığınız ürün:",
    langLabel: "Dil / Language",
    emailLangNote:
      "📧 Yukarıdan seçtiğin dilde gider tüm mailler — erişim linki, hatırlatmalar, süre bitişi… Hepsi aynı dilde, sana uygun. ✨",
    sections: [
      {
        h: "Bu sistem nasıl çalışır?",
        p: "Dijital ürün satışlarımızda her sipariş için <strong>tek kullanımlık</strong> bir erişim linki verilir. Bu sayfa o linkin ilk adımıdır: önce kuralları okursunuz, sonra bilgilerinizi girersiniz. Doğru bilgi → gizli erişim linki <strong>sadece e-postanıza</strong> gider (ItemSatış, G2G veya hangi platformdan aldıysanız). Linki burada görmezsiniz; maildeki <strong>🚀 Erişimi aç</strong> butonuna tıklayın. İlk tıklamada ürün süreniz başlar; hatırlatma ve bitiş mailleri de <strong>seçtiğiniz dilde</strong> gelir.",
      },
      {
        h: "Bu sayfa nasıl kullanılır?",
        p: "1) Dilini seç. 2) Metni okuyup <strong>Okudum, anladım</strong> de. 3) Ad soyad, e-posta ve mağazadaki kullanıcı adını gir. 4) Gönder — güvenli link sadece e-postana gelir. 📬",
      },
      {
        h: "E-posta gelmedi veya spam klasöründe?",
        p: "Erişim maili <strong>info@salediscount.online</strong> adresinden gelir. Gmail/Outlook bazen <strong>Spam / Gereksiz</strong> klasörüne atar — maili bulduğunuzda lütfen <strong>“Gereksiz değil”</strong> deyin; size daha iyi hizmet verebilmemiz için önemli. Birkaç gün içinde genelde gelen kutusuna geçer. Tekrar form göndermeyin; aynı link yalnızca bir kez kullanılır.",
      },
      {
        h: "Sonraki adımda ne gireceksiniz?",
        p: "<ul style='margin:8px 0 0;padding-left:18px;line-height:1.65'><li><strong>Ad soyad</strong> — siparişte yazdığınız tam isim (mağazadaki gerçek adınız)</li><li><strong>E-posta</strong> — erişim linki yalnızca buraya gönderilir</li><li><strong>Kullanıcı adınız</strong> — mağazada görünen nick; siparişi sizinle eşleştirmek için</li></ul>",
      },
      {
        h: "Yanlış bilgi girerseniz",
        p: "Yanlış e-posta, sahte isim veya yanlış platform bilgisi → sipariş eşleşmez; kurulum, süre uzatma ve destek <strong>verilemeyebilir</strong>. Form <strong>bir kez</strong> kullanılır.",
      },
      {
        h: "Memnun kalırsanız 💜",
        p: "Tam puan ⭐ ve güzel bir yorum bırakırsanız çok seviniriz. Hediyenizi almak için satın aldığınız platformun <strong>mesaj kutusundan</strong> bize yazabilirsiniz — sürprizinizi iletelim.",
      },
    ],
    agreeBtn: "Okudum, anladım — forma geç",
    footer: "Kolay gelsin! 💜",
  },
  en: {
    title: "Welcome — please read",
    productLine: "Your product:",
    langLabel: "Language",
    emailLangNote:
      "📧 Pick your language above — access email, reminders, expiry notices… all in <strong>that</strong> language. We've got you. ✨",
    sections: [
      {
        h: "How does this work?",
        p: "This is a <strong>one-time</strong> access form. If your details are correct, a private access link is sent <strong>only to your email</strong>. You will not see the link here — use the button in the email.",
      },
      {
        h: "What you will enter next",
        p: "<ul style='margin:8px 0 0;padding-left:18px;line-height:1.65'><li><strong>Full name</strong> — exactly as on your order</li><li><strong>Email</strong> — your private access link is sent here only</li><li><strong>Your username</strong> — nickname on the store, to match your order</li></ul>",
      },
      {
        h: "Email missing or in spam?",
        p: "Messages come from <strong>info@salediscount.online</strong>. If you find our mail in <strong>Spam</strong>, please mark it as <strong>not spam</strong> so we can serve you better. It usually moves to your inbox within a few days. Do not submit the form twice; each link works once.",
      },
      {
        h: "If information is wrong",
        p: "Wrong email, fake name or wrong marketplace details may prevent matching your order; support and extensions may be <strong>denied</strong>. The form works <strong>once</strong>.",
      },
      {
        h: "Happy with the product? 💜",
        p: "Leave a ⭐ rating and a kind review if you like. For a thank-you gift, message us on the <strong>same marketplace</strong> where you purchased.",
      },
    ],
    agreeBtn: "I have read and understood — continue",
    footer: "Take care! 💜",
  },
};

// Diğer diller — EN tabanlı kısa çeviri (mail şablonları da aynı dilde)
for (const code of ["ru", "de", "es", "fr", "hi", "zh", "ar", "pt", "it", "pl", "uk"]) {
  if (!INTRO[code]) INTRO[code] = { ...INTRO.en, langLabel: LANG_OPTIONS.find((l) => l.code === code)?.label || code };
}

const FORM = {
  tr: {
    title: "Erişim bilgileri",
    subtitle:
      "Siparişinizi eşleştirmek için mağazadaki bilgilerinizi <strong>aynen</strong> yazın. Güvenli erişim linki yalnızca e-postanıza gider. 📬",
    storeLine:
      "🏪 Bu ürün <strong>{{store}}</strong> mağazasına bağlı — kullanıcı adınızı o mağazadaki nick ile <strong>aynı</strong> girin.",
    fullName: "Ad soyad (siparişteki tam isim)",
    fullNameHint: "Mağazada sipariş verirken yazdığınız gerçek ad soyad — uydurma veya kısaltma kullanmayın.",
    fullNamePh: "Örn. Ahmet Yılmaz",
    email: "E-posta",
    emailPh: "siz@ornek.com",
    emailSpamHint:
      "📬 Mail gelmezse <strong>Spam / Gereksiz</strong> klasörüne bakın; bulursanız <strong>Gereksiz değil</strong> deyin — size daha iyi hizmet verelim. Gönderen: <strong>info@salediscount.online</strong>",
    platformUsername: "Mağazadaki kullanıcı adınız",
    platformUsernameHint:
      "Sitede profilinizde görünen nick veya kullanıcı adı — siparişi sizinle eşleştirmek için gerekli.",
    platformUsernamePh: "Örn. SaleDiscount",
    submit: "Güvenli erişim linki gönder",
    legal: "Gönderimden sonra bu sayfa kapanır. Erişim linki yalnızca e-postanızdadır; burada gösterilmez.",
    nameWarn:
      "⚠️ Lütfen mağazadaki <strong>gerçek ad soyadınızı</strong> yazın. Yanlış veya uydurma bilgi verirseniz siparişiniz eşleşmez ve destek veremeyebiliriz.",
    storeNote:
      "💖 Memnun kalırsanız mağazamızı takip edin — tam puan ⭐ ve güzel bir yorum bizim için çok değerli! 🎁 Küçük bir hediye için satın aldığınız mağazanın <strong>mesaj kutusundan</strong> bize yazmanız yeterli.",
  },
  en: {
    title: "Access details",
    subtitle:
      "Enter your store details <strong>exactly as on your order</strong>. Your private access link is sent <strong>only</strong> to your email. 📬",
    storeLine:
      "🏪 This product is linked to <strong>{{store}}</strong> — use the <strong>same</strong> username/nick you have there.",
    fullName: "Full name (as on your order)",
    fullNameHint: "The real name on your marketplace order — no nicknames or fake names.",
    fullNamePh: "e.g. John Smith",
    email: "Email",
    emailPh: "you@example.com",
    emailSpamHint:
      "📬 Check <strong>Spam</strong> if needed; mark as <strong>not spam</strong> so we can serve you better. From: <strong>info@salediscount.online</strong>",
    platformUsername: "Your store username",
    platformUsernameHint: "The nickname shown on your profile — we use it to match your order.",
    platformUsernamePh: "e.g. SaleDiscount",
    submit: "Send secure access link",
    legal: "This page closes after submit. The access link is only in your email — not shown here.",
    nameWarn:
      "⚠️ Please enter your <strong>real full name</strong> from the store. Wrong or fake details may prevent matching your order and support.",
    storeNote:
      "💖 If you're happy, follow our store — a ⭐ rating and kind review mean a lot! 🎁 For a small thank-you gift, message us from your marketplace <strong>inbox</strong>.",
  },
};

for (const code of SUPPORTED) {
  if (code !== "tr" && code !== "en" && !FORM[code]) FORM[code] = { ...FORM.en };
}

export function getIntroCopy(lang) {
  const l = normalizeLang(lang);
  return INTRO[l] || INTRO.tr;
}

export function getFormCopy(lang) {
  const l = normalizeLang(lang);
  return FORM[l] || FORM.tr;
}

export function getLockedCopy(lang) {
  const l = normalizeLang(lang);
  const m = {
    tr: "Bu link zaten kullanıldı. Yeniden almak için satın aldığınız platformdan tekrar satın alın.",
    en: "This link was already used. To buy again, purchase again on your marketplace.",
  };
  return m[l] || m.en;
}

function renderIntroSectionsHtml(copy) {
  return (copy.sections || [])
    .map(
      (s) =>
        `<section class="intro-block" style="margin:0 0 18px"><h2 style="font-size:15px;margin:0 0 8px;color:#e2e8f0">${s.h}</h2><div class="muted" style="font-size:14px;line-height:1.65">${s.p}</div></section>`,
    )
    .join("");
}

/** Sayfa yenilemeden dil değiştirmek için tüm metinler (müşteri tarafı). */
export function buildLeadI18nBundle(storeName = "") {
  const store = String(storeName || "").trim();
  const bundle = {};
  for (const { code } of LANG_OPTIONS) {
    const intro = getIntroCopy(code);
    const form = getFormCopy(code);
    const storeLine = form.storeLine ? form.storeLine.replace(/\{\{store\}\}/g, store) : "";
    bundle[code] = {
      intro: {
        title: intro.title,
        productLine: intro.productLine,
        langLabel: intro.langLabel,
        emailLangNote: intro.emailLangNote || "",
        sectionsHtml: renderIntroSectionsHtml(intro),
        agreeBtn: intro.agreeBtn,
        footer: intro.footer,
      },
      form: {
        title: form.title,
        subtitle: form.subtitle || "",
        storeLineHtml: storeLine,
        fullName: form.fullName,
        fullNameHint: form.fullNameHint || "",
        fullNamePh: form.fullNamePh,
        email: form.email,
        emailPh: form.emailPh,
        emailSpamHint: form.emailSpamHint || "",
        platformUsername: form.platformUsername,
        platformUsernameHint: form.platformUsernameHint || "",
        platformUsernamePh: form.platformUsernamePh,
        nameWarn: form.nameWarn || "",
        storeNote: form.storeNote || "",
        submit: form.submit,
        legal: form.legal,
      },
      locked: getLockedCopy(code),
      ui: {
        sending: code === "tr" ? "Gönderiliyor…" : "Sending…",
        success:
          code === "tr"
            ? "E-postanızı kontrol edin — erişim linki orada. Bu sayfa artık kullanılamaz."
            : "Check your email for the access link. This page cannot be used again.",
        error: code === "tr" ? "Hata" : "Error",
        unavailable: code === "tr" ? "Kullanılamaz" : "Unavailable",
      },
    };
  }
  return bundle;
}

/** E-posta şablon gövdeleri — {{vars}} aynı */
const EMAIL_BODIES = {
  tr: {
    access: `
    <p style="font-size:18px;margin:0 0 14px">Selam <strong>{{firstName}}</strong> 🎉</p>
    <p><strong>{{stockName}}</strong> hazır — erişim linkiniz aşağıda.</p>
    <p style="background:#f8fafc;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6">
      📌 İlk tıklamada süreniz başlar. Link: <strong>{{accessLinkExpiresLabel}}</strong>{{accessMaxVisitsNote}}.
    </p>
    <p style="text-align:center;margin:28px 0">
      <a href="{{accessUrl}}" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:16px 32px;border-radius:14px;text-decoration:none;font-weight:700;display:inline-block;font-size:16px">🚀 Erişimi aç</a>
    </p>
    <p style="font-size:14px;color:#64748b">Platform: <strong>{{purchasePlatform}}</strong> · Kullanıcı: <strong>{{platformUsername}}</strong></p>
    `,
    expired: `
    <p>Merhaba {{firstName}}, <strong>{{stockName}}</strong> süreniz (<strong>{{productDurationLabel}}</strong>) doldu.</p>
    <p style="font-size:14px">Yeniden almak için <strong>{{purchasePlatform}}</strong> üzerinden satın alabilirsiniz.</p>
    `,
    welcome: `
    <p>Merhaba <strong>{{firstName}}</strong> 👋</p>
    <p><strong>{{stockName}}</strong> siparişiniz için teşekkürler! Erişim linki ayrı bir e-postada.</p>
    <p style="font-size:14px;color:#64748b">Tüm mailler seçtiğiniz dilde gönderilir.</p>
    `,
    "expiring-7": `
    <p>{{firstName}}, <strong>{{stockName}}</strong> süreniz <strong>7 gün</strong> içinde bitiyor ({{productDurationLabel}}).</p>
    <p style="font-size:14px">Uzatmak için <strong>{{purchasePlatform}}</strong> üzerinden yenileyebilirsiniz.</p>
    `,
    "expiring-3": `
    <p>{{firstName}}, <strong>{{stockName}}</strong> erişiminiz <strong>bitmek üzere</strong> — <strong>3 gün</strong> kaldı.</p>
    <p style="font-size:14px">Uzatmak için <strong>{{purchasePlatform}}</strong> üzerinden yenileyebilirsiniz.</p>
    `,
    expiring: `
    <p>{{firstName}}, <strong>{{stockName}}</strong> süreniz 7 gün içinde bitiyor ({{productDurationLabel}}).</p>
    <p style="font-size:14px">Uzatmak için <strong>{{purchasePlatform}}</strong> üzerinden yenileyebilirsiniz.</p>
    `,
    "expiring-final": `
    <p>{{firstName}}, <strong>{{stockName}}</strong> için yarın son gün 🔔</p>
    <p style="font-size:14px"><strong>{{purchasePlatform}}</strong> üzerinden yenileyebilirsiniz.</p>
    `,
    upsell: `
    <p>{{firstName}}, merhaba! 👋 Mağazamızda yeni fırsatlar var — göz atın 😊</p>
    `,
    "upsell-monthly": `
    <p>Merhaba <strong>{{firstName}}</strong> 👋</p>
    <p><strong>{{stockName}}</strong> ile devam ediyor musunuz? Mağazamızı kontrol edin 🛒</p>
    <p style="font-size:14px">Satın alımınızdan <strong>memnun musunuz?</strong> Öneri ve görüşlerinizi bekliyoruz — bu maile cevap verebilir veya <strong>{{purchasePlatform}}</strong> üzerinden yazabilirsiniz.</p>
    `,
  },
  en: {
    access: `
    <p style="font-size:18px;margin:0 0 14px">Hi <strong>{{firstName}}</strong> 🎉</p>
    <p><strong>{{stockName}}</strong> is ready.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="{{accessUrl}}" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:16px 32px;border-radius:14px;text-decoration:none;font-weight:700">🚀 Open access</a>
    </p>
    <p style="font-size:14px;color:#64748b">Platform: <strong>{{purchasePlatform}}</strong> · User: <strong>{{platformUsername}}</strong></p>
    `,
    expired: `
    <p>Hi {{firstName}}, your <strong>{{stockName}}</strong> period (<strong>{{productDurationLabel}}</strong>) has ended.</p>
    <p style="font-size:14px">Purchase again on <strong>{{purchasePlatform}}</strong> if you wish to renew.</p>
    `,
    welcome: `<p>Hi <strong>{{firstName}}</strong> 👋 Thanks for <strong>{{stockName}}</strong>. Access link is in a separate email.</p>`,
    "expiring-7": `<p>Hi {{firstName}}, <strong>{{stockName}}</strong> ends in 7 days.</p>`,
    "expiring-3": `<p>Hi {{firstName}}, your <strong>{{stockName}}</strong> access is <strong>ending soon</strong> — 3 days left.</p>`,
    expiring: `<p>Hi {{firstName}}, <strong>{{stockName}}</strong> ends in 7 days.</p>`,
    "expiring-final": `<p>Hi {{firstName}}, last day tomorrow for <strong>{{stockName}}</strong>.</p>`,
    upsell: `<p>Hi {{firstName}}! 👋 New offers in our store.</p>`,
    "upsell-monthly": `<p>Hi {{firstName}}! Still enjoying <strong>{{stockName}}</strong>? Check our store 🛒 We'd love your feedback — reply to this email.</p>`,
  },
};

for (const code of SUPPORTED) {
  if (!EMAIL_BODIES[code]) EMAIL_BODIES[code] = EMAIL_BODIES.en;
}

export function getLocalizedEmailBody(kind, lang) {
  const l = normalizeLang(lang);
  const pack = EMAIL_BODIES[l] || EMAIL_BODIES.tr;
  return pack[kind] || EMAIL_BODIES.tr[kind] || "";
}

export const EMAIL_SUBJECTS = {
  tr: {
    welcome: "{{firstName}}, hoş geldiniz 💜",
    access: "{{firstName}}, {{stockName}} hazır 🎁",
    "expiring-7": "{{firstName}}, süreniz 7 gün içinde bitiyor",
    "expiring-3": "{{firstName}}, erişiminiz bitmek üzere ⏳",
    expiring: "{{firstName}}, süreniz bitiyor",
    "expiring-final": "Yarın son gün — {{stockName}}",
    expired: "{{firstName}}, {{stockName}} süreniz doldu",
    upsell: "{{firstName}}, mağazamızdan haberler",
    "upsell-monthly": "{{firstName}}, mağazamızı kontrol edin 💜",
  },
  en: {
    welcome: "{{firstName}}, welcome 💜",
    access: "{{firstName}}, {{stockName}} is ready 🎁",
    "expiring-7": "{{firstName}}, your access ends in 7 days",
    "expiring-3": "{{firstName}}, your access is ending soon",
    expiring: "{{firstName}}, your access is ending soon",
    "expiring-final": "Last day tomorrow — {{stockName}}",
    expired: "{{firstName}}, your {{stockName}} access ended",
    upsell: "{{firstName}}, news from our store",
    "upsell-monthly": "{{firstName}}, check our store — we value your feedback",
  },
};

export function getLocalizedEmailSubject(kind, lang) {
  const l = normalizeLang(lang);
  const pack = EMAIL_SUBJECTS[l] || EMAIL_SUBJECTS.tr;
  return pack[kind] || EMAIL_SUBJECTS.tr[kind] || "{{stockName}}";
}
