import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Package, History, Boxes, TrendingDown,
  Receipt, ShieldCheck, ArrowRightLeft, Ruler, Layers, Settings, Plug, GitBranch, BadgeCheck,
} from 'lucide-react';

const sourceItems = [
  { name: 'Invoices', icon: FileText, to: '/invoices' },
  { name: 'Credit Notes', icon: History, to: '/credit-notes' },
  { name: 'Stock Increase', icon: Boxes, to: '/stock-increase' },
  { name: 'Stock Decrease', icon: TrendingDown, to: '/stock-decrease' },
  { name: 'Stock Transfer', icon: ArrowRightLeft, to: '/stock-transfer' },
  { name: 'Goods & Services', icon: Package, to: '/goods' },
];

const efrisItems = [
  { name: 'Invoices', icon: Receipt, to: '/efris-invoices' },
  { name: 'Goods & Services', icon: Package, to: '/efris-goods' },
  { name: 'Branches', icon: GitBranch, to: '/efris-branches' },
  { name: 'Excise Duties', icon: ShieldCheck, to: '/excise-duties' },
  { name: 'Units of Measure', icon: Ruler, to: '/units-of-measure' },
  { name: 'Commodity Categories', icon: Layers, to: '/commodity-categories' },
  { name: 'Registration', icon: BadgeCheck, to: '/registration-details' },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return [
    'flex items-center gap-3 px-3.5 h-11 rounded-2xl text-sm font-semibold transition-all',
    isActive
      ? 'neo-inset-sm text-blue-600'
      : 'text-slate-600 hover:neo-inset-sm hover:text-slate-900',
  ].join(' ');
}

function Group({ label, items }: { label: string; items: typeof sourceItems }) {
  return (
    <div className="mt-6">
      <p className="px-3.5 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div className="space-y-1">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className={linkClass}>
            <it.icon className="w-[18px] h-[18px]" />
            {it.name}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 neo px-4 py-5 overflow-y-auto border-r border-white/40">
      <div className="flex items-center gap-3 px-1.5 mb-2">
        <div className="w-10 h-10 convex neo-outset-sm rounded-xl flex items-center justify-center text-blue-600">
          <Plug className="w-5 h-5" />
        </div>
        <div className="font-black text-lg tracking-tight text-slate-800 leading-none">
          YourBooks<br /><span className="text-blue-600">Integrator</span>
        </div>
      </div>

      <div className="mt-5 space-y-1">
        <NavLink to="/" end className={linkClass}>
          <LayoutDashboard className="w-[18px] h-[18px]" />
          Dashboard
        </NavLink>
      </div>

      <Group label="YourBooks (Source)" items={sourceItems} />
      <Group label="EFRIS" items={efrisItems} />

      <div className="mt-6 pt-4 border-t border-white/50">
        <NavLink to="/settings" className={linkClass}>
          <Settings className="w-[18px] h-[18px]" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
