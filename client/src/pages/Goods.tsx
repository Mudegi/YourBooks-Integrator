import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { RefreshCw, Search, Package, Wrench, BadgeCheck } from 'lucide-react';

type Product = {
  id: string; sourceId: string; sku?: string; name?: string; description?: string;
  productType?: string; category?: string; unitOfMeasure?: string;
  sellingPrice?: string; purchasePrice?: string; taxable?: boolean; defaultTaxRate?: string;
  efrisItemCode?: string; efrisProductCode?: string; haveExciseTax?: string; isActive?: boolean;
};

const isService = (p: Product) => /SERVICE|NON_INVENTORY/i.test(p.productType || '');

// Tax treatment from the ERP product fields.
function taxBadge(p: Product): { label: string; cls: string } {
  if (p.haveExciseTax === '101') return { label: 'Excise', cls: 'text-amber-600 bg-amber-500/10' };
  if (p.taxable === false) return { label: 'Non-taxable', cls: 'text-slate-600 bg-slate-500/10' };
  const rate = Number(p.defaultTaxRate);
  if (isFinite(rate) && rate > 0) return { label: `${rate}%`, cls: 'text-emerald-600 bg-emerald-500/10' };
  return { label: 'Taxable', cls: 'text-emerald-600 bg-emerald-500/10' };
}

const fmt = (v?: string) => {
  const n = Number(v);
  return isFinite(n) ? new Intl.NumberFormat('en-UG', { maximumFractionDigits: 2 }).format(n) : '—';
};

export default function Goods() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true); setErr(null);
    try { const { products } = await api.listProducts(); setProducts(products); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products;
    return products.filter((p) =>
      [p.name, p.sku, p.category].some((v) => String(v || '').toLowerCase().includes(t)));
  }, [products, q]);

  const counts = useMemo(() => {
    const c = { total: products.length, active: 0, services: 0, efris: 0 };
    for (const p of products) {
      if (p.isActive !== false) c.active++;
      if (isService(p)) c.services++;
      if (p.efrisProductCode) c.efris++;
    }
    return c;
  }, [products]);

  const chip = (label: string, n: number) => (
    <div className="neo-inset-sm rounded-2xl px-3.5 py-2 text-center">
      <div className="text-lg font-black text-slate-800 leading-none">{n}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{label}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Goods &amp; Services</h1>
          <p className="text-sm text-slate-500">
            Your YourBooks product catalogue, pushed from the ERP. Distinct from <strong>EFRIS → Goods</strong>,
            which lists what URA has on record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 neo-inset-sm rounded-2xl px-3 py-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, SKU, category…"
              className="bg-transparent text-sm outline-none w-52"
            />
          </div>
          <button onClick={load} className="neo-outset-sm rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-700 hover:neo-inset-sm transition-all flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {err && <div className="neo-inset rounded-2xl px-4 py-3 text-sm font-semibold text-red-600">{err}</div>}

      {!err && products.length > 0 && (
        <div className="grid grid-cols-4 gap-3 max-w-xl">
          {chip('Total', counts.total)}
          {chip('Active', counts.active)}
          {chip('Services', counts.services)}
          {chip('EFRIS reg.', counts.efris)}
        </div>
      )}

      <div className="neo-outset rounded-3xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-slate-400">Loading…</div>
        ) : products.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400 space-y-1">
            <p className="font-semibold text-slate-500">No products yet.</p>
            <p className="text-sm">They appear here as the ERP creates/updates products, or when you run a catalogue sync from YourBooks.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-slate-400">No matches.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-white/60">
                  <th className="px-5 py-3.5">Item</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Tax</th>
                  <th className="px-5 py-3.5">Unit</th>
                  <th className="px-5 py-3.5 text-right">Selling Price</th>
                  <th className="px-5 py-3.5 text-center">EFRIS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const b = taxBadge(p);
                  return (
                    <tr key={p.id} className={`border-b border-white/40 ${p.isActive === false ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="shrink-0 text-slate-400">
                            {isService(p) ? <Wrench className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate">{p.name || '—'}</div>
                            <div className="text-[11px] text-slate-400 font-mono truncate">{p.sku || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600"><span className="truncate max-w-[160px] inline-block">{p.category || '—'}</span></td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-bold ${b.cls}`}>{b.label}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{p.unitOfMeasure || '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-700 tabular-nums">{fmt(p.sellingPrice)}</td>
                      <td className="px-5 py-3 text-center">
                        {p.efrisProductCode
                          ? <span title={`EFRIS code ${p.efrisProductCode}`} className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold"><BadgeCheck className="w-4 h-4" /> Reg.</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
