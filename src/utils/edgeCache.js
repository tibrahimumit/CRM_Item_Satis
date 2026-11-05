/**
 * Cloudflare edge + tarayıcıda API/HTML yanıtlarının önbelleğe alınmasını engeller.
 * Eski 403 yanıtlarının "takılı" kalmasının ana nedeni budur.
 */
export function applyEdgeNoStore(headers) {
  headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
}
