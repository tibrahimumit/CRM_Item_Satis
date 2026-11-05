/**
 * /api/platforms — CRUD (admin).
 */

import { ok, created, badRequest, notFound, serverError } from "../utils/response.js";
import { requireAdmin } from "../utils/security.js";
import { parseJsonBody, ValidationError } from "../utils/validation.js";
import {
  listPlatforms,
  createPlatform,
  updatePlatform,
  deletePlatform,
  deletePlatformsBulk,
  getPlatform,
} from "../services/platforms.js";
import { listCategories } from "../services/redirects.js";

export async function handle(request, env, { method, segments, url }) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  if (segments[0] === "bulk-delete" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return badRequest("ids required");
      return ok({ deleted: await deletePlatformsBulk(env, ids) });
    } catch (e) {
      return serverError(e.message);
    }
  }

  if (segments.length === 0) {
    if (method === "GET") return ok(await listPlatforms(env));
    if (method === "POST") {
      try {
        const body = await parseJsonBody(request);
        return created(await createPlatform(env, body));
      } catch (e) {
        if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
        return serverError(e.message);
      }
    }
    return badRequest("Unsupported method");
  }

  const id = segments[0];
  const plat = await getPlatform(env, id);
  if (!plat) return notFound("Platform not found");

  // GET /api/platforms/:id/delete — KV hard-delete yok; diğer onarım uçları gibi GET
  if (segments.length === 2 && segments[1] === "delete" && (method === "GET" || method === "DELETE")) {
    try {
      const force = url.searchParams.get("force") === "1";
      const deleted = await deletePlatform(env, id, { force });
      if (!deleted) return notFound("Platform not found");
      return ok({ deleted: true });
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
      return serverError(e.message);
    }
  }

  if (segments.length === 1) {
    if (method === "GET") {
      const cats = (await listCategories(env, { platformId: id })).filter(
        (c) => c.platformId === id,
      );
      return ok({ ...plat, categories: cats });
    }
    if (method === "PATCH") {
      try {
        const body = await parseJsonBody(request);
        return ok(await updatePlatform(env, id, body));
      } catch (e) {
        if (e instanceof ValidationError) return badRequest(e.message);
        return serverError(e.message);
      }
    }
    if (method === "DELETE") {
      try {
        const force = url.searchParams.get("force") === "1";
        const deleted = await deletePlatform(env, id, { force });
        if (!deleted) return notFound("Platform not found");
        return ok({ deleted: true });
      } catch (e) {
        if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
        return serverError(e.message);
      }
    }
  }

  return notFound();
}
