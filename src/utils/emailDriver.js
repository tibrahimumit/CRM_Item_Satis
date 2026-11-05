/** Email driver resolution (no imports from customers/email to avoid cycles). */

export function resolveEmailDriver(env) {
  const configured = (env.EMAIL_DRIVER || "auto").toLowerCase();
  if (configured === "console") return "console";
  if (env.RESEND_API_KEY) return "resend";
  if (configured === "resend") return "console";
  return "console";
}

export function isEmailLive(env) {
  return resolveEmailDriver(env) === "resend" && !!env.RESEND_API_KEY;
}
