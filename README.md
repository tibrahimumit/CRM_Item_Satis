# Redirect Intelligence

A professional, SaaS-style platform built on **Cloudflare Workers + KV** that combines:

- **CRM + customer intelligence** — searchable customer profiles, lifecycle stages, full activity history.
- **Redirect cloaking** — short codes hide the real URL; the real URL is *never* shown on screen.
- **Lead capture** — every public link is gated by a professional landing form (name, email, optional Telegram/Discord).
- **Email delivery flow** — after submission, the customer receives a **secondary access link** by email. Inbox is the gate, not the page.
- **Lifecycle automation** — per-stock duration (7/14/30/90/yearly) drives welcome, reminder, expiration, and upsell emails automatically.
- **Marketing automation** — provider-agnostic email queue with Cron-driven dispatching (Resend / Mailgun / SendGrid / SES pluggable).
- **Analytics** — geo, device, browser, referer, language, timezone, ASN tracked per visit.
- **Admin dashboard** — glassmorphism SPA, no page refreshes, live counters and CRM.

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [Project structure](#2-project-structure)
3. [Architecture overview](#3-architecture-overview)
4. [KV schema](#4-kv-schema)
5. [Worker routing strategy](#5-worker-routing-strategy)
6. [Frontend architecture](#6-frontend-architecture)
7. [Backend architecture](#7-backend-architecture)
8. [CRM database structure](#8-crm-database-structure)
9. [Email automation](#9-email-automation)
10. [Lifecycle automation](#10-lifecycle-automation)
11. [Local VS Code workflow](#11-local-vs-code-workflow)
12. [Wrangler configuration](#12-wrangler-configuration)
13. [Deployment workflow](#13-deployment-workflow)
14. [Security recommendations](#14-security-recommendations)
15. [Scalability recommendations](#15-scalability-recommendations)
16. [REST API reference](#16-rest-api-reference)
17. [Recommended development order](#17-recommended-development-order)
18. [Future SaaS expansion](#18-future-saas-expansion)

---

## Mac masaüstü uygulaması

Uygulamayı proje klasöründeki `start-app.command` dosyasına çift tıklayarak açın. Alternatif:

```bash
npm run app
```

İlk çalıştırmada Electron bağımlılığı kurulu değilse başlatıcı otomatik olarak yükler. Ayrıntı: [desktop/README.md](./desktop/README.md) — `.dmg` için `npm run desktop:dist`.

---

## 1. Quick start

Prerequisites: Node 20+, a Cloudflare account, and `npx`.

Run every command from the project folder:

```bash
cd "/path/to/CRM Item-Satis"
```

Or use the one-shot setup script:

```bash
bash setup.sh
```

### Manual steps

```bash
cd "/path/to/CRM Item-Satis"

npm install

# setup.sh creates .dev.vars and a random HASH_PEPPER.
# Without ADMIN_EMAIL/ADMIN_PASSWORD, create the first local account in the browser.

npm run dev
# → http://localhost:8787/admin/setup  (first-run admin setup)
# → http://localhost:8787/admin        (admin panel)

# In a second terminal, run the customer-facing Worker:
npm run dev:public
# → http://localhost:8788/r/<code>  (public link)
```

**Local dev:** Wrangler simulates KV locally; use the same local KV data for both Workers. The public Worker runs on port `8788` by default.

### Before production deploy

```bash
npx wrangler login
npm run kv:create
# If you created new namespaces, put each namespace id in BOTH wrangler.jsonc files.

# Configure admin credentials on the admin Worker before exposing it.
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put HASH_PEPPER
npx wrangler secret put HASH_PEPPER -c wrangler.public.jsonc

# Configure Resend on both Workers if customer/admin emails should be delivered.
npm run secrets:resend

npm run deploy
```

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are only needed on the admin Worker. Set the same `HASH_PEPPER` on both Workers so customer email indexes remain consistent. `OPENAI_API_KEY` is optional and belongs on the admin Worker.

---

## 2. Project structure

```
.
├── wrangler.jsonc          Cloudflare config (KV bindings, cron, vars)
├── wrangler.public.jsonc   Customer-facing Worker config
├── package.json
├── .dev.vars.example       Local secret template
├── scripts/
│   ├── check-syntax.mjs    JavaScript syntax check used by npm run lint
│   └── create-kv.mjs       One-shot KV namespace bootstrapper
└── src/
    ├── worker-admin.js          Admin panel, REST API + email queue cron
    ├── worker-public.js         Customer links, lead capture + access
    ├── routes/                  One file per HTTP domain
    │   ├── dashboard.js         /admin shell + login
    │   ├── categories.js        /api/categories CRUD
    │   ├── stocks.js            /api/stocks CRUD
    │   ├── redirect.js          /r/:code landing + POST /api/leads + /access/:token
    │   ├── analytics.js         /api/analytics/{overview,events,series}
    │   ├── customers.js         /api/customers
    │   ├── leads.js             /api/leads (admin)
    │   ├── emails.js            /api/emails/{queue,send,enqueue}
    │   └── automations.js       /api/automations
    ├── services/                Reusable business logic
    │   ├── kv.js                Keys + typed JSON helpers
    │   ├── tracking.js          Visit fingerprinting + analytics writes
    │   ├── redirects.js         Stock + Category domain
    │   ├── customers.js         Customer + Lead domain (dedupe by hashed email)
    │   ├── analytics.js         Read-side aggregates + event listing
    │   ├── email.js             Provider-agnostic send + enqueue
    │   ├── automations.js       Lifecycle templates + scheduler
    │   └── access.js            One-shot access-token issuance + consumption
    ├── utils/                   Cross-cutting helpers (no domain logic)
    │   ├── helpers.js           IDs, hashing, cookies, templating
    │   ├── validation.js        Input validation + sanitisation
    │   ├── response.js          JSON / HTML / error response builders
    │   ├── security.js          Admin auth + rate limiting
    │   └── scheduler.js         Queue key encoding + drain helpers
    ├── views/                   Server-rendered HTML (string templates)
    │   ├── _layout.js           Shared <head> shell
    │   ├── leadForm.js          Public landing
    │   ├── accessPage.js        "Check your inbox" + expired
    │   ├── expiredPage.js
    │   ├── login.js             Admin sign-in
    │   └── dashboard.js         Admin SPA shell
    ├── public/                  Shared source assets (copied by sync:assets)
    ├── public-admin/            Admin Worker assets
    └── public-customer/         Customer Worker assets
```

The dashboard is intentionally framework-free (vanilla JS + fetch + DOM). When complexity grows you can swap `src/public/dashboard.js` for a React/Vite build under `web/`. Nothing else has to change.

---

## 3. Architecture overview

```
        ┌─────────────────────┐             ┌──────────────────────┐
        │ Admin Worker        │             │ Public Worker        │
        │ /admin + /api/*      │             │ /r/* + /access/*     │
        │ email queue cron    │             │ lead capture         │
        └──────────┬──────────┘             └───────────┬──────────┘
                   └────────────────┬───────────────────┘
                                    ▼
                              Shared KV (9 NS)
                                    │
                    Admin cron drains EMAIL_QUEUE
```

Key invariants:

- **The real URL is never returned to a browser** — only `/access/:token` redirects, server-side.
- **Customers are deduped by `HMAC(pepper, email)`** so we never scan the customer set.
- **All long-running work is enqueued** to KV with sortable keys (`q:{paddedEpochMs}:{rand}`) and drained by the 1-minute cron.
- **Routes are thin** — they validate, call a service, return a response. Services contain logic.

---

## 4. KV schema

| Binding         | Key                              | Value                  | Purpose |
|-----------------|----------------------------------|------------------------|---------|
| `LINKS`         | `stock:{id}`                     | Stock JSON             | Primary stock record |
| `LINKS`         | `idx:code:{code}`                | `{id}` (string)        | Public code → stock id |
| `LINKS`         | `idx:cat:{catId}:{id}`           | `{id}` (string)        | Per-category index |
| `CATEGORIES`    | `cat:{id}`                       | Category JSON          | Category record |
| `CATEGORIES`    | `idx:slug:{slug}`                | `{id}` (string)        | Slug uniqueness index |
| `CATEGORIES`    | `counter:{catId}`                | `"N"` (number)         | Per-category numbering |
| `CUSTOMERS`     | `cust:{id}`                      | Customer JSON          | CRM profile |
| `CUSTOMERS`     | `idx:email:{hmac(email)}`        | `{id}`                 | Dedup lookup |
| `LEADS`         | `lead:{id}`                      | Lead JSON              | Form submission row |
| `ANALYTICS`     | `evt:{paddedTs}:{rand}`          | Event JSON             | Append-only events (TTL) |
| `ANALYTICS`     | `agg:{YYYY-MM-DD}:{scope}`       | `"N"` (number)         | Daily rollups |
| `EMAIL_QUEUE`   | `q:{paddedDueAtMs}:{rand}`       | Job JSON               | Sortable scheduled queue |
| `AUTOMATIONS`   | `auto:{id}`                      | Automation def (future)|
| `AUTOMATIONS`   | `state:{autoId}:{custId}`        | Run state              | Per-customer cursor |
| `LIFECYCLES`    | `lc:{stockId}`                   | Lifecycle config       | (custom per stock)     |
| `LIFECYCLES`    | `sched:{custId}:{stockId}`       | Schedule                | (custom per cust)      |
| `SESSIONS`      | `tok:{token}`                    | Access token JSON      | One-shot inbox link (TTL) |
| `SESSIONS`      | `rl:{key}`                       | Rate-limit window      | Sliding-window counters |

All values are JSON-encoded for forward compatibility. Keys are defined once in `src/services/kv.js#K`.

---

## 5. Worker routing strategy

The admin router is `src/worker-admin.js`; public routing is isolated in `src/worker-public.js`. Wrangler selects the entry point and asset directory from `wrangler.jsonc` and `wrangler.public.jsonc`, respectively.

| Worker | Pattern | Handler / purpose |
|--------|---------|-------------------|
| Admin | `GET /`, `/health`, `/admin/*` | Admin shell, auth and health |
| Admin | `/api/categories/*`, `/api/stocks/*`, `/api/customers/*` | Admin CRUD |
| Admin | `/api/leads`, `/api/analytics/*`, `/api/emails/*`, `/api/automations/*` | Admin APIs |
| Public | `GET /health`, `/status` | Public Worker health |
| Public | `GET /r/:code`, `GET /access/:token` | Lead form and cloaked access |
| Public | `POST /api/leads` | Public lead submission (rate-limited) |
| Both | Other paths | Worker assets, then 404 |

Admin API route modules export `handle(request, env, { method, segments, url })`; the public Worker handles only lead submission and link access. Keep admin APIs off the customer-facing Worker.

---

## 6. Frontend architecture

- **Server-rendered HTML** for the public landing, login, dashboard shell, and access pages. Templates live in `src/views/*.js` and compose a shared `_layout.js`.
- **Hash-routed SPA** for the admin (`src/public/dashboard.js`). Every interaction is a `fetch()` call to `/api/*`; the DOM is patched in place. No full page reloads.
- **Design system**: a single `styles.css` with CSS variables (`--brand`, `--surface`, `--grad-1`…), glassmorphism, gradients, animated pulse, modals, sparkline. Easily themed.
- **Polling** — overview / analytics / queue re-fetch every 15s for "live" feel without sockets. Swap for SSE later if needed.

When you outgrow vanilla JS, you can build a React (Vite) app into a separate `web/` folder and point `[assets].directory` at its `dist/` — the API stays untouched.

---

## 7. Backend architecture

Three layers, kept strict:

1. **Routes** (`src/routes/`) — only do: auth check → input validation → call a service → format response.
2. **Services** (`src/services/`) — domain logic: redirects, customers, automations, email, etc. Each service owns its KV keys via `services/kv.js#K`.
3. **Utils** (`src/utils/`) — leaf helpers with no awareness of domain.

This separation means you can replace KV with D1 (or Durable Objects, or Postgres via a Hyperdrive) by editing only `services/kv.js` + the few service files that read/write — the route + view layers stay untouched.

---

## 8. CRM database structure

A `Customer` is a single JSON document in `CUSTOMERS`:

```jsonc
{
  "id": "abc...",
  "emailHash": "hmac-sha256-of-email",
  "email": "jane@example.com",
  "fullName": "Jane Smith",
  "telegram": "@jane",
  "discord": "jane#1234",
  "lifecycleStage": "active",       // lead | active | expiring | churned | renewed
  "ip": "1.2.3.4",
  "country": "DE",
  "city": "Berlin",
  "timezone": "Europe/Berlin",
  "language": "en-US",
  "device": "desktop",
  "browser": "Chrome",
  "referer": "https://...",
  "firstSeenAt": "2026-05-20T...",
  "lastActivityAt": "2026-05-20T...",
  "visits": 12,
  "stockHistory":    [{ "stockId":"...", "categoryId":"...", "attachedAt":"...", "durationDays":14 }],
  "categoryHistory": ["catA","catB"],
  "emailHistory":    [{ "type":"access", "subject":"...", "sentAt":"..." }],
  "tags": ["vip","trial"]
}
```

A `Lead` is a thin row tied to one form submission:

```jsonc
{ "id":"...", "customerId":"...", "stockId":"...", "categoryId":"...", "status":"new", "context": { ...visitContext }, "createdAt": "..." }
```

A `Stock` carries duration metadata so the lifecycle scheduler can expand:

```jsonc
{
  "id":"...", "categoryId":"...", "code":"a8f92kd1", "name":"Adobe 14 day",
  "realUrl":"https://...", "durationDays":14, "maxVisits":null, "expiresAt":null,
  "visits":0, "leads":0, "customers":0,
  "lifecycle":{ "template":"default" },
  "createdAt":"...", "updatedAt":"..."
}
```

---

## 9. Email automation

`services/email.js` exposes:

- `sendEmail(env, message)` — immediate send via driver (`console` for dev, `resend` for prod; add Mailgun/SendGrid/SES by copying `sendViaResend`).
- `enqueueEmail(env, { dueAt, customerId, kind, message })` — push onto `EMAIL_QUEUE` with a sortable key.
- `processEmailJob(env, job)` — invoked by the cron drain; records to the customer's email history.

The queue uses `q:{paddedEpochMs}:{rand}` so `kv.list({ prefix: "q:" })` yields items in chronological order. The cron handler walks them, processes those with `dueAt <= now`, and `del()`s on success. Failures re-queue with a 5-minute backoff.

Switch providers by setting `EMAIL_DRIVER` and the corresponding API key:

```bash
npx wrangler secret put RESEND_API_KEY
# wrangler.jsonc: "EMAIL_DRIVER": "resend"
```

---

## 10. Lifecycle automation

Each stock has a `lifecycle.template` name. `services/automations.js` ships a built-in `default` template:

| Step  | Offset                      | Kind        | Subject                                      |
|-------|------------------------------|-------------|----------------------------------------------|
| 1     | `0` (signup)                | welcome     | Welcome to {{appName}}                       |
| 2     | `0` (signup)                | access      | Your secure access link                      |
| 3     | `-3` (relative to expiry)   | expiring    | Your access expires in 3 days                |
| 4     | `-1`                        | expiring    | Final reminder — expires tomorrow            |
| 5     | `0` (post-expiry)           | expired     | Your access has expired — renew now          |
| 6     | `+7` after signup           | upsell      | Discover what's new at {{appName}}           |

`scheduleLifecycleForCustomer(env, ctx)` expands the template into concrete `EMAIL_QUEUE` jobs the moment a customer claims a stock. Templates use mustache-style `{{var}}` and ship as plain HTML, so you can extend them in `automations.js`.

You can add more templates by:
1. Adding an entry to `BUILTIN_TEMPLATES` in `services/automations.js`.
2. Storing custom templates in the `AUTOMATIONS` KV namespace under `auto:{id}` and loading them in `getBuiltinTemplate`.

---

## 11. Local VS Code workflow

1. Open the folder in VS Code — recommended extensions auto-prompt (Cloudflare Workers, ESLint, Prettier).
2. Run `npm run dev` for the admin Worker (`http://localhost:8787`) and `npm run dev:public` for the public Worker (`http://localhost:8788`).
3. Edits to `src/**/*.js` and the asset directories hot-reload.
4. To trigger the cron locally without waiting:
   ```bash
   curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
   ```
5. To inspect KV:
   ```bash
   npx wrangler kv key list --binding=LINKS --local
   npx wrangler kv key get "stock:..." --binding=LINKS --local
   ```

---

## 12. Wrangler configuration

`wrangler.jsonc` configures the admin Worker; `wrangler.public.jsonc` configures the customer-facing Worker. Both configs must use the same KV namespace ids:

- `main`: `src/worker-admin.js` or `src/worker-public.js`
- `compatibility_date: "2025-05-01"` and `compatibility_flags: ["nodejs_compat"]`
- `kv_namespaces`: shared bindings used by both Workers.
- `assets`: `src/public-admin/` or `src/public-customer/`.
- Admin `triggers.crons`: `*/5 * * * *` — drain the email queue every five minutes.
- `vars`: non-secret config (`APP_NAME`, `PUBLIC_BASE_URL`, `EMAIL_DRIVER`…).
- Secrets live in `.dev.vars` locally and Cloudflare Worker secrets in production. `HASH_PEPPER` must match across both Workers.

---

## 13. Deployment workflow

```bash
npx wrangler login
# Create namespaces only if you are provisioning a new environment.
npm run kv:create
# Put each newly created namespace id in BOTH Wrangler config files.

npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put HASH_PEPPER
npx wrangler secret put HASH_PEPPER -c wrangler.public.jsonc
npm run secrets:resend  # optional; configures both Workers
npm run deploy
```

For staging/production split, add `env.staging` and `env.production` blocks to `wrangler.jsonc`, each with their own `kv_namespaces.id` values, then deploy with `wrangler deploy --env staging`.

---

## 14. Security recommendations

| Concern                  | Mitigation in this codebase |
|--------------------------|-----------------------------|
| Cloaked URLs             | Real URL never sent to client; only server-side 302 from `/access/:token`. |
| Token leakage            | Tokens are 256-bit URL-safe random, stored with KV TTL, one-shot tracked. |
| Form abuse               | `enforceRateLimit` on `POST /api/leads` (6/min/visitor). |
| Email scraping           | Indexed by HMAC-SHA-256 with `HASH_PEPPER` — pepper rotation = full re-index. |
| XSS                      | All HTML inputs `escapeHtml()`'d; strict CSP set by `utils/response.html()`. |
| Admin auth               | Hashed cookie token compared in constant time; `HttpOnly; SameSite=Lax; Secure`. |
| Replay / CSRF            | Same-site cookies + `Cache-Control: no-store` on redirects. |
| Future hardening         | Cloudflare Turnstile on the lead form; Cloudflare Access for `/admin`; WAF rule on `/api/*`. |

Recommended environment hardening:
- Use a unique, strong admin password and rotate it when needed.
- Set `PUBLIC_BASE_URL` to your custom domain and enforce HTTPS at the zone.
- Enable Cloudflare bot management and a WAF custom rule rate-limiting `/r/*` per IP.

---

## 15. Scalability recommendations

KV is great up to a few million keys with low-volume writes. As you grow:

| Symptom                            | Upgrade |
|------------------------------------|---------|
| Slow `kv.list` for customer search | Move CUSTOMERS → **D1** (SQL with indexes) or build an **R2-backed** export + search index. |
| Hot counters (visits, leads)       | Move counter mutations into a **Durable Object** per stock. |
| High-cardinality analytics         | Stream events to **Workers Analytics Engine** instead of KV. |
| Email volume                       | Add **Cloudflare Queues** between the worker and the email provider (better retries + visibility). |
| Long-running jobs                  | Use a Durable Object alarm or Cron + Queues; never block on a Worker. |
| Multi-region writes                | Use **D1 read replicas** (where available) or shard by tenant. |

The route/service split means each migration is local: replace `services/customers.js` internals without touching routes.

---

## 16. REST API reference

All `/api/*` endpoints require the admin cookie set by `POST /admin/login` (except `POST /api/leads`, which is public).

| Method | Path                                | Body / Query                                                         | Returns |
|--------|-------------------------------------|----------------------------------------------------------------------|---------|
| GET    | `/api/analytics/overview`           | —                                                                    | KPIs + 14-day visit series |
| GET    | `/api/analytics/events`             | `?stockId&customerId&limit`                                          | Newest events |
| GET    | `/api/analytics/series`             | `?scope=type:visit&days=14`                                          | Daily series |
| GET    | `/api/categories`                   | —                                                                    | List |
| POST   | `/api/categories`                   | `{ name, slug? }`                                                    | Created category |
| GET    | `/api/categories/:id`               | —                                                                    | Category + its stocks |
| PATCH  | `/api/categories/:id`               | `{ name }`                                                           | Updated |
| DELETE | `/api/categories/:id`               | —                                                                    | `{deleted:true}` (cascades stocks) |
| GET    | `/api/stocks`                       | `?categoryId`                                                        | List |
| POST   | `/api/stocks`                       | `{ categoryId, name?, realUrl, durationDays?, maxVisits?, lifecycleTemplate? }` | Created (incl. `publicUrl`) |
| GET    | `/api/stocks/:id`                   | —                                                                    | Stock |
| PATCH  | `/api/stocks/:id`                   | `{ name?, realUrl?, durationDays?, maxVisits? }`                     | Updated |
| DELETE | `/api/stocks/:id`                   | —                                                                    | `{deleted:true}` |
| GET    | `/api/customers`                    | `?q&stage&limit`                                                     | List |
| GET    | `/api/customers/stages`             | —                                                                    | Allowed stages |
| GET    | `/api/customers/:id`                | —                                                                    | Profile + history |
| PATCH  | `/api/customers/:id`                | `{ stage }`                                                          | Updated |
| GET    | `/api/leads`                        | `?limit`                                                             | Admin leads list |
| POST   | `/api/leads` (public)               | `{ code, email, fullName?, telegram?, discord? }`                    | `{ message }` (real URL stays hidden) |
| GET    | `/api/emails/queue`                 | —                                                                    | Pending jobs |
| POST   | `/api/emails/send`                  | `{ to, subject, html }`                                              | Driver result |
| POST   | `/api/emails/enqueue`               | `{ to, subject, html, dueAt?, kind?, customerId? }`                  | `{enqueued:true}` |
| GET    | `/api/automations`                  | —                                                                    | Built-in templates |
| GET    | `/api/automations/:id`              | —                                                                    | One template |

---

## 17. Recommended development order

1. **Setup** — KV namespaces, secrets, `wrangler dev` boots without errors.
2. **Categories + Stocks** — verify CRUD via the dashboard.
3. **Public flow** — `GET /r/:code` → form → `POST /api/leads` → console-email driver logs a job → cron drains it.
4. **Resend integration** — set `EMAIL_DRIVER=resend` + secret, send a real test from `/api/emails/send`.
5. **Customer CRM** — exercise search + lifecycle stages in `/admin#customers`.
6. **Analytics polish** — extend `agg:*` rollups for per-category and per-country.
7. **Lifecycle templates** — add custom templates (e.g. one for `30-day` vs `14-day`) and assign them per stock.
8. **Hardening** — Turnstile on the lead form, Cloudflare Access on `/admin`.
9. **Custom domain** — uncomment `routes` in `wrangler.jsonc`, point DNS, set `PUBLIC_BASE_URL`.
10. **React frontend** (optional) — build into `web/dist`, point `assets.directory` at it.

---

## 18. Future SaaS expansion

The architecture is intentionally headroom-rich. To grow into a multi-tenant SaaS:

- **Multi-tenancy** — add a `tenantId` prefix to every KV key (`stock:{tenantId}:{id}`). Provision tenants from an `OWNERS` namespace and resolve from the auth cookie.
- **User accounts & teams** — replace the single `ADMIN_TOKEN` with email + magic-link auth (a new `routes/auth.js` plus `SESSIONS`). Add roles to `state:{user}:{tenant}`.
- **Payments (Stripe)** — webhook handler in `routes/billing.js` that toggles `tenant.plan` and gates features in middleware.
- **AI lead scoring** — call Workers AI (`@cf/meta/llama-*`) in `scheduleLifecycleForCustomer` and write a score back to the customer doc.
- **AI customer insights** — daily cron summarises `emailHistory` + `stockHistory` into a natural-language brief.
- **Pipelines & segmentation** — store pipeline stages in `PIPELINES` namespace; visualise as kanban in a new `/admin#pipelines` route.
- **Campaign builder** — drag-drop UI that emits the same JSON shape as `BUILTIN_TEMPLATES`, saved to `AUTOMATIONS` namespace.
- **Advanced analytics** — pipe events into Workers Analytics Engine or a D1 fact table; build a dashboard in `web/`.
- **Storage upgrade** — move CUSTOMERS / LEADS into D1 (SQLite-on-Workers) for full SQL search; KV remains for ephemerals (tokens, rate limits, queue).
- **Workers Queues** — replace the KV email queue with Cloudflare Queues for higher throughput + dead-letter handling.

Every one of these is a *local change* to one or two files thanks to the route/service/util layering.

---

## License

Private / unreleased. Treat as internal SaaS code.
