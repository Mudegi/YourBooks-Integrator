import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { FileText, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

const cards = [
  { key: 'total', label: 'Total Invoices', icon: FileText, color: 'text-blue-600' },
  { key: 'pending', label: 'Pending', icon: Clock, color: 'text-amber-600' },
  { key: 'fiscalized', label: 'Fiscalized', icon: CheckCircle2, color: 'text-emerald-600' },
  { key: 'failed', label: 'Failed', icon: AlertTriangle, color: 'text-red-600' },
];

export default function Dashboard() {
  const [stats, setStats] = useState<any>({ total: 0, pending: 0, fiscalized: 0, failed: 0, recent: [] });

  useEffect(() => { api.dashboard().then(setStats).catch(() => {}); }, []);

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
              <p className="mt-4 text-3xl font-black text-slate-900">{stats[c.key] ?? 0}</p>
            </div>
          );
        })}
      </div>

      <div className="neo-outset rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/60 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Recent Invoices</h2>
          <Link to="/invoices" className="text-xs font-bold text-blue-600">View all →</Link>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {(stats.recent || []).length === 0 ? (
              <tr><td className="px-6 py-8 text-center text-slate-400">Nothing yet.</td></tr>
            ) : stats.recent.map((inv: any) => (
              <tr key={inv.id} className="border-b border-white/40">
                <td className="px-6 py-3 font-bold text-slate-800">{inv.invoiceNumber}</td>
                <td className="px-6 py-3 text-slate-600">{inv.customerName || '—'}</td>
                <td className="px-6 py-3 text-right font-mono text-xs text-slate-500">{inv.status}</td>
                <td className="px-6 py-3 font-mono text-xs text-blue-600">{inv.fdn || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
