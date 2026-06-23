import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Save, Copy, Check } from 'lucide-react';

const WEBHOOK_URL = `${location.protocol}//${location.hostname}:19092/webhooks/yourbooks`;

const fieldCls = 'w-full neo-inset rounded-2xl px-4 py-3 text-sm text-slate-800 bg-transparent outline-none';

export default function Settings() {
  const [form, setForm] = useState<any>({ middlewareUrl: '', efrisApiKey: '', webhookSecret: '', companyName: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.getConfig().then(setForm).catch(() => {}); }, []);

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setMsg(null);
    try { await api.saveConfig(form); setMsg('Settings saved.'); }
    catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  const copy = () => { navigator.clipboard.writeText(WEBHOOK_URL); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Connect the EFRIS middleware and the YourBooks ERP webhook.</p>
      </div>

      <section className="neo-outset rounded-3xl p-6 space-y-5">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">EFRIS Middleware</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          <label className="space-y-2 block">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Middleware URL</span>
            <input className={fieldCls} value={form.middlewareUrl || ''} onChange={(e) => set('middlewareUrl', e.target.value)} placeholder="https://efris.example.com" />
          </label>
          <label className="space-y-2 block">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">EFRIS API Key</span>
            <input className={fieldCls} value={form.efrisApiKey || ''} onChange={(e) => set('efrisApiKey', e.target.value)} placeholder="X-API-Key" />
          </label>
        </div>
        <label className="space-y-2 block">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Company Name (display)</span>
          <input className={fieldCls} value={form.companyName || ''} onChange={(e) => set('companyName', e.target.value)} placeholder="Demo Company Inc." />
        </label>
      </section>

      <section className="neo-outset rounded-3xl p-6 space-y-5">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">YourBooks ERP Webhook</h2>
        <div className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Webhook URL (register this in the ERP → Settings → Integrations)</span>
          <div className="flex items-center gap-3">
            <code className="flex-1 neo-inset rounded-2xl px-4 py-3 text-xs font-mono text-slate-700 break-all">{WEBHOOK_URL}</code>
            <button onClick={copy} className="shrink-0 neo-outset-sm rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 hover:neo-inset-sm transition-all flex items-center gap-1.5">
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <label className="space-y-2 block">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Webhook Signing Secret (must match the ERP endpoint's secret)</span>
          <input className={fieldCls} value={form.webhookSecret || ''} onChange={(e) => set('webhookSecret', e.target.value)} placeholder="whsec_…" />
        </label>
        <p className="text-xs text-slate-500">Leave the secret blank to accept unsigned webhooks (not recommended).</p>
      </section>

      <div className="flex items-center gap-4">
        <button onClick={save} disabled={saving} className="neo-outset-sm rounded-2xl px-6 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50">
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {msg && <span className="text-sm font-semibold text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}
