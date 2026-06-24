import { Router } from 'express';
import { prisma, getConfig } from './prisma';
import { efrisGet } from './efris';
import { fiscalizeInvoice, fiscalizeCreditNote, reportStockMovement, reportStockTransfer } from './fiscalize';

const router = Router();

// ---- Config -----------------------------------------------------------------
// Secrets (EFRIS API key, webhook signing secret) are never returned in full — only a masked
// preview of the last 4 chars plus a "set" flag, so the UI can confirm a value exists without
// exposing it. The real secrets are read server-side from the DB by efris.ts / webhooks.ts.
function maskSecret(s?: string | null): string {
  if (!s) return '';
  return s.length <= 4 ? '••••' : `••••••••${s.slice(-4)}`;
}

router.get('/config', async (_req, res) => {
  const c = await getConfig();
  res.json({
    middlewareUrl: c.middlewareUrl || '',
    companyName: c.companyName || '',
    autoFiscalize: !!c.autoFiscalize,
    efrisApiKeySet: !!c.efrisApiKey,
    efrisApiKeyPreview: maskSecret(c.efrisApiKey),
    webhookSecretSet: !!c.webhookSecret,
    webhookSecretPreview: maskSecret(c.webhookSecret),
  });
});

router.put('/config', async (req, res) => {
  const body = req.body || {};
  // Only touch a secret when the client explicitly sends that key. Omitting it leaves the
  // stored value unchanged, so saving the middleware URL never wipes a saved secret.
  const data: any = { middlewareUrl: body.middlewareUrl, companyName: body.companyName };
  if ('autoFiscalize' in body) data.autoFiscalize = !!body.autoFiscalize;
  if ('efrisApiKey' in body) data.efrisApiKey = body.efrisApiKey;
  if ('webhookSecret' in body) data.webhookSecret = body.webhookSecret;
  await prisma.integratorConfig.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  res.json({ success: true }); // never echo secrets back
});

// ---- Ingested invoices ------------------------------------------------------
router.get('/invoices', async (req, res) => {
  const status = req.query.status as string | undefined;
  const invoices = await prisma.ingestedInvoice.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { receivedAt: 'desc' },
    take: 200,
  });
  res.json({ invoices });
});

router.post('/invoices/:id/fiscalize', async (req, res) => {
  try {
    const r = await fiscalizeInvoice(req.params.id);
    res.json({ success: true, ...r });
  } catch (e: any) {
    res.status(e.status || 400).json({ success: false, error: e.message });
  }
});

// ---- Ingested credit notes --------------------------------------------------
router.get('/credit-notes', async (req, res) => {
  const status = req.query.status as string | undefined;
  const creditNotes = await prisma.ingestedCreditNote.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { receivedAt: 'desc' },
    take: 200,
  });
  res.json({ creditNotes });
});

router.post('/credit-notes/:id/fiscalize', async (req, res) => {
  try {
    const r = await fiscalizeCreditNote(req.params.id);
    res.json({ success: true, ...r });
  } catch (e: any) {
    res.status(e.status || 400).json({ success: false, error: e.message });
  }
});

// ---- Ingested stock movements -----------------------------------------------
router.get('/stock', async (req, res) => {
  const direction = req.query.direction as string | undefined; // IN | OUT
  const movements = await prisma.ingestedStockMovement.findMany({
    where: direction ? { direction: direction as any } : undefined,
    orderBy: { receivedAt: 'desc' },
    take: 200,
  });
  res.json({ movements });
});

router.post('/stock/:id/report', async (req, res) => {
  try {
    const r = await reportStockMovement(req.params.id);
    res.json({ success: true, ...r });
  } catch (e: any) {
    res.status(e.status || 400).json({ success: false, error: e.message });
  }
});

// ---- Ingested stock transfers (T139) ----------------------------------------
router.get('/stock-transfers', async (_req, res) => {
  const transfers = await prisma.ingestedStockTransfer.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 200,
  });
  res.json({ transfers });
});

router.post('/stock-transfers/:id/report', async (req, res) => {
  try {
    const r = await reportStockTransfer(req.params.id, req.body || {});
    res.json({ success: true, ...r });
  } catch (e: any) {
    res.status(e.status || 400).json({ success: false, error: e.message });
  }
});

// ---- ERP products (catalogue pushed from YourBooks via product.* webhooks) --
router.get('/products', async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim();
  const products = await prisma.ingestedProduct.findMany({
    where: search
      ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }, { category: { contains: search } }] }
      : undefined,
    orderBy: { name: 'asc' },
    take: 500,
  });
  res.json({ products });
});

// ---- EFRIS read-only lookups (proxied through the middleware) ----------------
// Forwards the query string (e.g. ?excise_name=beer, ?pageNo=1) to the middleware.
const EFRIS_LOOKUPS = ['registration-details', 'goods', 'excise-duty', 'units-of-measure', 'commodity-categories', 'branches'];
EFRIS_LOOKUPS.forEach((name) => {
  router.get(`/efris/${name}`, async (req, res) => {
    try {
      const qs = req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?').slice(1).join('?') : '';
      const data = await efrisGet(name + qs);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });
});

// ---- Dashboard --------------------------------------------------------------
// Status counts for one model.
async function statusCounts(model: any) {
  const [total, pending, fiscalized, failed] = await Promise.all([
    model.count(),
    model.count({ where: { status: 'PENDING' } }),
    model.count({ where: { status: 'FISCALIZED' } }),
    model.count({ where: { status: 'FAILED' } }),
  ]);
  return { total, pending, fiscalized, failed };
}

router.get('/dashboard/stats', async (_req, res) => {
  const [invoices, creditNotes, stock, transfers] = await Promise.all([
    statusCounts(prisma.ingestedInvoice),
    statusCounts(prisma.ingestedCreditNote),
    statusCounts(prisma.ingestedStockMovement),
    statusCounts(prisma.ingestedStockTransfer),
  ]);
  const byType = { invoices, creditNotes, stock, transfers };
  const totals = (['total', 'pending', 'fiscalized', 'failed'] as const).reduce(
    (acc, k) => ({ ...acc, [k]: invoices[k] + creditNotes[k] + stock[k] + transfers[k] }),
    {} as Record<string, number>,
  );

  // Combined recent activity across all document types, newest first.
  const [ri, rc, rs, rt] = await Promise.all([
    prisma.ingestedInvoice.findMany({ orderBy: { receivedAt: 'desc' }, take: 6 }),
    prisma.ingestedCreditNote.findMany({ orderBy: { receivedAt: 'desc' }, take: 6 }),
    prisma.ingestedStockMovement.findMany({ orderBy: { receivedAt: 'desc' }, take: 6 }),
    prisma.ingestedStockTransfer.findMany({ orderBy: { receivedAt: 'desc' }, take: 6 }),
  ]);
  const recent = [
    ...ri.map((x) => ({ kind: 'invoice', id: x.id, label: x.invoiceNumber, sub: x.customerName || '', status: x.status, ref: x.fdn || '', receivedAt: x.receivedAt })),
    ...rc.map((x) => ({ kind: 'credit-note', id: x.id, label: x.creditNoteNumber, sub: x.customerName || '', status: x.status, ref: x.fdn || '', receivedAt: x.receivedAt })),
    ...rs.map((x) => ({ kind: 'stock', id: x.id, label: x.reference, sub: x.direction === 'IN' ? 'Stock in' : 'Stock out', status: x.status, ref: x.efrisReference || '', receivedAt: x.receivedAt })),
    ...rt.map((x) => ({ kind: 'stock-transfer', id: x.id, label: x.reference, sub: 'Transfer', status: x.status, ref: x.efrisReference || '', receivedAt: x.receivedAt })),
  ].sort((a, b) => +new Date(b.receivedAt) - +new Date(a.receivedAt)).slice(0, 10);

  // Failed documents, with the error and the kind so the UI can call the right retry endpoint.
  const [fi, fc, fs, ft] = await Promise.all([
    prisma.ingestedInvoice.findMany({ where: { status: 'FAILED' }, orderBy: { receivedAt: 'desc' }, take: 20 }),
    prisma.ingestedCreditNote.findMany({ where: { status: 'FAILED' }, orderBy: { receivedAt: 'desc' }, take: 20 }),
    prisma.ingestedStockMovement.findMany({ where: { status: 'FAILED' }, orderBy: { receivedAt: 'desc' }, take: 20 }),
    prisma.ingestedStockTransfer.findMany({ where: { status: 'FAILED' }, orderBy: { receivedAt: 'desc' }, take: 20 }),
  ]);
  const failures = [
    ...fi.map((x) => ({ kind: 'invoice', id: x.id, label: x.invoiceNumber, error: x.efrisError || '', receivedAt: x.receivedAt })),
    ...fc.map((x) => ({ kind: 'credit-note', id: x.id, label: x.creditNoteNumber, error: x.efrisError || '', receivedAt: x.receivedAt })),
    ...fs.map((x) => ({ kind: 'stock', id: x.id, label: x.reference, error: x.efrisError || '', receivedAt: x.receivedAt })),
    ...ft.map((x) => ({ kind: 'stock-transfer', id: x.id, label: x.reference, error: x.efrisError || '', receivedAt: x.receivedAt })),
  ].sort((a, b) => +new Date(b.receivedAt) - +new Date(a.receivedAt));

  // Back-compat: keep the flat invoice-only fields the old client read.
  res.json({
    total: invoices.total, pending: invoices.pending, fiscalized: invoices.fiscalized, failed: invoices.failed,
    totals, byType, recent, failures,
  });
});

// ---- EFRIS lookups (passthrough) -------------------------------------------
// e.g. GET /efris/registration-details, /efris/branches, /efris/units-of-measure
router.get('/efris/:lookup(*)', async (req, res) => {
  try {
    const data = await efrisGet(req.params.lookup);
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export default router;
