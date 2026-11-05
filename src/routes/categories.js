/**
 * /api/categories — CRUD for categories.
 * All endpoints require admin auth.
 */

import { ok, created, badRequest, notFound, serverError } from "../utils/response.js";
import { requireAdmin } from "../utils/security.js";
import { parseJsonBody, ValidationError } from "../utils/validation.js";
import {
  listCategories,
  repairCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  deleteCategoriesBulk,
  getCategory,
  listStocks,
} from "../services/redirects.js";

export async function handle(request, env, { method, segments, url }) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  if (segments[0] === "bulk-delete" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return badRequest("ids required");
      return ok({ deleted: await deleteCategoriesBulk(env, ids) });
    } catch (e) {
      return serverError(e.message);
    }
  }

  // POST /api/categories/repair — KV list kotasında manifest'i GET ile yenile
  if (segments[0] === "repair" && method === "POST") {
    try {
      let extraSlugs = [];
      try {
        const body = await parseJsonBody(request);
        if (Array.isArray(body.slugs)) extraSlugs = body.slugs;
      } catch {
        /* boş body OK */
      }
      const cats = await repairCategories(env, { slugs: extraSlugs });
      return ok({ repaired: cats.length, categories: cats });
    } catch (e) {
      return serverError(e.message);
    }
  }

  // /api/categories
  if (segments.length === 0) {
    if (method === "GET") {
      const platformId = url.searchParams.get("platformId") || undefined;
      return ok(await listCategories(env, { platformId }));
    }
    if (method === "POST") {
      try {
        const body = await parseJsonBody(request);
        const cat = await createCategory(env, body);
        return created(cat);
      } catch (e) {
        if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
        return serverError(e.message);
      }
    }
    return badRequest("Unsupported method");
  }

  // /api/categories/:id[/...]
  const id = segments[0];
  const cat = await getCategory(env, id);
  if (!cat) return notFound("Category not found");

  if (segments.length === 1) {
    if (method === "GET") return ok({ ...cat, stocks: await listStocks(env, { categoryId: id }) });
    if (method === "PATCH") {
      try {
        const body = await parseJsonBody(request);
        return ok(await renameCategory(env, id, body.name));
      } catch (e) {
        if (e instanceof ValidationError) return badRequest(e.message);
        return serverError(e.message);
      }
    }
    if (method === "DELETE") {
      await deleteCategory(env, id);
      return ok({ deleted: true });
    }
  }

  return notFound();
}
