/**
 * /api/stocks — CRUD for stocks (links/products).
 */

import { ok, created, badRequest, notFound, serverError } from "../utils/response.js";
import { requireAdmin } from "../utils/security.js";
import { parseJsonBody, ValidationError } from "../utils/validation.js";
import {
  listStocks,
  getStock,
  createStock,
  createStocksBulk,
  updateStock,
  deleteStock,
  deleteStocksBulk,
  repairStocks,
  syncStockMetaList,
} from "../services/redirects.js";
import {
  getStockInsights,
  adminUpdateAccessToken,
  updateStockAccessSettings,
} from "../services/stockInsights.js";

import { resolveStockPublicLink } from "../utils/publicUrls.js";

async function withPublicUrl(env, stock) {
  if (!stock) return stock;
  const link = await resolveStockPublicLink(env, stock);
  return { ...stock, ...link };
}

export async function handle(request, env, { method, segments, url }) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  if (segments[0] === "bulk-delete" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return badRequest("ids required");
      return ok({ deleted: await deleteStocksBulk(env, ids) });
    } catch (e) {
      return serverError(e.message);
    }
  }

  if (segments[0] === "bulk" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const items = await createStocksBulk(env, body);
      return created({
        count: items.length,
        items: await Promise.all(items.map((s) => withPublicUrl(env, s))),
      });
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
      return serverError(e.message);
    }
  }

  if (segments[0] === "export" && method === "POST") {
    try {
      const body = await parseJsonBody(request);
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      const categoryId = body.categoryId || undefined;
      const onlyUnused = Boolean(body.onlyUnused);
      let items = await listStocks(env, { categoryId });
      if (ids.length) {
        const idSet = new Set(ids);
        items = items.filter((s) => idSet.has(s.id));
      }
      const enriched = await Promise.all(items.map((s) => withPublicUrl(env, s)));
      const format = String(body.format || "txt").toLowerCase();
      const { buildStockExport } = await import("../utils/stockExport.js");
      const out = buildStockExport(enriched, { onlyUnused, format });
      if (!out.count) return badRequest("Dışa aktarılacak link yok (filtre veya seçim boş)");
      return ok(out);
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
      return serverError(e.message);
    }
  }

  if (segments[0] === "repair" && method === "POST") {
    try {
      const items = await repairStocks(env);
      return ok({
        repaired: items.length,
        items: await Promise.all(items.map((s) => withPublicUrl(env, s))),
      });
    } catch (e) {
      return serverError(e.message);
    }
  }

  // /api/stocks
  if (segments.length === 0) {
    if (method === "GET") {
      const categoryId = url.searchParams.get("categoryId") || undefined;
      const sync = url.searchParams.get("sync") === "1";
      const items = sync
        ? await syncStockMetaList(env, { categoryId })
        : await listStocks(env, { categoryId });
      return ok(await Promise.all(items.map((s) => withPublicUrl(env, s))));
    }
    if (method === "POST") {
      try {
        const body = await parseJsonBody(request);
        const stock = await createStock(env, body);
        return created(await withPublicUrl(env, stock));
      } catch (e) {
        if (e instanceof ValidationError) return badRequest(e.message, { field: e.field });
        return serverError(e.message);
      }
    }
    return badRequest("Unsupported method");
  }

  // /api/stocks/:id
  const id = segments[0];
  const stock = await getStock(env, id);
  if (!stock) return notFound("Stock not found");

  if (segments[1] === "insights" && method === "GET") {
    const data = await getStockInsights(env, id);
    if (!data) return notFound("Stock not found");
    return ok(data);
  }

  if (segments[1] === "tokens" && segments[2] && method === "PATCH") {
    try {
      const body = await parseJsonBody(request);
      const updated = await adminUpdateAccessToken(env, segments[2], body);
      return ok({ token: segments[2], record: updated });
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message);
      return serverError(e.message);
    }
  }

  if (segments.length === 1) {
    if (method === "GET") {
      return ok(await withPublicUrl(env, stock));
    }
    if (method === "PATCH") {
      try {
        const body = await parseJsonBody(request);
        const updated = await updateStock(env, id, body);
        return ok(await withPublicUrl(env, updated));
      } catch (e) {
        if (e instanceof ValidationError) return badRequest(e.message);
        return serverError(e.message);
      }
    }
    if (method === "DELETE") {
      await deleteStock(env, id);
      return ok({ deleted: true });
    }
  }

  return notFound();
}
