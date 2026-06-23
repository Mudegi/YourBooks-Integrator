import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';

export default function Placeholder() {
  const { pathname } = useLocation();
  const name = pathname.replace('/', '').replace(/-/g, ' ') || 'page';
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 gap-4">
      <div className="w-16 h-16 neo-outset rounded-3xl flex items-center justify-center text-blue-600">
        <Construction className="w-7 h-7" />
      </div>
      <h2 className="text-xl font-black capitalize text-slate-800">{name}</h2>
      <p className="text-sm text-slate-500 max-w-md">
        This section is part of a later phase. Phase 1 covers Settings, the webhook
        receiver, and the Invoices → EFRIS fiscalization flow.
      </p>
    </div>
  );
}
