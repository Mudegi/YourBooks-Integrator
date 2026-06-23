import { Router } from 'express';
import { prisma, getConfig } from './prisma';
import { submitInvoice, submitCreditNote, submitStock, efrisGet } from './efris';

const router = Router();

// ---- Config -----------------------------------------------------------------
router.get('/config', async (_req, res) => {
  const c = await getConfig();
  res.json({
    middlewareUrl: c.middlewareUrl || '',
    efrisApiKey: c.efrisApiKey || '',
    webhookSecret: c.webhookSecret || '',
    companyName: c.companyName || '',
  });
});

router.put('/config', async (req, res) => {
  const { middlewareUrl, efrisApiKey, webhookSecret, companyName } = req.body || {};
  const c = await prisma.integratorConfig.upsert({
    where: { id: 1 },
    update: { middlewareUrl, efrisApiKey, webhookSecret, companyName },
    create: { id: 1, middlewareUrl, efrisApiKey, webhookSecret, companyName },
  });
  res.json({ success: true, config: c });
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
    const fdn = result.fdn || result.fiscal_data?.fdn || '';
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
