/**
 * Admin e-posta doğrulama ve şifre sıfırlama.
 */

import { getJson, putJson } from "./kv.js";
import { newId, nowIso } from "../utils/helpers.js";
import { requireEmail, ValidationError } from "../utils/validation.js";
import { sendEmail } from "./email.js";
import { getStoredSettings, hashAdminPassword } from "./settings.js";
import { isEmailLive } from "../utils/emailDriver.js";
import { getEffectiveConfig } from "./settings.js";

const SETTINGS_KEY = "settings:app";
const VERIFY_PREFIX = "auth:verify:";
const RESET_PREFIX = "auth:reset:";

function authEmailWrap(inner, cfg) {
  return `<!doctype html><html><body style="font-family:Inter,Segoe UI,sans-serif;background:#f1f5f9;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    ${inner}
    <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0">
    <p style="color:#94a3b8;font-size:12px;margin:0">${cfg.APP_NAME} · Bu maili siz istemediyseniz yok sayın.</p>
  </div></body></html>`;
}

export async function sendAdminVerificationEmail(env, email) {
  const token = `${newId()}${newId()}`;
  const normalized = email.toLowerCase();
  await env.SESSIONS.put(`${VERIFY_PREFIX}${token}`, normalized, { expirationTtl: 86400 });
  const cfg = await getEffectiveConfig(env);
  const { getAdminBaseUrl } = await import("./settings.js");
  const url = `${await getAdminBaseUrl(env)}/admin/verify?token=${encodeURIComponent(token)}`;
  const html = authEmailWrap(
    `<p style="font-size:18px;margin:0 0 12px">Merhaba 👋</p>
    <p><strong>${cfg.APP_NAME}</strong> admin hesabınızı doğrulamak için aşağıdaki butona tıklayın:</p>
    <p style="text-align:center;margin:24px 0">
      <a href="${url}" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600">E-postamı doğrula</a>
    </p>
    <p style="color:#64748b;font-size:13px;word-break:break-all">${url}</p>
    <p style="color:#64748b;font-size:13px">Link 24 saat geçerlidir.</p>`,
    cfg,
  );
  const result = await sendEmail(env, {
    to: normalized,
    subject: `${cfg.APP_NAME} — E-posta doğrulama`,
    html,
  });
  return { token, url, delivered: result.delivered !== false, result };
}

export async function confirmAdminVerification(env, token) {
  const email = await env.SESSIONS.get(`${VERIFY_PREFIX}${token}`);
  if (!email) return { ok: false, reason: "invalid" };
  const stored = await getStoredSettings(env);
  if (!stored || stored.adminEmail !== email) return { ok: false, reason: "mismatch" };
  await putJson(env.SESSIONS, SETTINGS_KEY, {
    ...stored,
    emailVerified: true,
    verifiedAt: nowIso(),
    updatedAt: nowIso(),
  });
  await env.SESSIONS.delete(`${VERIFY_PREFIX}${token}`);
  return { ok: true, email };
}

export async function isAdminEmailVerified(env) {
  const stored = await getStoredSettings(env);
  if (!stored?.adminPasswordHash) return true;
  if (stored.emailVerified === false) return false;
  return stored.emailVerified !== false;
}

export async function requireVerifiedAdminForLogin(env) {
  if (!isEmailLive(env)) return { ok: true, devMode: true };
  const verified = await isAdminEmailVerified(env);
  if (!verified) {
    return {
      ok: false,
      message: "E-postanızı doğrulayın. Gelen kutunuzu (ve spam) kontrol edin veya doğrulama mailini yeniden isteyin.",
    };
  }
  return { ok: true };
}

export async function resendVerificationEmail(env, email) {
  const stored = await getStoredSettings(env);
  const normalized = requireEmail(email, "email");
  if (!stored || stored.adminEmail !== normalized) {
    throw new ValidationError("Bu e-posta ile kayıtlı admin bulunamadı");
  }
  if (stored.emailVerified) throw new ValidationError("E-posta zaten doğrulanmış");
  return sendAdminVerificationEmail(env, normalized);
}

export async function sendPasswordResetEmail(env, email) {
  const stored = await getStoredSettings(env);
  const normalized = requireEmail(email, "email");
  if (!stored?.adminEmail || stored.adminEmail !== normalized) {
    return { sent: false, silent: true };
  }
  const token = `${newId()}${newId()}`;
  await env.SESSIONS.put(`${RESET_PREFIX}${token}`, normalized, { expirationTtl: 3600 });
  const cfg = await getEffectiveConfig(env);
  const { getAdminBaseUrl } = await import("./settings.js");
  const url = `${await getAdminBaseUrl(env)}/admin/reset?token=${encodeURIComponent(token)}`;
  const html = authEmailWrap(
    `<p style="font-size:18px;margin:0 0 12px">Şifre sıfırlama 🔐</p>
    <p>Admin şifrenizi sıfırlamak için (1 saat geçerli):</p>
    <p style="text-align:center;margin:24px 0">
      <a href="${url}" style="background:#6366f1;color:#fff;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600">Yeni şifre belirle</a>
    </p>
    <p style="color:#64748b;font-size:13px;word-break:break-all">${url}</p>`,
    cfg,
  );
  await sendEmail(env, {
    to: normalized,
    subject: `${cfg.APP_NAME} — Şifre sıfırlama`,
    html,
  });
  return { sent: true };
}

export async function resetAdminPassword(env, token, newPassword) {
  const email = await env.SESSIONS.get(`${RESET_PREFIX}${token}`);
  if (!email) throw new ValidationError("Link geçersiz veya süresi dolmuş");
  if (!newPassword || newPassword.length < 8) {
    throw new ValidationError("Şifre en az 8 karakter", "password");
  }
  const stored = await getStoredSettings(env);
  if (!stored || stored.adminEmail !== email) throw new ValidationError("Hesap bulunamadı");
  await putJson(env.SESSIONS, SETTINGS_KEY, {
    ...stored,
    adminPasswordHash: await hashAdminPassword(env, email, newPassword),
    emailVerified: true,
    updatedAt: nowIso(),
  });
  await env.SESSIONS.delete(`${RESET_PREFIX}${token}`);
  return { ok: true };
}
