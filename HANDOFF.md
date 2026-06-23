# YourBooks Integrator — Handoff

External integrator that keeps a client's **ERP workspace EFRIS-free**: it receives
**signed webhooks** from the YourBooks ERP and **fiscalizes via the EFRIS middleware**.
Replaces the slow QBO-Integrator (Next.js + webpack) with the **fast YourBooks POS stack**.

- **Repo:** https://github.com/Mudegi/YourBooks-Integrator.git (branch `main`)
- **Location:** `D:\YourBooks Integrator`

## Architecture (mirrors YourBooks POS)
```
client/  → Vite + React 19 + Tailwind 4 SPA   (port 19093)
server/  → Express + Prisma (MySQL) + ts-node-dev (port 19092)
```
- **EFRIS middleware** code lives at `D:\EfrisAPI` (FastAPI). We call `/api/external/efris/*`.
- The ERP lives at `D:\YourBookSuit\client` (Next.js). Webhook system in `client/lib/webhooks/`.

## Data flow
ERP event (signed POST, `X-Webhook-Signature: sha256=HMAC(body, secret)`) →
`server /webhooks/yourbooks` (verifies HMAC) → store in local DB → user clicks
**Fiscalize/Report** → build EFRIS payload → POST middleware → save FDN/reference.
The **integrator holds the FDNs** (the ERP never fiscalizes); credit notes recover the
original invoice's FDN from `IngestedInvoice`.

## Done — Phases 1–3
- **Phase 1:** scaffold, Settings (middleware URL + API key + webhook secret), webhook
  receiver, **Invoices** → EFRIS T109. Dashboard.
- **Phase 2a — Credit Notes:** `IngestedCreditNote`, T110 submit (recovers original FDN,
  maps reason enum → 101–105), Credit Notes page.
- **Phase 2b — Stock:** `IngestedStockMovement` (IN/OUT), T131 in/out, Stock In/Out pages.
- **Phase 3 — EFRIS lookups:** proxy routes + generic `LookupPage` for goods, excise-duty,
  units-of-measure, commodity-categories, registration-details; EFRIS Invoices.

### Key files (server/src)
- `webhooks.ts` — HMAC verify + ingest (`invoice.created`, `credit-note.created`, `stock.increased`, `stock.decreased`)
- `efris.ts` — middleware client: `submitInvoice`, `submitCreditNote`, `submitStock`, `efrisGet`
- `routes.ts` — REST API (invoices, credit-notes, stock, efris lookups, dashboard, config)
- `prisma/schema.prisma` — `IntegratorConfig`, `IngestedInvoice`, `IngestedCreditNote`, `IngestedStockMovement`, `EfrisLog`

### Key files (client/src)
- `components/Sidebar.tsx` (QBO-style: YourBooks group + EFRIS group)
- `pages/`: Dashboard, Invoices, CreditNotes, Stock, LookupPage, Settings, Placeholder
- `lib/api.ts` — fetch wrapper (base `http://localhost:19092/api/v1`)

## ERP side (committed in YourBookSuit, commit d185a58)
Webhook **events + enriched emits** so the integrator can build EFRIS payloads itself:
- `lib/webhooks/events.ts` — catalog: `invoice.created`, `credit-note.created`,
  `stock.increased`, `stock.decreased`
- Emits (FULL payload: customer + items w/ SKUs, reason, supplier):
  `invoices/route.ts`, `credit-notes/route.ts`, `warehouse/grn/route.ts`,
  `inventory/adjustments/route.ts`

## How to run
```bash
cd "D:\YourBooks Integrator"
npm run install:all
cd server && npx prisma db push && cd ..   # creates DB/tables (DB: yourbooks_integrator on MariaDB :3308)
npm run dev                                 # server :19092, client :19093
```
Then in the app: **Settings** → middleware URL + EFRIS API key + webhook secret.
In the ERP: **Settings → Integrations → Webhooks** → add `http://localhost:19092/webhooks/yourbooks`
with the **same secret**, subscribe to all four events.

> `server/.env` is gitignored (has DB creds). Copy from `server/.env.example`.
> DB chosen = **MySQL/MariaDB** (NOT SQLite — it crashes under load as data grows).

## NOT yet verified
The integrator has **not been `npm install`-ed / run** by the assistant — first launch may
surface build/runtime errors (esp. Tailwind classes, prisma client). Fix on first run.

## Next up (Phase 4)
1. **Run & test end-to-end** against URA: create an ERP invoice → confirm it lands and
   fiscalizes; then a credit note (recovers FDN); then GRN (stock-in) + adjustment (stock-out).
2. **Sidebar stubs** still on Placeholder: `/goods` (YourBooks source products) and
   `/stock-transfer` (T139 — needs ERP branch transfer event + branch efrisBranchId, which
   the ERP already stores).
3. **Richer Dashboard** (counts by status, recent activity, failures to retry).
4. **Auto-fiscalize option** (fiscalize on webhook receipt vs manual button).
5. **Registration-details page/link** (currently only a server route exists).

## Gotchas learned this project (EFRIS)
- Credit notes must **mirror the original invoice**: excise flag/fields, `unit_of_measure`,
  commodity code under `goodsCategoryId`/`commodity_code` keys (not `goods_category_id`).
- Excise summary: `taxAmount` **includes** excise (05), `grossAmount` **excludes** it;
  `taxRateName` required for category 05.
- EFRIS payment codes: **101=Credit, 102=Cash** (don't swap).
- Reason codes: 101 Return, 102 Cancellation, 103 Wrong amount, 104 Waive-off, 105 Others.
