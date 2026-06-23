# YourBooks Integrator

An external EFRIS integrator for the **YourBooks ERP**. It keeps the ERP workspace free of
EFRIS logic: the ERP fires **webhooks**, this app ingests them and fiscalizes via the
**EFRIS middleware**.

Built on the fast YourBooks POS architecture — **Vite + React SPA (client)** and
**Express + Prisma (server)** — instead of a Next.js monolith (no slow per-route webpack
compiles).

## Architecture

```
YourBooks ERP  ──(signed webhook: invoice.created)──▶  Integrator server (:19092)
                                                          │  verify HMAC, store invoice
                                                          ▼
                                              EFRIS middleware  ──▶  URA
                                                          ▲
Integrator client (:19093, Vite SPA) ── REST /api/v1 ─────┘
```

## Setup

1. **Create the database** (on the same MariaDB the ERP/POS use, port 3308):
   ```sql
   CREATE DATABASE yourbooks_integrator;
   ```
   Adjust `server/.env` → `DATABASE_URL` if your credentials differ.

2. **Install + generate:**
   ```bash
   npm run install:all
   cd server && npx prisma db push && cd ..
   ```

3. **Run both (client + server):**
   ```bash
   npm run dev
   ```
   - Server → http://localhost:19092
   - Client → http://localhost:19093

4. **Configure** (client → Settings):
   - EFRIS **Middleware URL** + **API Key**
   - **Webhook signing secret** (must match the ERP endpoint's secret)

5. **Register the webhook in the ERP** (Settings → Integrations → Webhooks):
   - URL: `http://localhost:19092/webhooks/yourbooks`
   - Secret: the same value you put in Settings
   - Events: `invoice.created`

## Phase 1 scope (this build)
- Settings (middleware + webhook secret)
- Webhook receiver (HMAC-verified) → stores invoices
- **Invoices** page → queue + one-click **Fiscalize** (EFRIS)
- Dashboard stats

Later phases: credit notes, stock in/out/transfer, and the EFRIS lookup pages
(goods, excise, units, commodity categories).
