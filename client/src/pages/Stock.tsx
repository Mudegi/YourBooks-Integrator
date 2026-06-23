import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Send, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

const statusPill: Record<string, { cls: string; icon: any; label: string }> = {
  PENDING: { cls: 'text-amber-600', icon: Clock, label: 'Pending' },
  FISCALIZED: { cls: 'text-emerald-600', icon: CheckCircle2, label: 'Reported' },
  FAILED: { cls: 'text-red-600', icon: AlertTriangle, label: 'Failed' },
};

export default function Stock({ direction }: { direction: 'IN' | 'OUT' }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const title = direction === 'IN' ? 'Stock Increase' : 'Stock Decrease';
  const subtitle = direction === 'IN'
    ? 'Purchases / GRNs from YourBooks, reported to EFRIS (T131 stock-in).'
    : 'Adjustments / write-offs from YourBooks, reported to EFRIS (T131 stock-out).';

  const load = async () => {
    try { const { movements } = await api.listStock(direction); setRows(movements); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [direction]);

  const report = async (id: string) => {
    setBusyId(id); setErr(null);
    try { await api.reportStock(id); await load(); }
    catch (e: any) { setErr(e.message); await load(); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <button onClick={() => { setLoading(true); load(); }} className="neo-outset-sm rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-700 hover:neo-inset-sm transition-all flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {err && <div className="neo-inset rounded-2xl px-4 py-3 text-sm font-semibold text-red-600">{err}</div>}

      <div className="neo-outset rounded-3xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-white/60">
              <th className="px-6 py-3.5">Reference</th>
              <th className="px-6 py-3.5">Type</th>
              <th className="px-6 py-3.5">Items</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5">EFRIS Ref</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">No {title.toLowerCase()} records yet.</td></tr>
            ) : rows.map((mv) => {
              const s = statusPill[mv.status] || statusPill.PENDING;
              const itemCount = ((mv.payload?.items) || []).length;
              return (
                <tr key={mv.id} className="border-b border-white/40">
                  <td className="px-6 py-4 font-bold text-slate-800">{mv.reference}</td>
                  <td className="px-6 py-4 text-slate-600">{mv.movementType || '—'}</td>
                  <td className="px-6 py-4 text-slate-600">{itemCount}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 font-bold ${s.cls}`}>
                      <s.icon className="w-4 h-4" /> {s.label}
                    </span>
                    {mv.status === 'FAILED' && mv.efrisError && (
                      <p className="text-[11px] text-red-500 mt-1 max-w-xs">{mv.efrisError}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-blue-600">{mv.efrisReference || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    {mv.status !== 'FISCALIZED' && (
                      <button
                        onClick={() => report(mv.id)}
                        disabled={busyId === mv.id}
                        className="neo-outset-sm rounded-2xl px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" /> {busyId === mv.id ? 'Sending…' : 'Report to EFRIS'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
