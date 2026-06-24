import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { RefreshCw, Search, Package, Wrench } from 'lucide-react';

type Good = {
  item_code?: string; item_name?: string; is_service?: boolean; description?: string;
  commodity_category_code?: string; commodity_category_name?: string;
  unit_of_measure?: string; unit_price?: string; currency?: string;
  tax_rate?: string; is_zero_rate?: boolean; is_exempt?: boolean;
  has_excise_tax?: boolean; excise_duty_code?: string; excise_rate?: string;
  stock?: string; status?: string;
};

// EFRIS goods lookup returns { goods: [...] } (shapes vary); pull the array out robustly.
function extractGoods(data: any): Good[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  for (const k of ['goods', 'items', 'list', 'data', 'records']) if (Array.isArray(data[k])) return data[k];
  for (const v of Object.values(data)) if (Array.isArray(v)) return v as Good[];
  return [];
}

// Tax treatment is mutually exclusive in display order: exempt > zero > excise > standard.
function taxBadge(g: Good): { label: string; cls: string } {
  if (g.is_exempt) return { label: 'Exempt', cls: 'text-slate-600 bg-slate-500/10' };
  if (g.is_zero_rate) return { label: 'Zero-rated', cls: 'text-indigo-600 bg-indigo-500/10' };
  if (g.has_excise_tax) return { label: 'Excise', cls: 'text-amber-600 bg-amber-500/10' };
  return { label: 'Standard 18%', cls: 'text-emerald-600 bg-emerald-500/10' };
}

const fmtPrice = (g: Good) => {
  const n = Number(g.unit_price);
  if (!isFinite(n)) return '—';
  return new Intl.NumberFormat('en-UG', { maximumFractionDigits: 2 }).format(n);
};

const fmtStock = (s?: string) => {
  const n = Number(s);
  return isFinite(n) ? new Intl.NumberFormat('en-UG', { maximumFractionDigits: 2 }).format(n) : '—';
};

export default function Goods() {
  const [goods, setGoods] = useState<Good[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true); setErr(null);
    try { const { data } = await api.efrisLookup('goods'); setGoods(extractGoods(data)); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return goods;
    return goods.filter((g) =>
      [g.item_name, g.item_code, g.commodity_category_name, g.commodity_category_code]
        .some((v) => String(v || '').toLowerCase().includes(t)));
  }, [goods, q]);

  // Summary chips over the full (unfiltered) catalog.
  const counts = useMemo(() => {
    const c = { total: goods.length, standard: 0, zero: 0, exempt: 0, excise: 0, services: 0 };
    for (const g of goods) {
      if (g.is_service) c.services++;
      if (g.is_exempt) c.exempt++;
      else if (g.is_zero_rate) c.zero++;
      else if (g.has_excise_tax) c.excise++;
      else c.standard++;
    }
    return c;
  }, [goods]);

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
            The product catalogue registered with URA for this TIN. Use the exact <strong>item code</strong> and
            <strong> name</strong> here when raising invoices, so EFRIS validation passes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 neo-inset-sm rounded-2xl px-3 py-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, code, category…"
              className="bg-transparent text-sm outline-none w-52"
            />
          </div>
          <button onClick={load} className="neo-outset-sm rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-700 hover:neo-inset-sm transition-all flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {err && <div className="neo-inset rounded-2xl px-4 py-3 text-sm font-semibold text-red-600">{err} — set the middleware URL + API key in Settings.</div>}

      {!err && goods.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {chip('Total', counts.total)}
          {chip('Standard', counts.standard)}
          {chip('Zero-rated', counts.zero)}
          {chip('Exempt', counts.exempt)}
          {chip('Excise', counts.excise)}
          {chip('Services', counts.services)}
        </div>
      )}

      <div className="neo-outset rounded-3xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-slate-400">{goods.length === 0 ? 'No goods. Click Refresh.' : 'No matches.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-white/60">
                  <th className="px-5 py-3.5">Item</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Tax</th>
                  <th className="px-5 py-3.5">Unit</th>
                  <th className="px-5 py-3.5 text-right">Price</th>
                  <th className="px-5 py-3.5 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g, i) => {
                  const b = taxBadge(g);
                  return (
                    <tr key={`${g.item_code}-${i}`} className="border-b border-white/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="shrink-0 text-slate-400">
                            {g.is_service ? <Wrench className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate">{g.item_name || '—'}</div>
                            <div className="text-[11px] text-slate-400 font-mono truncate">{g.item_code || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        <div className="truncate max-w-[180px]">{g.commodity_category_name || '—'}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{g.commodity_category_code || ''}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-bold ${b.cls}`}>{b.label}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{g.unit_of_measure || '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-700 tabular-nums">{fmtPrice(g)}</td>
                      <td className="px-5 py-3 text-right text-slate-600 tabular-nums">{fmtStock(g.stock)}</td>
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
