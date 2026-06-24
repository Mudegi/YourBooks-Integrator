import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { RefreshCw, BadgeCheck, ShieldAlert, Building2 } from 'lucide-react';

// The middleware returns the raw EFRIS T103 response: the detailed registration record is
// encrypted in data.content, but globalInfo carries the taxpayer/device identity, which is
// what's useful here — it confirms which TIN + device the integrator fiscalizes under.
const FIELDS: { key: string; label: string }[] = [
  { key: 'deviceNo', label: 'Device No' },
  { key: 'taxpayerUserId', label: 'Taxpayer User ID' },
  { key: 'userName', label: 'Username' },
  { key: 'brn', label: 'Business Reg. No (BRN)' },
  { key: 'appId', label: 'App ID' },
  { key: 'version', label: 'EFRIS Version' },
  { key: 'interfaceCode', label: 'Interface' },
  { key: 'requestTime', label: 'Last Synced' },
];

export default function RegistrationDetails() {
  const [info, setInfo] = useState<any>(null);
  const [state, setState] = useState<{ code?: string; message?: string }>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const { data } = await api.efrisLookup('registration-details');
      setInfo(data?.globalInfo || null);
      setState({ code: data?.returnStateInfo?.returnCode, message: data?.returnStateInfo?.returnMessage });
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const ok = state.code === '00';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Registration Details</h1>
          <p className="text-sm text-slate-500">The taxpayer and device this integrator fiscalizes under (EFRIS T103).</p>
        </div>
        <button onClick={load} className="neo-outset-sm rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-700 hover:neo-inset-sm transition-all flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {err && <div className="neo-inset rounded-2xl px-4 py-3 text-sm font-semibold text-red-600">{err} — set the middleware URL + API key in Settings.</div>}

      {loading ? (
        <div className="neo-outset rounded-3xl px-6 py-10 text-center text-slate-400">Loading…</div>
      ) : info ? (
        <>
          {/* Connection status */}
          <div className={`neo-inset rounded-2xl px-4 py-3 flex items-center gap-2.5 text-sm font-semibold ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>
            {ok ? <BadgeCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            {ok ? 'Connected to URA EFRIS.' : `URA response: ${state.message || 'unknown'} (${state.code || '—'})`}
          </div>

          {/* Taxpayer header */}
          <div className="neo-outset rounded-3xl p-6 flex items-start gap-4">
            <div className="w-12 h-12 shrink-0 neo-inset-sm rounded-2xl flex items-center justify-center text-blue-600">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Legal Name</div>
              <div className="text-lg font-black text-slate-900 leading-snug">{info.legalName || '—'}</div>
              <div className="mt-1 text-sm text-slate-500">TIN <span className="font-mono font-bold text-slate-700">{info.tin || '—'}</span></div>
            </div>
          </div>

          {/* Identity / device grid */}
          <div className="neo-outset rounded-3xl p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{f.label}</span>
                <span className="text-sm font-semibold text-slate-800 break-words">{info[f.key] || '—'}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-400">URA keeps the full registration record (address, contacts, business type) encrypted in the T103 response; the identity fields above are what the device exposes.</p>
        </>
      ) : (
        <div className="neo-outset rounded-3xl px-6 py-10 text-center text-slate-400">No registration data. Click Refresh.</div>
      )}
    </div>
  );
}
