import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Send, RefreshCw, CheckCircle2, AlertTriangle, Clock, ArrowRight } from 'lucide-react';

const statusPill: Record<string, { cls: string; icon: any; label: string }> = {
  PENDING: { cls: 'text-amber-600', icon: Clock, label: 'Pending' },
  FISCALIZED: { cls: 'text-emerald-600', icon: CheckCircle2, label: 'Reported' },
  FAILED: { cls: 'text-red-600', icon: AlertTriangle, label: 'Failed' },
};

export default function StockTransfer() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { const { transfers } = await api.listStockTransfers(); setRows(transfers); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); load(); }, []);

  const report = async (id: string) => {
    setBusyId(id); setErr(null);
    try { await api.reportStockTransfer(id); await load(); }
    catch (e: any) { setErr(e.message); await load(); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Stock Transfer</h1>
          <p className="text-sm text-slate-500">
            Inter-branch transfers from YourBooks, reported to EFRIS (T139). Needs each branch's
            EFRIS branch ID — check the <strong>EFRIS → Branches</strong> lookup.
          </p>
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
              <th className="px-6 py-3.5">Route</th>
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
              <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">No stock transfers yet.</td></tr>
            ) : rows.map((t) => {
              const s = statusPill[t.status] || statusPill.PENDING;
              const itemCount = ((t.payload?.items) || []).length;
              const from = t.sourceBranchName || t.sourceBranchId || '—';
              const to = t.destinationBranchName || t.destinationBranchId || '—';
              const missingIds = !t.sourceBranchId || !t.destinationBranchId;
              return (
                <tr key={t.id} className="border-b border-white/40">
                  <td className="px-6 py-4 font-bold text-slate-800">{t.reference}</td>
                  <td className="px-6 py-4 text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      {from} <ArrowRight className="w-3.5 h-3.5 text-slate-400" /> {to}
                    </span>
                    {missingIds && (
                      <p className="text-[11px] text-amber-600 mt-1">Branch not linked to an EFRIS ID</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{itemCount}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 font-bold ${s.cls}`}>
                      <s.icon className="w-4 h-4" /> {s.label}
                    </span>
                    {t.status === 'FAILED' && t.efrisError && (
                      <p className="text-[11px] text-red-500 mt-1 max-w-xs">{t.efrisError}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-blue-600">{t.efrisReference || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    {t.status !== 'FISCALIZED' && (
                      <button
                        onClick={() => report(t.id)}
                        disabled={busyId === t.id || missingIds}
                        title={missingIds ? 'Link both branches to their EFRIS branch IDs first' : ''}
                        className="neo-outset-sm rounded-2xl px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" /> {busyId === t.id ? 'Sending…' : 'Report to EFRIS'}
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
