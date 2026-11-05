/**
 * Admin dashboard view + auth endpoints.
 */

import { html, redirect } from "../utils/response.js";
import {
  isAdminRequest,
  buildAdminSetCookie,
  buildAdminLogoutCookie,
  verifyAdminLogin,
  verifyAdminToken,
} from "../utils/security.js";
import { requireEmail } from "../utils/validation.js";
import { parseFormBody } from "../utils/validation.js";
import { renderDashboard } from "../views/dashboard.js";
import { renderLogin } from "../views/login.js";
import { renderSetup } from "../views/setup.js";
import {
  renderVerifyPending,
  renderVerifyResult,
  renderForgotPassword,
  renderResetPassword,
} from "../views/authPages.js";
import { isAdminConfigured, setupAdminAccount, getEffectiveConfig } from "../services/settings.js";
import { ValidationError } from "../utils/validation.js";
import {
  sendAdminVerificationEmail,
  confirmAdminVerification,
  requireVerifiedAdminForLogin,
  sendPasswordResetEmail,
  resetAdminPassword,
  resendVerificationEmail,
} from "../services/adminAuth.js";
import { isEmailLive } from "../utils/emailDriver.js";

export async function handleDashboardShell(request, env) {
  if (!(await isAdminConfigured(env)) && !(await isAdminRequest(request, env))) {
    return redirect("/admin/setup");
  }
  if (!(await isAdminRequest(request, env))) return redirect("/admin/login");
  const cfg = await getEffectiveConfig(env);
  return html(renderDashboard({ appName: cfg.APP_NAME }));
}

export async function handleSetup(request, env) {
  if (await isAdminConfigured(env)) return redirect("/admin/login");
  const cfg = await getEffectiveConfig(env);
  if (request.method === "GET") {
    return html(
      renderSetup({
        appName: cfg.APP_NAME,
        emailFrom: cfg.EMAIL_FROM,
        emailFromName: cfg.EMAIL_FROM_NAME,
        error: null,
      }),
    );
  }
  const body = await parseFormBody(request);
  try {
    const { needsVerify } = await setupAdminAccount(env, body);
    if (needsVerify) {
      const sent = await sendAdminVerificationEmail(env, body.email);
      return html(
        renderVerifyPending({
          email: body.email,
          devLink: sent.delivered ? null : sent.url,
          appName: body.appName || cfg.APP_NAME,
        }),
      );
    }
    const cookie = await buildAdminSetCookie(env);
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin", "Set-Cookie": cookie },
    });
  } catch (e) {
    const msg = e instanceof ValidationError ? e.message : e.message || "Kurulum başarısız";
    return html(
      renderSetup({
        appName: body.appName || cfg.APP_NAME,
        emailFrom: body.emailFrom || cfg.EMAIL_FROM,
        emailFromName: body.emailFromName || cfg.EMAIL_FROM_NAME,
        error: msg,
      }),
      { status: 400 },
    );
  }
}

export async function handleVerify(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const cfg = await getEffectiveConfig(env);
  if (!token) return html(renderVerifyResult({ ok: false, appName: cfg.APP_NAME }));
  const result = await confirmAdminVerification(env, token);
  return html(renderVerifyResult({ ok: result.ok, appName: cfg.APP_NAME }));
}

export async function handleForgot(request, env) {
  const cfg = await getEffectiveConfig(env);
  if (request.method === "GET") {
    return html(renderForgotPassword({ appName: cfg.APP_NAME, error: null, sent: false }));
  }
  const body = await parseFormBody(request);
  try {
    await sendPasswordResetEmail(env, body.email);
    return html(renderForgotPassword({ appName: cfg.APP_NAME, error: null, sent: true }));
  } catch (e) {
    return html(
      renderForgotPassword({
        appName: cfg.APP_NAME,
        error: e.message,
        sent: false,
      }),
      { status: 400 },
    );
  }
}

export async function handleReset(request, env) {
  const cfg = await getEffectiveConfig(env);
  const url = new URL(request.url);
  if (request.method === "GET") {
    const token = url.searchParams.get("token");
    if (!token) return redirect("/admin/forgot");
    return html(renderResetPassword({ token, appName: cfg.APP_NAME, error: null }));
  }
  const body = await parseFormBody(request);
  try {
    if (body.password !== body.passwordConfirm) {
      throw new ValidationError("Şifreler eşleşmiyor");
    }
    await resetAdminPassword(env, body.token, body.password);
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?reset=ok" },
    });
  } catch (e) {
    return html(
      renderResetPassword({
        token: body.token,
        appName: cfg.APP_NAME,
        error: e.message,
      }),
      { status: 400 },
    );
  }
}

export async function handleLogin(request, env) {
  const cfg = await getEffectiveConfig(env);
  if (request.method === "GET") {
    if (!(await isAdminConfigured(env))) return redirect("/admin/setup");
    if (await isAdminRequest(request, env)) return redirect("/admin");
    const url = new URL(request.url);
    const resetOk = url.searchParams.get("reset") === "ok";
    const showSetupLink = !(await isAdminConfigured(env));
    return html(
      renderLogin({
        appName: cfg.APP_NAME,
        error: resetOk ? null : null,
        info: resetOk ? "Şifren güncellendi — giriş yapabilirsin." : null,
        showSetupLink,
      }),
    );
  }

  const body = await parseFormBody(request);
  let ok = false;
  let email = "";
  try {
    email = requireEmail(body.email, "email");
    const password = (body.password || "").toString();
    ok = await verifyAdminLogin(env, email, password);
  } catch {
    ok = false;
  }
  if (!ok && verifyAdminToken(env, body.token)) ok = true;

  if (!ok) {
    return html(
      renderLogin({
        appName: cfg.APP_NAME,
        error: "E-posta veya şifre hatalı",
        info: null,
        showSetupLink: false,
      }),
      { status: 401 },
    );
  }

  const verified = await requireVerifiedAdminForLogin(env);
  if (!verified.ok) {
    return html(
      renderLogin({
        appName: cfg.APP_NAME,
        error: verified.message,
        info: null,
        email,
        showResend: isEmailLive(env),
        showSetupLink: false,
      }),
      { status: 403 },
    );
  }

  const cookie = await buildAdminSetCookie(env);
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin", "Set-Cookie": cookie },
  });
}

/** POST /api/auth/resend-verify */
export async function handleResendVerify(request, env) {
  if (request.method !== "POST") return redirect("/admin/login");
  try {
    const body = await parseFormBody(request);
    await resendVerificationEmail(env, body.email);
    return html(
      renderVerifyPending({
        email: body.email,
        appName: (await getEffectiveConfig(env)).APP_NAME,
      }),
    );
  } catch (e) {
    const cfg = await getEffectiveConfig(env);
    return html(
      renderLogin({
        appName: cfg.APP_NAME,
        error: e.message,
        info: null,
        showSetupLink: false,
      }),
      { status: 400 },
    );
  }
}

export async function handleLogout(request, env) {
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/login", "Set-Cookie": buildAdminLogoutCookie(env) },
  });
}
