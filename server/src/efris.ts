import { getConfig } from './prisma';

/**
 * EFRIS middleware client. The integrator never talks to URA directly — it builds the
 * middleware "simple" payload from the raw ERP invoice and POSTs it, exactly like the
 * YourBooks ERP's own EfrisService does, but from outside the ERP.
 */

function normalizeBaseUrl(url: string): string {
  let base = url.replace(/\/$/, '');
  if (!base.includes('/api/external/efris')) base += '/api/external/efris';
  return base;
}

export async function getConnection(): Promise<{ baseUrl: string; apiKey: string }> {
  const config = await getConfig();
  if (!config.middlewareUrl) throw new Error('EFRIS middleware URL is not configured. Set it in Settings.');
  if (!config.efrisApiKey) throw new Error('EFRIS API key is not configured. Set it in Settings.');
  return { baseUrl: normalizeBaseUrl(config.middlewareUrl), apiKey: config.efrisApiKey };
}

/** Map a raw ERP invoice (as delivered by the webhook) to the middleware simple format. */
export function buildInvoicePayload(invoice: any) {
  const customer = invoice.customer || {};
  const items = (invoice.items || []).map((it: any) => {
    const line: Record<string, any> = {
      item_name: it.description || it.name || 'Item',
      item_code: it.itemCode || it.description || it.name || 'ITEM',
      quantity: Number(it.quantity || 1),
      unit_price: Number(it.unitPrice ?? it.price ?? 0),
      tax_rate: it.taxExempt ? -1 : Number(it.taxRate ?? 18),
    };
    const commodity = it.commodityCode || it.goodsCategoryId || it.sku;
    if (commodity) line.goods_category_id = commodity;
    // EFRIS validates the unit of measure against the registered good (error 2197 on
    // mismatch). Forward the ERP item's UOM; the middleware defaults to 102 when absent.
    const uom = it.unitOfMeasure || it.unit_of_measure || it.measureUnit || it.unit;
    if (uom) line.unit_of_measure = String(uom);
    if (Number(it.discount) > 0) line.discount = Number(it.discount);
    return line;
  });

  return {
    format: 'simple',
    invoice_number: invoice.invoiceNumber,
    invoice_date: (invoice.invoiceDate || new Date().toISOString()).slice(0, 10),
    customer_name: customer.name || invoice.customerName || 'General Customer',
    customer_tin: customer.tin || invoice.customerTin || '',
    buyer_type: customer.type || (customer.tin ? '0' : '1'),
    payment_method: invoice.paymentMethod || '102',
    currency: invoice.currency || 'UGX',
    remarks: invoice.notes || 'e-Invoice via YourBooks Integrator',
    items,
  };
}

export async function submitInvoice(invoice: any): Promise<any> {
  const { baseUrl, apiKey } = await getConnection();
  const payload = buildInvoicePayload(invoice);
  const res = await fetch(`${baseUrl}/submit-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(payload),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result?.success === false) {
    const detail = result?.detail || result?.message || result?.error || `EFRIS submission failed (HTTP ${res.status})`;
    const err: any = new Error(detail);
    err.request = payload;
    err.response = result;
    throw err;
  }
  return { payload, result };
}

/** Map a raw ERP credit note (webhook payload) + the original invoice's FDN to T110. */
export function buildCreditNotePayload(cn: any, originalFdn: string) {
  const customer = cn.customer || {};
  const items = (cn.items || []).map((it: any) => {
    const commodity = it.commodityCode || it.goodsCategoryId || it.sku;
    const line: Record<string, any> = {
      item_name: it.description || it.name || 'Returned Item',
      item_code: it.itemCode || it.description || it.name || 'ITEM',
      quantity: Number(it.quantity || 1),
      unit_price: Number(it.unitPrice ?? it.price ?? 0),
      tax_rate: it.taxExempt ? -1 : Number(it.taxRate ?? 18),
    };
    if (commodity) {
      line.goods_category_id = commodity;
      line.goodsCategoryId = commodity;
      line.commodity_code = commodity;
    }
    if (Number(it.discount) > 0) line.discount = Number(it.discount);
    return line;
  });

  return {
    credit_note_number: cn.creditNoteNumber,
    original_invoice_number: cn.originalInvoiceNumber,
    original_fdn: originalFdn,
    customer_name: customer.name || cn.customerName || 'General Customer',
    customer_tin: customer.tin || cn.customerTin || '',
    buyer_type: customer.type || (customer.tin ? '0' : '1'),
    currency: cn.currency || 'UGX',
    reason: cn.reason || 'Client Return',
    reason_code: cn.reasonCode || '105',
    items,
  };
}

export async function submitCreditNote(cn: any, originalFdn: string): Promise<any> {
  const { baseUrl, apiKey } = await getConnection();
  const payload = buildCreditNotePayload(cn, originalFdn);
  const res = await fetch(`${baseUrl}/submit-credit-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(payload),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result?.success === false) {
    const detail = result?.detail || result?.message || result?.error || `Credit note submission failed (HTTP ${res.status})`;
    const err: any = new Error(detail);
    err.request = payload;
    err.response = result;
    throw err;
  }
  return { payload, result };
}

/** Map a raw ERP stock movement (webhook payload) to the middleware T131 payload. */
export function buildStockPayload(mv: any) {
  const items = (mv.items || []).map((it: any) => ({
    goodsCode: it.sku || it.itemCode || it.goodsCode || it.goods_code,
    quantity: String(Math.abs(Number(it.quantity || 0))),
    unitPrice: String(Number(it.unitPrice ?? it.price ?? 0)),
    measureUnit: it.unit || it.measureUnit || '101',
    remarks: it.remarks || '',
  }));

  if (mv.direction === 'IN') {
    return {
      path: 'stock-increase',
      body: {
        goodsStockIn: {
          operationType: '101', // 101 = Increase (required; URA error 2076 if empty)
          stockInType: mv.movementType || '102', // 102 = Local Purchase
          supplierTin: mv.supplierTin || mv.supplier?.tin || '',
          supplierName: mv.supplierName || mv.supplier?.name || '',
          remarks: mv.remarks || 'Stock increase via YourBooks Integrator',
          stockInDate: (mv.date || new Date().toISOString()).slice(0, 10),
        },
        goodsStockInItem: items,
      },
    };
  }
  return {
    path: 'stock-decrease',
    body: {
      goodsStockIn: {
        operationType: '102', // 102 = Decrease (required; URA error 2076 if empty)
        adjustType: mv.movementType || '102', // 102 = Damaged
        remarks: mv.remarks || 'Stock decrease via YourBooks Integrator',
      },
      goodsStockInItem: items,
    },
  };
}

export async function submitStock(mv: any): Promise<any> {
  const { baseUrl, apiKey } = await getConnection();
  const { path, body } = buildStockPayload(mv);
  const res = await fetch(`${baseUrl}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(body),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result?.success === false) {
    const detail = result?.detail || result?.message || result?.error || `Stock submission failed (HTTP ${res.status})`;
    const err: any = new Error(detail);
    err.request = body;
    err.response = result;
    throw err;
  }
  return { payload: body, result };
}

/** Generic GET lookup against the middleware (registration-details, branches, units, etc.). */
export async function efrisGet(path: string): Promise<any> {
  const { baseUrl, apiKey } = await getConnection();
  const res = await fetch(`${baseUrl}/${path.replace(/^\//, '')}`, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey },
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(result?.detail || result?.message || result?.error || `Lookup failed (HTTP ${res.status})`);
  }
  return result;
}
