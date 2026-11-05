/** Müşteri stok / erişim linkleri — tek canonical host. */
export const CUSTOMER_LINKS_HOST = "links.salediscount.online";
export const CUSTOMER_LINKS_BASE = `https://${CUSTOMER_LINKS_HOST}`;

/** Eski maillerde kalan hostlar → links (301). */
export const LEGACY_CUSTOMER_HOSTS = new Set([
  "link.salediscount.online",
  "go.salediscount.online",
]);
