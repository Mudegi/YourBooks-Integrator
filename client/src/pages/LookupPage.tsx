import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { RefreshCw, Search } from 'lucide-react';

interface Props {
  name: string;            // middleware lookup path (e.g. 'excise-duty')
  title: string;
  description: string;
  searchParam?: string;    // query param name for searching (e.g. 'excise_name')
}

// Find the most likely "rows" array inside a varied middleware response.
function extractRows(data: any): any[] | null {
  if (!data) return null;
  if (Array.isArray(data)) return data;
  for (const key of ['excise_codes', 'goods', 'units', 'unitsOfMeasure', 'categories', 'commodityCategories', 'items', 'list', 'data', 'records']) {
    if (Array.isArray(data[key])) return data[key];
  }
  // First array-valued property, if any.
  for (const v of Object.values(data)) if (Array.isArray(v)) return v as any[];
  return null;
}

const cell = (v: any) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function LookupPage({ name, title, description, searchParam }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const qs = searchParam && search.trim() ? `?${searchParam}=${encodeURIComponent(search.trim())}` : '';
      const { data } = await api.efrisLookup(name, qs);
      setData(data);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [name]);

  const rows = extractRows(data);
  const columns = rows && rows.length > 0 ? Object.keys(rows[0]).slice(0, 8) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {searchParam && (
            <div className="flex items-center gap-2 neo-inset-sm rounded-2xl px-3 py-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
                placeholder="Search…"
                className="bg-transparent text-sm outline-none w-40"
              />
            </div>
          )}
          <button onClick={load} className="neo-outset-sm rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-700 hover:neo-inset-sm transition-all flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> {loading ? 'Loading…' : 'Fetch'}
          </button>
        </div>
      </div>

      {err && <div className="neo-inset rounded-2xl px-4 py-3 text-sm font-semibold text-red-600">{err}</div>}

      <div className="neo-outset rounded-3xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-slate-400">Loading…</div>
        ) : rows && rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-white/60">
                  {columns.map((c) => <th key={c} className="px-5 py-3.5">{c.replace(/_/g, ' ')}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-white/40">
                    {columns.map((c) => <td key={c} className="px-5 py-3 text-slate-700">{cell(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : data && typeof data === 'object' && !Array.isArray(data) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 p-6">
            {Object.entries(data).filter(([, v]) => typeof v !== 'object').map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{k.replace(/_/g, ' ')}</span>
                <span className="text-sm font-semibold text-slate-800 break-words">{cell(v)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-slate-400">No data. Click Fetch.</div>
        )}
      </div>
    </div>
  );
}
