/**
 * Uygulama ayarları (KV) — admin e-posta/şifre ve e-posta gönderen bilgileri.
 * İlk kurulumda wrangler secret yerine panelden kayıt olunabilir.
 */

import { getJson, putJson } from "./kv.js";
import { sha256Hex, nowIso } from "../utils/helpers.js";
import { requireEmail, requireString, normalizeHttpUrl, ValidationError } from "../utils/validation.js";
const SETTINGS_KEY = "settings:app";

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function getStoredSettings(env) {
  return (await getJson(env.SESSIONS, SETTINGS_KEY)) || null;
}

/** Admin + marka ayarları (şifre hash dönmez). */
export async function getAppSettings(env) {
  const stored = await getStoredSettings(env);
  const envConfigured = Boolean(
    (env.ADMIN_EMAIL || "").trim() && (env.ADMIN_PASSWORD || ""),
  );
  if (stored?.adminPasswordHash && stored?.adminEmail) {
    return {
      configured: true,
      source: "kv",
      adminEmail: stored.adminEmail,
      appName: stored.appName || env.APP_NAME || "CRM",
      emailFrom: stored.emailFrom || env.EMAIL_FROM || "",
      emailFromName: stored.emailFromName || env.EMAIL_FROM_NAME || "",
      publicBaseUrl: stored.publicBaseUrl || env.PUBLIC_BASE_URL || "",
      adminBaseUrl: stored.adminBaseUrl || env.ADMIN_BASE_URL || "",
      setupAt: stored.setupAt || null,
    };
  }
  return {
    configured: envConfigured,
    source: envConfigured ? "env" : "none",
    adminEmail: envConfigured ? (env.ADMIN_EMAIL || "").trim().toLowerCase() : null,
    appName: env.APP_NAME || "CRM",
    emailFrom: env.EMAIL_FROM || "",
    emailFromName: env.EMAIL_FROM_NAME || "",
    publicBaseUrl: env.PUBLIC_BASE_URL || "",
    adminBaseUrl: env.ADMIN_BASE_URL || "",
    setupAt: null,
  };
}

/** Müşteri linkleri (ayrı public worker) — KV veya PUBLIC_BASE_URL. */
export async function getPublicBaseUrl(env) {
  const s = await getStoredSettings(env);
  const raw = (s?.publicBaseUrl || env.PUBLIC_BASE_URL || "").trim();
  return raw.replace(/\/$/, "");
}

/** Admin panel (ayrı admin worker) — doğrulama / şifre sıfırlama mailleri. */
export async function getAdminBaseUrl(env) {
  const s = await getStoredSettings(env);
  const raw = (s?.adminBaseUrl || env.ADMIN_BASE_URL || env.PUBLIC_BASE_URL || "").trim();
  return raw.replace(/\/$/, "");
}

export async function hashAdminPassword(env, email, password) {
  const pepper = env.HASH_PEPPER || "default-pepper";
  return sha256Hex(`admin:v2:${String(email).trim().toLowerCase()}:${password}:${pepper}`);
}

export async function adminCookieValue(env, { email, passwordHash }) {
  return sha256Hex(`admin:cookie:v2:${email}:${passwordHash}`);
}

/** E-posta / UI için efektif config (KV öncelikli). */
/** Wrangler secret veya panelden kaydedilen KV anahtarı. */
export async function resolveOpenAIKey(env) {
  if (env.OPENAI_API_KEY) return env.OPENAI_API_KEY;
  const stored = await getStoredSettings(env);
  return stored?.openaiApiKey || null;
}

export function maskOpenAIKey(key) {
  if (!key || key.length < 12) return null;
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export async function isOpenAIConfigured(env) {
  return Boolean(await resolveOpenAIKey(env));
}

export async function getEffectiveConfig(env) {
  const s = await getStoredSettings(env);
  return {
    APP_NAME: s?.appName || env.APP_NAME || "CRM",
    EMAIL_FROM: s?.emailFrom || env.EMAIL_FROM || "noreply@example.com",
    EMAIL_FROM_NAME: s?.emailFromName || env.EMAIL_FROM_NAME || "CRM",
  };
}

export async function isAdminConfigured(env) {
  const st = await getAppSettings(env);
  return st.configured;
}

export async function verifyStoredAdminLogin(env, email, password) {
  const stored = await getStoredSettings(env);
  if (!stored?.adminPasswordHash || !stored?.adminEmail) return null;
  const gotEmail = String(email || "").trim().toLowerCase();
  if (gotEmail !== stored.adminEmail) return false;
  const hash = await hashAdminPassword(env, gotEmail, password);
  return timingSafeEqual(hash, stored.adminPasswordHash);
}

export async function expectedAdminCookieFromSettings(env) {
  const stored = await getStoredSettings(env);
  if (!stored?.adminPasswordHash || !stored?.adminEmail) return null;
  return adminCookieValue(env, {
    email: stored.adminEmail,
    passwordHash: stored.adminPasswordHash,
  });
}

/** İlk kurulum — yalnızca henüz admin yokken. */
export async function setupAdminAccount(env, input) {
  if (await isAdminConfigured(env)) {
    throw new ValidationError("Admin zaten tanımlı. Ayarlar sayfasından güncelleyin.");
  }
  const email = requireEmail(input.email, "email");
  const password = requireString(input.password, "password", { min: 8, max: 128 });
  const confirm = requireString(input.passwordConfirm || input.confirm, "passwordConfirm", {
    min: 8,
    max: 128,
  });
  if (password !== confirm) throw new ValidationError("Şifreler eşleşmiyor", "passwordConfirm");

  const appName = requireString(input.appName || env.APP_NAME || "CRM", "appName", { max: 80 });
  const emailFrom = requireString(input.emailFrom || env.EMAIL_FROM || "", "emailFrom", { max: 120 });
  const emailFromName = requireString(
    input.emailFromName || env.EMAIL_FROM_NAME || appName,
    "emailFromName",
    { max: 80 },
  );

  const adminPasswordHash = await hashAdminPassword(env, email, password);
  const { isEmailLive } = await import("../utils/emailDriver.js");
  const needsVerify = isEmailLive(env);
  const publicRaw = String(input.publicBaseUrl || env.PUBLIC_BASE_URL || "").trim();
  const adminRaw = String(input.adminBaseUrl || env.ADMIN_BASE_URL || "").trim();
  const payload = {
    adminEmail: email.toLowerCase(),
    adminPasswordHash,
    appName,
    emailFrom,
    emailFromName,
    emailVerified: !needsVerify,
    setupAt: nowIso(),
    updatedAt: nowIso(),
  };
  if (publicRaw) payload.publicBaseUrl = normalizeHttpUrl(publicRaw, "publicBaseUrl");
  if (adminRaw) payload.adminBaseUrl = normalizeHttpUrl(adminRaw, "adminBaseUrl");
  await putJson(env.SESSIONS, SETTINGS_KEY, payload);
  return { settings: await getAppSettings(env), needsVerify };
}

async function migrateEnvAdminToKv(env, currentPassword) {
  const email = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email || !env.ADMIN_PASSWORD) return null;
  const { verifyAdminLogin } = await import("../utils/security.js");
  const ok = await verifyAdminLogin(env, email, currentPassword);
  if (!ok) throw new ValidationError("Mevcut şifre hatalı", "currentPassword");
  return {
    adminEmail: email,
    adminPasswordHash: await hashAdminPassword(env, email, currentPassword),
    appName: env.APP_NAME || "CRM",
    emailFrom: env.EMAIL_FROM || "",
    emailFromName: env.EMAIL_FROM_NAME || "",
    setupAt: nowIso(),
  };
}

/** Giriş yapmış admin — marka + isteğe bağlı admin bilgisi güncelleme. */
export async function updateAppSettings(env, input) {
  let stored = (await getStoredSettings(env)) || {};
  const next = { ...stored };

  if (input.appName !== undefined && String(input.appName).trim()) {
    next.appName = requireString(input.appName, "appName", { max: 80 });
  }
  if (input.emailFrom !== undefined && String(input.emailFrom).trim()) {
    next.emailFrom = requireString(input.emailFrom, "emailFrom", { max: 120 });
  }
  if (input.emailFromName !== undefined && String(input.emailFromName).trim()) {
    next.emailFromName = requireString(input.emailFromName, "emailFromName", { max: 80 });
  }
  if (input.publicBaseUrl !== undefined) {
    const v = String(input.publicBaseUrl || "").trim();
    if (!v) delete next.publicBaseUrl;
    else next.publicBaseUrl = normalizeHttpUrl(v, "publicBaseUrl");
  }
  if (input.adminBaseUrl !== undefined) {
    const v = String(input.adminBaseUrl || "").trim();
    if (!v) delete next.adminBaseUrl;
    else next.adminBaseUrl = normalizeHttpUrl(v, "adminBaseUrl");
  }

  const openaiRaw = input.openaiApiKey != null ? String(input.openaiApiKey).trim() : null;
  if (openaiRaw) {
    if (!openaiRaw.startsWith("sk-") || openaiRaw.length < 20) {
      throw new ValidationError("Geçerli bir OpenAI API anahtarı girin (sk-…)", "openaiApiKey");
    }
    next.openaiApiKey = openaiRaw;
  }

  const newEmail = input.adminEmail ? requireEmail(input.adminEmail, "adminEmail") : null;
  const newPassword = input.newPassword ? String(input.newPassword) : "";
  const currentPassword = input.currentPassword ? String(input.currentPassword) : "";

  if (!next.adminPasswordHash && currentPassword) {
    const migrated = await migrateEnvAdminToKv(env, currentPassword);
    if (migrated) Object.assign(next, migrated);
  }

  if (newEmail || newPassword) {
    if (!currentPassword) {
      throw new ValidationError("Değişiklik için mevcut şifre gerekli", "currentPassword");
    }
    const { verifyAdminLogin } = await import("../utils/security.js");
    const loginEmail = next.adminEmail || stored.adminEmail || (env.ADMIN_EMAIL || "").trim().toLowerCase();
    const ok = await verifyAdminLogin(env, loginEmail, currentPassword);
    if (!ok) throw new ValidationError("Mevcut şifre hatalı", "currentPassword");
    if (newEmail) next.adminEmail = newEmail.toLowerCase();
    if (newPassword) {
      if (newPassword.length < 8) throw new ValidationError("Yeni şifre en az 8 karakter", "newPassword");
      const emailForHash = next.adminEmail || loginEmail;
      next.adminPasswordHash = await hashAdminPassword(env, emailForHash, newPassword);
    }
  }

  if (!next.adminPasswordHash) {
    throw new ValidationError("Önce admin hesabı kurun veya mevcut şifrenizi girin");
  }

  next.updatedAt = nowIso();
  try {
    await putJson(env.SESSIONS, SETTINGS_KEY, next);
  } catch (err) {
    const msg = String(err?.message || err);
    if (/limit exceeded|quota/i.test(msg)) {
      throw new ValidationError(
        "Cloudflare KV günlük yazma kotası doldu (ücretsiz planda ~1000/gün). Yarın sıfırlanır veya Workers ücretli plana geçin.",
      );
    }
    throw err;
  }
  return getAppSettings(env);
}
