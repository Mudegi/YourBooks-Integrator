import { Router } from 'express';
import { prisma, getConfig } from './prisma';
import { submitInvoice, submitCreditNote, submitStock, submitStockTransfer, efrisGet } from './efris';

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
  const inv = await prisma.ingestedInvoice.findUnique({ where: { id: req.params.id } });
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  if (inv.status === 'FISCALIZED') return res.json({ success: true, alreadyFiscalized: true, fdn: inv.fdn });

  try {
    const { payload, result } = await submitInvoice(inv.payload as any);
    const fdn = result.fdn || result.fiscal_data?.fdn || result.fullEfrisResponse?.fdn || '';
    const vc = result.verificationCode || result.fiscal_data?.verification_code || '';
    const qr = result.qr_code || result.fiscal_data?.qr_code || '';
    await prisma.ingestedInvoice.update({
      where: { id: inv.id },
      data: { status: 'FISCALIZED', fdn, verificationCode: vc, qrCode: qr, efrisError: null, fiscalizedAt: new Date() },
    });
    await prisma.efrisLog.create({ data: { kind: 'invoice', reference: inv.invoiceNumber, success: true, request: payload as any, response: result } });
    res.json({ success: true, fdn });
  } catch (e: any) {
    await prisma.ingestedInvoice.update({ where: { id: inv.id }, data: { status: 'FAILED', efrisError: e.message } });
    await prisma.efrisLog.create({ data: { kind: 'invoice', reference: inv.invoiceNumber, success: false, request: e.request, response: e.response } });
    res.status(400).json({ success: false, error: e.message });
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
  const cn = await prisma.ingestedCreditNote.findUnique({ where: { id: req.params.id } });
  if (!cn) return res.status(404).json({ error: 'Credit note not found' });
  if (cn.status === 'FISCALIZED') return res.json({ success: true, alreadyFiscalized: true, fdn: cn.fdn });

  // EFRIS can only credit an invoice that was itself fiscalized. The integrator holds the
  // FDN (the ERP is EFRIS-free), so recover it from the original ingested invoice.
  if (!cn.originalInvoiceNumber) {
    return res.status(400).json({ success: false, error: 'This credit note has no original invoice number, so it cannot be fiscalized.' });
  }
  const original = await prisma.ingestedInvoice.findUnique({ where: { invoiceNumber: cn.originalInvoiceNumber } });
  if (!original || original.status !== 'FISCALIZED' || !original.fdn) {
    return res.status(400).json({
      success: false,
      error: `The original invoice ${cn.originalInvoiceNumber} hasn't been fiscalized with EFRIS yet, so URA can't accept a credit note against it. Fiscalize that invoice first.`,
    });
  }

  try {
    // Merge the resolved reason code / numbers from the stored record into the raw payload.
    const cnData = {
      ...(cn.payload as any),
      creditNoteNumber: cn.creditNoteNumber,
      originalInvoiceNumber: cn.originalInvoiceNumber,
      reason: cn.reason,
      reasonCode: cn.reasonCode,
      currency: cn.currency,
    };
    const { payload, result } = await submitCreditNote(cnData, original.fdn);
    // T110 returns an application referenceNo (the FDN is only assigned once URA approves
    // the credit note); surface whichever identifier EFRIS gave us.
    const fdn = result.fdn || result.fiscal_data?.fdn || result.referenceNo || '';
    const vc = result.verification_code || result.fiscal_data?.verification_code || '';
    const qr = result.qr_code || result.fiscal_data?.qr_code || '';
    await prisma.ingestedCreditNote.update({
      where: { id: cn.id },
      data: { status: 'FISCALIZED', fdn, verificationCode: vc, qrCode: qr, efrisError: null, fiscalizedAt: new Date() },
    });
    await prisma.efrisLog.create({ data: { kind: 'credit_note', reference: cn.creditNoteNumber, success: true, request: payload as any, response: result } });
    res.json({ success: true, fdn });
  } catch (e: any) {
    await prisma.ingestedCreditNote.update({ where: { id: cn.id }, data: { status: 'FAILED', efrisError: e.message } });
    await prisma.efrisLog.create({ data: { kind: 'credit_note', reference: cn.creditNoteNumber, success: false, request: e.request, response: e.response } });
    res.status(400).json({ success: false, error: e.message });
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
  const mv = await prisma.ingestedStockMovement.findUnique({ where: { id: req.params.id } });
  if (!mv) return res.status(404).json({ error: 'Stock movement not found' });
  if (mv.status === 'FISCALIZED') return res.json({ success: true, alreadyReported: true });

  try {
    const data = { ...(mv.payload as any), direction: mv.direction, movementType: mv.movementType, supplierTin: mv.supplierTin, supplierName: mv.supplierName, remarks: mv.remarks };
    const { payload, result } = await submitStock(data);
    const ref = result.efris_reference || result.referenceNo || result.transferReferenceNo || 'EFRIS-OK';
    await prisma.ingestedStockMovement.update({ where: { id: mv.id }, data: { status: 'FISCALIZED', efrisReference: ref, efrisError: null, reportedAt: new Date() } });
    await prisma.efrisLog.create({ data: { kind: 'stock', reference: mv.reference, success: true, request: payload as any, response: result } });
    res.json({ success: true, reference: ref });
  } catch (e: any) {
    await prisma.ingestedStockMovement.update({ where: { id: mv.id }, data: { status: 'FAILED', efrisError: e.message } });
    await prisma.efrisLog.create({ data: { kind: 'stock', reference: mv.reference, success: false, request: e.request, response: e.response } });
    res.status(400).json({ success: false, error: e.message });
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
  const t = await prisma.ingestedStockTransfer.findUnique({ where: { id: req.params.id } });
  if (!t) return res.status(404).json({ error: 'Stock transfer not found' });
  if (t.status === 'FISCALIZED') return res.json({ success: true, alreadyReported: true });

  // The user can pick source/destination branches in the integrator (from the EFRIS Branches
  // lookup) when the ERP didn't supply linked branch IDs. Persist the chosen IDs before reporting.
  const { sourceBranchId, destinationBranchId, sourceBranchName, destinationBranchName } = req.body || {};
  if (sourceBranchId || destinationBranchId) {
    await prisma.ingestedStockTransfer.update({
      where: { id: t.id },
      data: {
        sourceBranchId: sourceBranchId || t.sourceBranchId,
        destinationBranchId: destinationBranchId || t.destinationBranchId,
        sourceBranchName: sourceBranchName || t.sourceBranchName,
        destinationBranchName: destinationBranchName || t.destinationBranchName,
      },
    });
  }
  const finalSourceId = sourceBranchId || t.sourceBranchId;
  const finalDestId = destinationBranchId || t.destinationBranchId;

  try {
    const data = {
      ...(t.payload as any),
      sourceBranchId: finalSourceId,
      destinationBranchId: finalDestId,
      transferTypeCode: t.transferTypeCode,
      remarks: t.remarks,
    };
    const { payload, result } = await submitStockTransfer(data);
    const ref = result.efris_reference || result.referenceNo || result.transferReferenceNo || 'EFRIS-OK';
    await prisma.ingestedStockTransfer.update({ where: { id: t.id }, data: { status: 'FISCALIZED', efrisReference: ref, efrisError: null, reportedAt: new Date() } });
    await prisma.efrisLog.create({ data: { kind: 'stock_transfer', reference: t.reference, success: true, request: payload as any, response: result } });
    res.json({ success: true, reference: ref });
  } catch (e: any) {
    await prisma.ingestedStockTransfer.update({ where: { id: t.id }, data: { status: 'FAILED', efrisError: e.message } });
    await prisma.efrisLog.create({ data: { kind: 'stock_transfer', reference: t.reference, success: false, request: e.request, response: e.response } });
    res.status(400).json({ success: false, error: e.message });
  }
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
router.get('/dashboard/stats', async (_req, res) => {
  const [total, pending, fiscalized, failed] = await Promise.all([
    prisma.ingestedInvoice.count(),
    prisma.ingestedInvoice.count({ where: { status: 'PENDING' } }),
    prisma.ingestedInvoice.count({ where: { status: 'FISCALIZED' } }),
    prisma.ingestedInvoice.count({ where: { status: 'FAILED' } }),
  ]);
  const recent = await prisma.ingestedInvoice.findMany({ orderBy: { receivedAt: 'desc' }, take: 8 });
  res.json({ total, pending, fiscalized, failed, recent });
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
