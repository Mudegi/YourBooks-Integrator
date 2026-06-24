import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Send, RefreshCw, CheckCircle2, AlertTriangle, Clock, ArrowRight } from 'lucide-react';

const statusPill: Record<string, { cls: string; icon: any; label: string }> = {
  PENDING: { cls: 'text-amber-600', icon: Clock, label: 'Pending' },
  FISCALIZED: { cls: 'text-emerald-600', icon: CheckCircle2, label: 'Reported' },
  FAILED: { cls: 'text-red-600', icon: AlertTriangle, label: 'Failed' },
};

type Branch = { id: string; name: string };

// The EFRIS /branches lookup payload varies; pull out {id,name} robustly.
function extractBranches(data: any): Branch[] {
  let arr: any[] = [];
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === 'object') {
    arr = data.branches || data.branchList || data.list || data.records || data.data
      || Object.values(data).find((v) => Array.isArray(v)) || [];
  }
  return (arr as any[]).map((b) => ({
    id: String(b.branchId ?? b.id ?? b.branch_id ?? b.value ?? ''),
    name: String(b.branchName ?? b.name ?? b.branch_name ?? b.label ?? b.branchId ?? b.id ?? ''),
  })).filter((b) => b.id);
}

export default function StockTransfer() {
  const [rows, setRows] = useState<any[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchErr, setBranchErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Per-row chosen branch ids: { [transferId]: { from, to } }
  const [sel, setSel] = useState<Record<string, { from: string; to: string }>>({});

  const load = async () => {
    try {
      const { transfers } = await api.listStockTransfers();
      setRows(transfers);
      // Seed selections from whatever the ERP already supplied.
      setSel((prev) => {
        const next = { ...prev };
        for (const t of transfers) {
          if (!next[t.id]) next[t.id] = { from: t.sourceBranchId || '', to: t.destinationBranchId || '' };
        }
        return next;
      });
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const loadBranches = async () => {
    try {
      const { data } = await api.efrisLookup('branches');
      setBranches(extractBranches(data));
      setBranchErr(null);
    } catch (e: any) { setBranchErr(e.message); }
  };

  useEffect(() => { setLoading(true); load(); loadBranches(); }, []);

  const setRowSel = (id: string, key: 'from' | 'to', val: string) =>
    setSel((s) => ({ ...s, [id]: { ...(s[id] || { from: '', to: '' }), [key]: val } }));

  const report = async (row: any) => {
    const choice = sel[row.id] || { from: '', to: '' };
    setBusyId(row.id); setErr(null);
    try {
      const fromB = branches.find((b) => b.id === choice.from);
      const toB = branches.find((b) => b.id === choice.to);
      await api.reportStockTransfer(row.id, {
        sourceBranchId: choice.from || undefined,
        destinationBranchId: choice.to || undefined,
        sourceBranchName: fromB?.name,
        destinationBranchName: toB?.name,
      });
      await load();
    } catch (e: any) { setErr(e.message); await load(); }
    finally { setBusyId(null); }
  };

  const branchSelect = (id: string, key: 'from' | 'to') => (
    <select
      value={(sel[id]?.[key]) || ''}
      onChange={(e) => setRowSel(id, key, e.target.value)}
      disabled={branches.length === 0}
      className="neo-inset-sm rounded-xl px-2.5 py-1.5 text-xs text-slate-700 bg-transparent outline-none max-w-[150px]"
    >
      <option value="">{branches.length ? 'Select branch…' : 'No branches'}</option>
      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Stock Transfer</h1>
          <p className="text-sm text-slate-500">
            Inter-branch transfers from YourBooks, reported to EFRIS (T139). Pick the <strong>From</strong>
            and <strong>To</strong> branches (loaded from the EFRIS Branches lookup), then report.
          </p>
        </div>
        <button onClick={() => { setLoading(true); load(); loadBranches(); }} className="neo-outset-sm rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-700 hover:neo-inset-sm transition-all flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {err && <div className="neo-inset rounded-2xl px-4 py-3 text-sm font-semibold text-red-600">{err}</div>}
      {branchErr && <div className="neo-inset rounded-2xl px-4 py-3 text-xs font-semibold text-amber-600">Couldn’t load EFRIS branches: {branchErr}. Set the middleware URL + API key in Settings.</div>}

      <div className="neo-outset rounded-3xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-white/60">
              <th className="px-6 py-3.5">Reference</th>
              <th className="px-6 py-3.5">From → To branch</th>
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
              const choice = sel[t.id] || { from: '', to: '' };
              const ready = !!choice.from && !!choice.to;
              return (
                <tr key={t.id} className="border-b border-white/40 align-top">
                  <td className="px-6 py-4 font-bold text-slate-800">{t.reference}</td>
                  <td className="px-6 py-4">
                    {t.status === 'FISCALIZED' ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        {t.sourceBranchName || t.sourceBranchId} <ArrowRight className="w-3.5 h-3.5 text-slate-400" /> {t.destinationBranchName || t.destinationBranchId}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {branchSelect(t.id, 'from')}
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {branchSelect(t.id, 'to')}
                      </div>
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
                        onClick={() => report(t)}
                        disabled={busyId === t.id || !ready}
                        title={!ready ? 'Select both From and To branches first' : ''}
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
