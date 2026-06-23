import crypto from 'crypto';
import { Request, Response } from 'express';
import { prisma, getConfig } from './prisma';

/**
 * Receives signed webhooks from the YourBooks ERP. The ERP signs the raw body with
 * HMAC-SHA256 using the shared secret and sends it as `X-Webhook-Signature: sha256=<hex>`.
 * We verify against the configured secret, then ingest the document for fiscalization.
 */
export async function handleYourBooksWebhook(req: Request, res: Response) {
  const config = await getConfig();
  const secret = config.webhookSecret;
  const signatureHeader = req.header('X-Webhook-Signature') || '';
  const eventHeader = req.header('X-Webhook-Event') || '';
  const raw = (req as any).rawBody as string | undefined;

  // Verify the signature when a secret is configured (recommended).
  if (secret) {
    if (!raw) return res.status(400).json({ error: 'Missing raw body for signature check' });
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!valid) return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const body = req.body || {};
  const type = eventHeader || body.event || body.type;
  const data = body.data || body.payload || body;

  try {
    if (type === 'invoice.created') {
      await ingestInvoice(data);
    } else if (type === 'credit-note.created') {
      await ingestCreditNote(data);
    } else if (type === 'stock.increased') {
      await ingestStock(data, 'IN');
    } else if (type === 'stock.decreased') {
      await ingestStock(data, 'OUT');
    }
    return res.status(200).json({ received: true, type });
  } catch (e: any) {
    console.error('[webhook] ingest error:', e);
    // Return 200 so the ERP doesn't enter a retry storm; the error is logged here.
    return res.status(200).json({ received: true, warning: e.message });
  }
}

async function ingestInvoice(data: any) {
  const invoiceNumber = data.invoiceNumber || data.invoice_number;
  if (!invoiceNumber) throw new Error('invoice payload missing invoiceNumber');

  const common = {
    sourceId: data.invoiceId || data.id || null,
    customerName: data.customer?.name || data.customerName || null,
    customerTin: data.customer?.tin || data.customerTin || null,
    currency: data.currency || 'UGX',
    total: Number(data.total || 0),
    invoiceDate: (typeof data.invoiceDate === 'string' ? data.invoiceDate : '').slice(0, 10) || null,
    payload: data,
  };

  await prisma.ingestedInvoice.upsert({
    where: { invoiceNumber },
    update: common,
    create: { invoiceNumber, status: 'PENDING', ...common },
  });
}

// Map the ERP's CreditNoteReason enum → the URA EFRIS reason code (101..105).
const REASON_ENUM_TO_CODE: Record<string, string> = {
  GOODS_RETURNED: '101', DAMAGED_GOODS: '101',
  CANCELLATION: '102',
  PRICING_ERROR: '103', BILLING_ERROR: '103',
  DISCOUNT_ADJUSTMENT: '104', GOODWILL: '104',
  SERVICE_ISSUE: '105', OTHER: '105',
};

async function ingestCreditNote(data: any) {
  const creditNoteNumber = data.creditNoteNumber || data.credit_note_number;
  if (!creditNoteNumber) throw new Error('credit note payload missing creditNoteNumber');

  const reasonCode = data.reasonCode || data.reason_code
    || (data.reasonEnum ? REASON_ENUM_TO_CODE[String(data.reasonEnum)] : undefined)
    || '105';

  const common = {
    sourceId: data.creditNoteId || data.id || null,
    originalInvoiceNumber: data.originalInvoiceNumber || data.original_invoice_number || null,
    reason: data.reason || null,
    reasonCode,
    customerName: data.customer?.name || data.customerName || null,
    customerTin: data.customer?.tin || data.customerTin || null,
    currency: data.currency || 'UGX',
    total: Number(data.total || 0),
    creditDate: (typeof data.creditDate === 'string' ? data.creditDate : '').slice(0, 10) || null,
    payload: data,
  };

  await prisma.ingestedCreditNote.upsert({
    where: { creditNoteNumber },
    update: common,
    create: { creditNoteNumber, status: 'PENDING', ...common },
  });
}

async function ingestStock(data: any, direction: 'IN' | 'OUT') {
  const reference = data.reference || data.grnNumber || data.adjustmentNumber || data.id;
  if (!reference) throw new Error('stock payload missing reference');

  const common = {
    sourceId: data.sourceId || data.id || null,
    movementType: data.movementType || data.stockInType || data.adjustType || null,
    supplierTin: data.supplierTin || data.supplier?.tin || null,
    supplierName: data.supplierName || data.supplier?.name || null,
    remarks: data.remarks || null,
    payload: data,
  };

  await prisma.ingestedStockMovement.upsert({
    where: { reference_direction: { reference: String(reference), direction } },
    update: common,
    create: { reference: String(reference), direction, status: 'PENDING', ...common },
  });
}
