// Thin fetch wrapper for the integrator API (proxied to the Express server in dev).
const BASE = '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  getConfig: () => request<any>('/config'),
  saveConfig: (body: any) => request<any>('/config', { method: 'PUT', body: JSON.stringify(body) }),
  listInvoices: (status?: string) => request<{ invoices: any[] }>(`/invoices${status ? `?status=${status}` : ''}`),
  fiscalize: (id: string) => request<any>(`/invoices/${id}/fiscalize`, { method: 'POST' }),
  listCreditNotes: (status?: string) => request<{ creditNotes: any[] }>(`/credit-notes${status ? `?status=${status}` : ''}`),
  fiscalizeCreditNote: (id: string) => request<any>(`/credit-notes/${id}/fiscalize`, { method: 'POST' }),
  listStock: (direction: 'IN' | 'OUT') => request<{ movements: any[] }>(`/stock?direction=${direction}`),
  reportStock: (id: string) => request<any>(`/stock/${id}/report`, { method: 'POST' }),
  listStockTransfers: () => request<{ transfers: any[] }>(`/stock-transfers`),
  reportStockTransfer: (id: string) => request<any>(`/stock-transfers/${id}/report`, { method: 'POST' }),
  efrisLookup: (name: string, qs = '') => request<{ data: any }>(`/efris/${name}${qs}`),
  dashboard: () => request<any>('/dashboard/stats'),
  lookup: (name: string) => request<any>(`/efris/${name}`),
};
