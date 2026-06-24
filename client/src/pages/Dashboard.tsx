import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { FileText, Clock, CheckCircle2, AlertTriangle, RotateCw } from 'lucide-react';

const cards = [
  { key: 'total', label: 'Total Documents', icon: FileText, color: 'text-blue-600' },
  { key: 'pending', label: 'Pending', icon: Clock, color: 'text-amber-600' },
  { key: 'fiscalized', label: 'Fiscalized', icon: CheckCircle2, color: 'text-emerald-600' },
  { key: 'failed', label: 'Failed', icon: AlertTriangle, color: 'text-red-600' },
];

const typeRows: { key: string; label: string; to: string }[] = [
  { key: 'invoices', label: 'Invoices', to: '/invoices' },
  { key: 'creditNotes', label: 'Credit Notes', to: '/credit-notes' },
  { key: 'stock', label: 'Stock Movements', to: '/stock-increase' },
  { key: 'transfers', label: 'Stock Transfers', to: '/stock-transfer' },
];

const statusCls: Record<string, string> = {
  PENDING: 'text-amber-600', FISCALIZED: 'text-emerald-600', FAILED: 'text-red-600',
};

const kindLabel: Record<string, string> = {
  invoice: 'Invoice', 'credit-note': 'Credit Note', stock: 'Stock', 'stock-transfer': 'Transfer',
};

const empty = { total: 0, pending: 0, fiscalized: 0, failed: 0 };

export default function Dashboard() {
  const [stats, setStats] = useState<any>({ totals: empty, byType: {}, recent: [], failures: [] });
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = () => api.dashboard().then(setStats).catch(() => {});
  useEffect(() => { load(); }, []);

  const retry = async (kind: string, id: string) => {
    setRetrying(id);
    try { await api.retry(kind, id); } catch { /* error stays on the row after reload */ }
    finally { setRetrying(null); await load(); }
  };

  const totals = stats.totals || empty;
  const failures = stats.failures || [];

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">YourBooks → EFRIS fiscalization at a glance.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="neo-outset rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{c.label}</p>
                <div className={`w-9 h-9 neo-inset-sm rounded-xl flex items-center justify-center ${c.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <p className="mt-4 text-3xl font-black text-slate-900">{totals[c.key] ?? 0}</p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Per-document-type breakdown */}
        <div className="neo-outset rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/60">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">By document type</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-6 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Pending</th>
                <th className="px-3 py-2.5 text-right">Done</th>
                <th className="px-6 py-2.5 text-right">Failed</th>
              </tr>
            </thead>
            <tbody>
              {typeRows.map((r) => {
                const d = stats.byType?.[r.key] || empty;
                return (
                  <tr key={r.key} className="border-t border-white/40">
                    <td className="px-6 py-3 font-bold text-slate-700">
                      <Link to={r.to} className="hover:text-blue-600">{r.label}</Link>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{d.total}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-amber-600">{d.pending}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{d.fiscalized}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-red-600">{d.failed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Failures to retry */}
        <div className="neo-outset rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/60 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Failures to retry</h2>
            {failures.length > 0 && <span className="text-xs font-bold text-red-600">{failures.length}</span>}
          </div>
          {failures.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-400">No failures. 🎉</div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-white/40">
              {failures.map((f: any) => (
                <div key={f.id} className="px-6 py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{kindLabel[f.kind] || f.kind}</span>
                      <span className="font-bold text-slate-800 truncate">{f.label}</span>
                    </div>
                    <p className="text-xs text-red-600 mt-0.5 line-clamp-2">{f.error || 'Unknown error'}</p>
                  </div>
                  <button
                    onClick={() => retry(f.kind, f.id)}
                    disabled={retrying === f.id}
                    className="shrink-0 neo-outset-sm rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 hover:neo-inset-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${retrying === f.id ? 'animate-spin' : ''}`} />
                    {retrying === f.id ? 'Retrying…' : 'Retry'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Combined recent activity */}
      <div className="neo-outset rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/60">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Recent activity</h2>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {(stats.recent || []).length === 0 ? (
              <tr><td className="px-6 py-8 text-center text-slate-400">Nothing yet.</td></tr>
            ) : stats.recent.map((r: any) => (
              <tr key={`${r.kind}-${r.id}`} className="border-b border-white/40">
                <td className="px-6 py-3 w-24 text-[10px] font-black uppercase tracking-wider text-slate-400">{kindLabel[r.kind] || r.kind}</td>
                <td className="px-3 py-3 font-bold text-slate-800">{r.label}</td>
                <td className="px-3 py-3 text-slate-500">{r.sub}</td>
                <td className={`px-3 py-3 text-right font-mono text-xs ${statusCls[r.status] || 'text-slate-500'}`}>{r.status}</td>
                <td className="px-6 py-3 font-mono text-xs text-blue-600 text-right">{r.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
