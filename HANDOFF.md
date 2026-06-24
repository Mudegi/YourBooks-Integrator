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

## ⚠️ CRITICAL: the ERP has TWO separate webhook systems — use the right one
This is the #1 gotcha and the reason "I created an invoice but nothing shows in the integrator."

| | **Integration** (legacy) | **WebhookEndpoint** (the live one) ✅ |
|---|---|---|
| Prisma models | `Integration` + `Webhook` (schema ~L414/443) | `WebhookEndpoint` + `WebhookDelivery` (schema ~L4980/5002) |
| ERP UI page | `…/settings/integrations/[id]` (the URL with `apiKey/apiSecret/webhookUrl` fields, sync logs) | `…/integrations/webhooks` (Register endpoint + event checkboxes + deliveries log) |
| API base | `/api/[orgSlug]/integrations/[id]` | `/api/[orgSlug]/integrations/webhooks` |
| Driven by `emitWebhookEvent`? | **NO** — purely a CRUD/sync record | **YES** — `dispatcher.ts` reads `prisma.webhookEndpoint.findMany` |

**`emitWebhookEvent` (lib/webhooks/dispatcher.ts) ONLY looks at `WebhookEndpoint` rows.**
If you register the integrator under **Settings → Integrations** (the `Integration` model), the
dispatcher never sees it and **zero deliveries are created** — exactly the symptom reported.

➡️ **Register the integrator at `http://localhost:3000/<orgSlug>/integrations/webhooks`** (NOT
Settings → Integrations). There: "Register endpoint" → URL `http://localhost:19092/webhooks/yourbooks`,
tick the events (invoice.created, credit-note.created, stock.increased/decreased/transferred),
copy the generated `whsec_…` secret, and paste it into the **integrator Settings → Webhook
Signing Secret** so the HMAC matches.

### Delivery mechanics (so you can debug)
- `emitWebhookEvent` persists one `WebhookDelivery` per subscribed endpoint, then fires an
  **immediate un-awaited** `processDueDeliveries` — so a correctly-registered endpoint receives
  the POST within the same request (no cron needed for the first attempt).
- Retries (5m/30m/2h, 4 attempts) and the 48h auto-disable need a cron pointed at
  `POST /api/[orgSlug]/integrations/webhooks/process` (or the global sweep). Not required for live testing.
- Inspect outcomes in the ERP **Deliveries** log on the webhooks page (status code, response body) —
  this is the fastest way to see 401 (secret mismatch), connection-refused (integrator not running),
  or 500 (integrator DB table missing → run `prisma db push`).
- Integrator receiver: `server/src/server.ts` mounts `POST /webhooks/yourbooks`, captures `rawBody`
  for HMAC, and `webhooks.ts` reads the `X-Webhook-Event` header + `body.data` envelope. Verified correct.

## Emit coverage (which ERP actions fire which event)
| Event | Emitting route(s) |
|---|---|
| `invoice.created` | `app/api/orgs/[orgSlug]/invoices/route.ts` (POST) — the live "new-intelligent" invoice path |
| `credit-note.created` | `app/api/orgs/[orgSlug]/credit-notes/route.ts` |
| `stock.increased` | **`app/api/orgs/[orgSlug]/accounts-payable/bills/route.ts` (POST)** — a **Bill** (AP → Bills → New) is THE EFRIS stock-in document; the bill updates inventory and now emits. *(Also still emits from `…/warehouse/grn`, a committed earlier path; `inventory/goods-receipts` emit was added then reverted this session to avoid double-reporting.)* |
| `stock.decreased` | `app/api/[orgSlug]/inventory/adjustments/route.ts` — Inventory → Adjustments |
| `stock.transferred` | `app/api/orgs/[orgSlug]/inventory/transfers/route.ts` (POST) |

> **Stock-in = a vendor Bill** (`/accounts-payable/bills/new`), per the ERP owner. The bill route
> converts package units → base units (× `unitRatio`) and the emit replicates that so EFRIS gets
> base-unit quantities. Stock-out = an **Adjustment** (`/inventory/adjustments`).

## Credentials audit (this session)
- **No hardcoded credentials in integrator source** (`server/src`, `client/src`). All secrets are
  read from `process.env` / the DB config row set via Settings.
- The only plaintext secret on disk is `server/.env` → `DATABASE_URL="mysql://root:kian%40256@localhost:3308/yourbooks_integrator"`.
  This is **gitignored** (correct), but it is the real DB password in cleartext — rotate it / use a
  dedicated DB user for production rather than `root`.
- Minor exposure: integrator `GET /api/v1/config` returns `efrisApiKey` + `webhookSecret` in cleartext
  and Settings renders them in plain `<input>` (not masked). Fine for localhost/single-user; mask
  before any multi-user/hosted deployment.

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
  - `StockTransfer` page under the **YourBooks (Source)** group at `/stock-transfer`. It loads the
    EFRIS **Branches** lookup and renders **From/To branch dropdowns** per pending transfer, so the
    user picks source/destination even when the ERP branches aren't linked (`efrisBranchId` null).
    Report is disabled until both are chosen. The chosen IDs+names are sent in the report POST body
    (`server/src/routes.ts` persists them on the `IngestedStockTransfer` before submitting T139).
  - **Branches** lookup added to EFRIS group → `/efris-branches` (these branch IDs feed the dropdowns).
    `extractBranches()` in the page normalizes the lookup payload to `{id,name}` across shapes
    (`branchId/branchName`, `id/name`, etc.).

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
  `inventory/adjustments/route.ts`, **`inventory/transfers/route.ts`** (POST),
  **`inventory/goods-receipts/route.ts`** (POST — added this session for stock-in parity)
- Branch IDs come from `Branch.efrisBranchId` (linked in Settings → Branches → Fetch/Auto-link).
- **Committed:** Phases 1–3 ERP work is in commit `d185a58`. **The `stock.transferred` event +
  transfers emit are NOT committed yet** (uncommitted in the YourBookSuit working tree).

## ⚠️ Uncommitted / pending actions to continue with
1. **`cd "D:\YourBooks Integrator\server" && npx prisma db push`** — creates the new
   `IngestedStockTransfer` table. Required before Stock Transfer works.
2. **Register the integrator in the ERP at `/<orgSlug>/integrations/webhooks`** (the WebhookEndpoint
   page — see the CRITICAL section above), copy the `whsec_…` secret into integrator Settings,
   then re-create an invoice/stock-in and confirm it lands. This — not a code bug — is why nothing
   appeared before (it was registered under the wrong system / not at all).
3. **Commit both repos** (not yet committed):
   - YourBooks-Integrator: schema + efris.ts + webhooks.ts + routes.ts + api.ts + App.tsx +
     Sidebar.tsx + StockTransfer.tsx + this HANDOFF.
   - YourBookSuit: `lib/webhooks/events.ts`, `app/api/orgs/[orgSlug]/inventory/transfers/route.ts`,
     and `app/api/orgs/[orgSlug]/accounts-payable/bills/route.ts` (stock-in emit on Bill create).

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
