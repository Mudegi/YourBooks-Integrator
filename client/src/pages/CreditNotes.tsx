import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Send, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

const money = (n: number, c = 'UGX') => `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const statusPill: Record<string, { cls: string; icon: any; label: string }> = {
  PENDING: { cls: 'text-amber-600', icon: Clock, label: 'Pending' },
  FISCALIZED: { cls: 'text-emerald-600', icon: CheckCircle2, label: 'Fiscalized' },
  FAILED: { cls: 'text-red-600', icon: AlertTriangle, label: 'Failed' },
};

export default function CreditNotes() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { const { creditNotes } = await api.listCreditNotes(); setRows(creditNotes); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const fiscalize = async (id: string) => {
    setBusyId(id); setErr(null);
    try { await api.fiscalizeCreditNote(id); await load(); }
    catch (e: any) { setErr(e.message); await load(); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Credit Notes</h1>
          <p className="text-sm text-slate-500">Credit notes from YourBooks, fiscalized against the original invoice's FDN.</p>
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
              <th className="px-6 py-3.5">Credit Note #</th>
              <th className="px-6 py-3.5">Original Invoice</th>
              <th className="px-6 py-3.5">Customer</th>
              <th className="px-6 py-3.5 text-right">Total</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5">FDN</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400">No credit notes yet. Create one in YourBooks — it arrives here via the webhook.</td></tr>
            ) : rows.map((cn) => {
              const s = statusPill[cn.status] || statusPill.PENDING;
              return (
                <tr key={cn.id} className="border-b border-white/40">
                  <td className="px-6 py-4 font-bold text-slate-800">{cn.creditNoteNumber}</td>
                  <td className="px-6 py-4 text-slate-600">{cn.originalInvoiceNumber || '—'}</td>
                  <td className="px-6 py-4 text-slate-600">{cn.customerName || '—'}</td>
                  <td className="px-6 py-4 text-right font-mono text-slate-700">{money(cn.total, cn.currency)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 font-bold ${s.cls}`}>
                      <s.icon className="w-4 h-4" /> {s.label}
                    </span>
                    {cn.status === 'FAILED' && cn.efrisError && (
                      <p className="text-[11px] text-red-500 mt-1 max-w-xs">{cn.efrisError}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-blue-600">{cn.fdn || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    {cn.status !== 'FISCALIZED' && (
                      <button
                        onClick={() => fiscalize(cn.id)}
                        disabled={busyId === cn.id}
                        className="neo-outset-sm rounded-2xl px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" /> {busyId === cn.id ? 'Sending…' : 'Fiscalize'}
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
