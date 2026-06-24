import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Save, Copy, Check, Eye, EyeOff } from 'lucide-react';

const WEBHOOK_URL = `${location.protocol}//${location.hostname}:19092/webhooks/yourbooks`;

const fieldCls = 'w-full neo-inset rounded-2xl px-4 py-3 text-sm text-slate-800 bg-transparent outline-none';

type Meta = {
  efrisApiKeySet: boolean; efrisApiKeyPreview: string;
  webhookSecretSet: boolean; webhookSecretPreview: string;
};

export default function Settings() {
  const [form, setForm] = useState<any>({ middlewareUrl: '', companyName: '', autoFiscalize: false });
  const [meta, setMeta] = useState<Meta>({ efrisApiKeySet: false, efrisApiKeyPreview: '', webhookSecretSet: false, webhookSecretPreview: '' });
  // Secrets the user has actually typed this session (dirty-tracked); only these get sent.
  const [secrets, setSecrets] = useState<{ efrisApiKey?: string; webhookSecret?: string }>({});
  const [reveal, setReveal] = useState({ efrisApiKey: false, webhookSecret: false });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => api.getConfig().then((c: any) => {
    setForm({ middlewareUrl: c.middlewareUrl || '', companyName: c.companyName || '', autoFiscalize: !!c.autoFiscalize });
    setMeta({
      efrisApiKeySet: !!c.efrisApiKeySet, efrisApiKeyPreview: c.efrisApiKeyPreview || '',
      webhookSecretSet: !!c.webhookSecretSet, webhookSecretPreview: c.webhookSecretPreview || '',
    });
  }).catch(() => {});

  useEffect(() => { load(); }, []);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setSecret = (k: 'efrisApiKey' | 'webhookSecret', v: string) => setSecrets((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      // Send the plain fields always; include a secret only if the user typed in it.
      const payload: any = { middlewareUrl: form.middlewareUrl, companyName: form.companyName, autoFiscalize: !!form.autoFiscalize };
      if ('efrisApiKey' in secrets) payload.efrisApiKey = secrets.efrisApiKey;
      if ('webhookSecret' in secrets) payload.webhookSecret = secrets.webhookSecret;
      await api.saveConfig(payload);
      setSecrets({}); // clear typed secrets; reload to refresh the masked previews
      await load();
      setMsg('Settings saved.');
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  const copy = () => { navigator.clipboard.writeText(WEBHOOK_URL); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  // A masked secret input: empty until the user types; placeholder shows the stored preview.
  const secretField = (key: 'efrisApiKey' | 'webhookSecret', isSet: boolean, preview: string, emptyHint: string) => {
    const placeholder = isSet ? `${preview} — leave blank to keep` : emptyHint;
    return (
      <div className="relative">
        <input
          type={reveal[key] ? 'text' : 'password'}
          className={`${fieldCls} pr-11`}
          value={secrets[key] ?? ''}
          onChange={(e) => setSecret(key, e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setReveal((r) => ({ ...r, [key]: !r[key] }))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          tabIndex={-1}
          title={reveal[key] ? 'Hide' : 'Show'}
        >
          {reveal[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    );
  };

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
            {secretField('efrisApiKey', meta.efrisApiKeySet, meta.efrisApiKeyPreview, 'X-API-Key')}
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
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Webhook URL (register this in the ERP → Integrations → Webhooks)</span>
          <div className="flex items-center gap-3">
            <code className="flex-1 neo-inset rounded-2xl px-4 py-3 text-xs font-mono text-slate-700 break-all">{WEBHOOK_URL}</code>
            <button onClick={copy} className="shrink-0 neo-outset-sm rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 hover:neo-inset-sm transition-all flex items-center gap-1.5">
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <label className="space-y-2 block">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Webhook Signing Secret (must match the ERP endpoint's secret)</span>
          {secretField('webhookSecret', meta.webhookSecretSet, meta.webhookSecretPreview, 'whsec_…')}
        </label>
        <p className="text-xs text-slate-500">Leave blank to keep the current secret. Clear it and save to accept unsigned webhooks (not recommended).</p>
      </section>

      <section className="neo-outset rounded-3xl p-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Fiscalization</h2>
        <button
          type="button"
          onClick={() => set('autoFiscalize', !form.autoFiscalize)}
          className="w-full flex items-center justify-between gap-4 text-left"
        >
          <div>
            <div className="text-sm font-bold text-slate-800">Auto-fiscalize on receipt</div>
            <p className="text-xs text-slate-500 mt-0.5 max-w-md">
              Fiscalize / report each document the moment its webhook arrives. If URA rejects it,
              the document is left for you to fix and retry from its page — the manual buttons still work.
            </p>
          </div>
          <span className={`shrink-0 w-12 h-7 rounded-full p-1 transition-colors ${form.autoFiscalize ? 'bg-blue-600' : 'neo-inset-sm bg-slate-300/40'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${form.autoFiscalize ? 'translate-x-5' : ''}`} />
          </span>
        </button>
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
