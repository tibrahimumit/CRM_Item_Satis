/**
 * OpenAI — e-posta şablonu üretimi ve CRM asistan sohbeti.
 */

import { ValidationError } from "../utils/validation.js";
import { resolveOpenAIKey } from "./settings.js";

const SYSTEM = `Sen çoklu platformda dijital ürün satan bir mağaza için Türkçe e-posta şablonu yazarısın.
Yanıtı YALNIZCA geçerli JSON olarak ver:
{
  "accessSubject": "string",
  "accessHtml": "string (HTML, buton href={{accessUrl}})",
  "welcomeSubject": "string",
  "welcomeHtml": "string",
  "expiringSubject": "string",
  "expiringHtml": "string"
}
Değişkenler: {{firstName}}, {{stockName}}, {{appName}}, {{accessUrl}}, {{purchasePlatform}}, {{platformUsername}}, {{productDurationLabel}}, {{accessLinkExpiresLabel}}, {{accessMaxVisitsNote}}
ItemSatış'a özel yazma — müşterinin aldığı platform için {{purchasePlatform}} kullan.
Erişim mailinde: aktivasyon adımları, hediye için tam puan+yorum sonrası {{purchasePlatform}} mesaj kutusu.
Erişim mailinde düz URL metni yok; {{accessUrl}} sadece butonda.
Süre dolumu maillerinde renew/tekrar al butonu yok — {{purchasePlatform}} üzerinden yeniden alın yaz.
Ton: samimi, net, emojili.`;

const CHAT_SYSTEM = `Sen "Redirect Intelligence" dijital satış CRM asistanısın. Türkçe, pratik ve doğrudan yardım et.

Bildiğin sistem:
- Platformlar → Kategoriler → Stoklar (/r/kod linkleri). Stok formu tek kullanımlık; erişim mailde.
- Müşteri formu: ad, e-posta, satın alınan platform, platform kullanıcı adı, dil seçimi.
- E-posta kuyruğu: welcome, access, expiring, expired, upsell — müşteri diline göre.
- Admin: /admin/login, /admin/setup (ilk kayıt + e-posta doğrulama), /admin/forgot (şifre sıfırla).
- Ayarlar panelinde publicBaseUrl (müşteri: links.salediscount.online) ve adminBaseUrl (crm.salediscount.online).

Yanıt stili:
1) Kısa özet (1 cümle)
2) Madde madde adımlar veya örnek metin
3) Gerekirse dikkat edilecek kural (form kilidi, mail değişkenleri)

ItemSatış varsayma; "satın aldığı platform" de. Şablon örneği verirken {{purchasePlatform}} kullan.
Kullanıcı HTML isterse sadece ilgili paragrafı ver; gereksiz JSON yığını yapma.`;

export async function generateProductEmailTemplates(env, { productName, productGuide, appName }) {
  const apiKey = await resolveOpenAIKey(env);
  if (!apiKey) {
    throw new ValidationError(
      "OpenAI bağlı değil. Ayarlar → OpenAI API anahtarı veya: npx wrangler secret put OPENAI_API_KEY",
    );
  }
  const name = (productName || "Ürün").trim();
  const guide = (productGuide || "").trim();
  const brand = appName || "Mağaza";

  const userPrompt = `Ürün: ${name}
Marka: ${brand}
${guide ? `Ürün / aktivasyon notları:\n${guide}` : "Genel dijital lisans — platformdan bağımsız ton."}

Tüm mailleri Türkçe yaz. accessHtml içinde hediye/teşekkür kutusu olsun ({{purchasePlatform}} mesajı).`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI (${res.status}): ${err.slice(0, 400)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI yanıtı JSON değil");
  }

  return {
    steps: [
      { offsetDays: 0, kind: "welcome", subject: parsed.welcomeSubject, template: "welcome" },
      { offsetDays: 0, kind: "access", subject: parsed.accessSubject, template: "access" },
      { offsetDays: -3, kind: "expiring", subject: parsed.expiringSubject, template: "expiring" },
    ],
    bodies: {
      welcome: parsed.welcomeHtml || "",
      access: parsed.accessHtml || "",
      expiring: parsed.expiringHtml || "",
    },
    raw: parsed,
  };
}

export async function chatWithAssistant(env, { messages, productName, productGuide, appName }) {
  const apiKey = await resolveOpenAIKey(env);
  if (!apiKey) {
    throw new ValidationError("OpenAI bağlı değil — Ayarlar sayfasından API anahtarı ekleyin");
  }
  const history = Array.isArray(messages) ? messages.slice(-16) : [];
  const ctx = [
    productName ? `Ürün bağlamı: ${productName}` : null,
    productGuide ? `Ürün notu:\n${productGuide}` : null,
    appName ? `Marka: ${appName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const apiMessages = [
    { role: "system", content: CHAT_SYSTEM + (ctx ? `\n\n${ctx}` : "") },
    ...history.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 8000),
    })),
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.45,
      max_tokens: 1200,
      messages: apiMessages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI (${res.status}): ${err.slice(0, 400)}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content?.trim() || "";
  return { reply };
}
