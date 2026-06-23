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

## How webhooks actually work (PUSH, not pull)
The ERP **pushes** a signed POST to the integrator when an event happens; the integrator
never pulls documents from the ERP. The two sidebar groups reflect this:
- **YourBooks (Source)** = documents the ERP **pushed via webhooks** → you click Fiscalize/Report.
- **EFRIS** = **live read-only lookups** the integrator **pulls** from the middleware (GET).

The "This section is part of a later phase…" **Placeholder** is the catch-all for any route
not yet wired. The only one still on it is `/goods` (YourBooks source products).

## Data flow
ERP event (signed POST, `X-Webhook-Signature: sha256=HMAC(body, secret)`) →
`server /webhooks/yourbooks` (verifies HMAC) → store in local DB → user clicks
**Fiscalize/Report** → build EFRIS payload → POST middleware → save FDN/reference.
The **integrator holds the FDNs** (the ERP never fiscalizes); credit notes recover the
original invoice's FDN from `IngestedInvoice`.

## Done — Phases 1–3b
- **Phase 1:** scaffold, Settings (middleware URL + API key + webhook secret), webhook
  receiver, **Invoices** → EFRIS T109. Dashboard.
- **Phase 2a — Credit Notes:** `IngestedCreditNote`, T110 submit (recovers original FDN,
  maps reason enum → 101–105), Credit Notes page.
- **Phase 2b — Stock In/Out:** `IngestedStockMovement` (IN/OUT), T131 in/out, Stock pages.
- **Phase 3 — EFRIS lookups:** proxy routes + generic `LookupPage` for goods, excise-duty,
  units-of-measure, commodity-categories, registration-details, **branches** (T138); EFRIS Invoices.
- **Phase 3b — Stock Transfer (T139) + Branches lookup:**
  - `IngestedStockTransfer` model; `buildStockTransferPayload`/`submitStockTransfer` in efris.ts
    (posts to `/stock-transfer`, **identical payload to the ERP's own `reportStockTransfer`**).
  - Webhook ingest `stock.transferred`; routes `GET /stock-transfers` + `POST /stock-transfers/:id/report`.
  - `StockTransfer` page under the **YourBooks (Source)** group at `/stock-transfer` (shows branch
    route, flags unlinked branches, disables Report until both EFRIS branch IDs are present).
  - **Branches** lookup added to EFRIS group → `/efris-branches` (these branch IDs are what transfers use).

### Key files (server/src)
- `webhooks.ts` — HMAC verify + ingest (`invoice.created`, `credit-note.created`,
  `stock.increased`, `stock.decreased`, `stock.transferred`)
- `efris.ts` — middleware client: `submitInvoice`, `submitCreditNote`, `submitStock`,
  `submitStockTransfer`, `efrisGet`
- `routes.ts` — REST API (invoices, credit-notes, stock, stock-transfers, efris lookups, dashboard, config)
- `prisma/schema.prisma` — `IntegratorConfig`, `IngestedInvoice`, `IngestedCreditNote`,
  `IngestedStockMovement`, `IngestedStockTransfer`, `EfrisLog`

### Key files (client/src)
- `components/Sidebar.tsx` (YourBooks group: Invoices, Credit Notes, Stock Increase/Decrease,
  Stock Transfer, Goods&Services · EFRIS group: Invoices, Goods, Branches, Excise, Units, Commodity)
- `pages/`: Dashboard, Invoices, CreditNotes, Stock, StockTransfer, LookupPage, Settings, Placeholder
- `lib/api.ts` — fetch wrapper (base `/api/v1`)

## ERP side (in YourBookSuit)
Webhook **events + enriched emits** so the integrator can build EFRIS payloads itself:
- `lib/webhooks/events.ts` — catalog: `invoice.created`, `credit-note.created`,
  `stock.increased`, `stock.decreased`, **`stock.transferred`**
- Emits (FULL payload: customer + items w/ SKUs, reason, supplier, branch efrisBranchIds):
  `invoices/route.ts`, `credit-notes/route.ts`, `warehouse/grn/route.ts`,
  `inventory/adjustments/route.ts`, **`inventory/transfers/route.ts`** (POST)
- Branch IDs come from `Branch.efrisBranchId` (linked in Settings → Branches → Fetch/Auto-link).
- **Committed:** Phases 1–3 ERP work is in commit `d185a58`. **The `stock.transferred` event +
  transfers emit are NOT committed yet** (uncommitted in the YourBookSuit working tree).

## ⚠️ Uncommitted / pending actions to continue with
1. **`cd "D:\YourBooks Integrator\server" && npx prisma db push`** — creates the new
   `IngestedStockTransfer` table. Required before Stock Transfer works.
2. **Commit both repos** (not yet committed):
   - YourBooks-Integrator: schema + efris.ts + webhooks.ts + routes.ts + api.ts + App.tsx +
     Sidebar.tsx + StockTransfer.tsx + this HANDOFF.
   - YourBookSuit: `lib/webhooks/events.ts` + `app/api/orgs/[orgSlug]/inventory/transfers/route.ts`.

## How to run
```bash
cd "D:\YourBooks Integrator"
npm run install:all
cd server && npx prisma db push && cd ..   # creates DB/tables (DB: yourbooks_integrator on MariaDB :3308)
npm run dev                                 # server :19092, client :19093
```
Then in the app: **Settings** → middleware URL + EFRIS API key + webhook secret.
In the ERP: **Settings → Integrations → Webhooks** → add `http://localhost:19092/webhooks/yourbooks`
with the **same secret**, subscribe to all five events (invoice, credit-note, stock in/out/transfer).

> `server/.env` is gitignored (has DB creds). Copy from `server/.env.example`.
> DB chosen = **MySQL/MariaDB** (NOT SQLite — it crashes under load as data grows).

## NOT yet verified
The integrator has **not been `npm install`-ed / run** by the assistant — first launch may
surface build/runtime errors (esp. Tailwind classes, prisma client). Fix on first run.

## Next up (Phase 4)
1. **Run & test end-to-end** against URA: ERP invoice → lands & fiscalizes; credit note
   (recovers FDN); GRN (stock-in) + adjustment (stock-out); **inter-branch transfer → lands
   under Stock Transfer and reports (T139)**.
2. **`/goods`** — YourBooks source products page (last Placeholder stub).
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
- Stock transfer (T139) needs **both** branches' `efrisBranchId`; payload posts to `/stock-transfer`
  and the response reference is `transferReferenceNo || referenceNo`.
- item_code = Description (fallback Product Name); commodity_code = SKU; goods_code = efrisProductCode || SKU.
