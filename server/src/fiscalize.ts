import { prisma } from './prisma';
import { submitInvoice, submitCreditNote, submitStock, submitStockTransfer } from './efris';

/**
 * Core fiscalization logic, extracted from the REST handlers so it can be driven by either a
 * manual button (routes.ts) or auto-fiscalize on webhook receipt (webhooks.ts). Each function
 * performs the EFRIS submission, persists FISCALIZED/FAILED + an EfrisLog (exactly as the
 * manual path did), and returns the result or throws a FiscalizeError.
 */
export class FiscalizeError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export type BranchOverride = {
  sourceBranchId?: string; destinationBranchId?: string;
  sourceBranchName?: string; destinationBranchName?: string;
};

export async function fiscalizeInvoice(id: string): Promise<{ fdn?: string; alreadyFiscalized?: boolean }> {
  const inv = await prisma.ingestedInvoice.findUnique({ where: { id } });
  if (!inv) throw new FiscalizeError('Invoice not found', 404);
  if (inv.status === 'FISCALIZED') return { alreadyFiscalized: true, fdn: inv.fdn || undefined };

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
    return { fdn };
  } catch (e: any) {
    await prisma.ingestedInvoice.update({ where: { id: inv.id }, data: { status: 'FAILED', efrisError: e.message } });
    await prisma.efrisLog.create({ data: { kind: 'invoice', reference: inv.invoiceNumber, success: false, request: e.request, response: e.response } });
    throw new FiscalizeError(e.message);
  }
}

export async function fiscalizeCreditNote(id: string): Promise<{ fdn?: string; alreadyFiscalized?: boolean }> {
  const cn = await prisma.ingestedCreditNote.findUnique({ where: { id } });
  if (!cn) throw new FiscalizeError('Credit note not found', 404);
  if (cn.status === 'FISCALIZED') return { alreadyFiscalized: true, fdn: cn.fdn || undefined };

  // EFRIS can only credit an invoice that was itself fiscalized. The integrator holds the FDN
  // (the ERP is EFRIS-free), so recover it from the original ingested invoice. These are
  // validation failures, not URA rejections — they don't mark the note FAILED.
  if (!cn.originalInvoiceNumber) {
    throw new FiscalizeError('This credit note has no original invoice number, so it cannot be fiscalized.');
  }
  const original = await prisma.ingestedInvoice.findUnique({ where: { invoiceNumber: cn.originalInvoiceNumber } });
  if (!original || original.status !== 'FISCALIZED' || !original.fdn) {
    throw new FiscalizeError(`The original invoice ${cn.originalInvoiceNumber} hasn't been fiscalized with EFRIS yet, so URA can't accept a credit note against it. Fiscalize that invoice first.`);
  }

  try {
    const cnData = {
      ...(cn.payload as any),
      creditNoteNumber: cn.creditNoteNumber,
      originalInvoiceNumber: cn.originalInvoiceNumber,
      reason: cn.reason,
      reasonCode: cn.reasonCode,
      currency: cn.currency,
    };
    const { payload, result } = await submitCreditNote(cnData, original.fdn);
    // T110 returns an application referenceNo (the FDN is only assigned once URA approves the
    // credit note); surface whichever identifier EFRIS gave us.
    const fdn = result.fdn || result.fiscal_data?.fdn || result.referenceNo || '';
    const vc = result.verification_code || result.fiscal_data?.verification_code || '';
    const qr = result.qr_code || result.fiscal_data?.qr_code || '';
    await prisma.ingestedCreditNote.update({
      where: { id: cn.id },
      data: { status: 'FISCALIZED', fdn, verificationCode: vc, qrCode: qr, efrisError: null, fiscalizedAt: new Date() },
    });
    await prisma.efrisLog.create({ data: { kind: 'credit_note', reference: cn.creditNoteNumber, success: true, request: payload as any, response: result } });
    return { fdn };
  } catch (e: any) {
    await prisma.ingestedCreditNote.update({ where: { id: cn.id }, data: { status: 'FAILED', efrisError: e.message } });
    await prisma.efrisLog.create({ data: { kind: 'credit_note', reference: cn.creditNoteNumber, success: false, request: e.request, response: e.response } });
    throw new FiscalizeError(e.message);
  }
}

export async function reportStockMovement(id: string): Promise<{ reference?: string; alreadyReported?: boolean }> {
  const mv = await prisma.ingestedStockMovement.findUnique({ where: { id } });
  if (!mv) throw new FiscalizeError('Stock movement not found', 404);
  if (mv.status === 'FISCALIZED') return { alreadyReported: true };

  try {
    const data = { ...(mv.payload as any), direction: mv.direction, movementType: mv.movementType, supplierTin: mv.supplierTin, supplierName: mv.supplierName, remarks: mv.remarks };
    const { payload, result } = await submitStock(data);
    const ref = result.efris_reference || result.referenceNo || result.transferReferenceNo || 'EFRIS-OK';
    await prisma.ingestedStockMovement.update({ where: { id: mv.id }, data: { status: 'FISCALIZED', efrisReference: ref, efrisError: null, reportedAt: new Date() } });
    await prisma.efrisLog.create({ data: { kind: 'stock', reference: mv.reference, success: true, request: payload as any, response: result } });
    return { reference: ref };
  } catch (e: any) {
    await prisma.ingestedStockMovement.update({ where: { id: mv.id }, data: { status: 'FAILED', efrisError: e.message } });
    await prisma.efrisLog.create({ data: { kind: 'stock', reference: mv.reference, success: false, request: e.request, response: e.response } });
    throw new FiscalizeError(e.message);
  }
}

export async function reportStockTransfer(id: string, branches: BranchOverride = {}): Promise<{ reference?: string; alreadyReported?: boolean }> {
  const t = await prisma.ingestedStockTransfer.findUnique({ where: { id } });
  if (!t) throw new FiscalizeError('Stock transfer not found', 404);
  if (t.status === 'FISCALIZED') return { alreadyReported: true };

  // The user can pick source/destination branches in the integrator (from the EFRIS Branches
  // lookup) when the ERP didn't supply linked branch IDs. Persist the chosen IDs before reporting.
  const { sourceBranchId, destinationBranchId, sourceBranchName, destinationBranchName } = branches;
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
    return { reference: ref };
  } catch (e: any) {
    await prisma.ingestedStockTransfer.update({ where: { id: t.id }, data: { status: 'FAILED', efrisError: e.message } });
    await prisma.efrisLog.create({ data: { kind: 'stock_transfer', reference: t.reference, success: false, request: e.request, response: e.response } });
    throw new FiscalizeError(e.message);
  }
}

/** Dispatch auto-fiscalize by the document kind used in webhooks.ts. Errors are already
 *  persisted (FAILED + log) by the functions above, so callers can fire-and-forget. */
export function autoFiscalize(kind: string, id: string): Promise<unknown> {
  switch (kind) {
    case 'invoice': return fiscalizeInvoice(id);
    case 'credit-note': return fiscalizeCreditNote(id);
    case 'stock': return reportStockMovement(id);
    case 'stock-transfer': return reportStockTransfer(id);
    default: return Promise.resolve();
  }
}
