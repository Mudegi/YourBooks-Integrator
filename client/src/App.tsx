import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import CreditNotes from './pages/CreditNotes';
import Stock from './pages/Stock';
import Settings from './pages/Settings';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen px-8 py-7">
        <div className="max-w-6xl mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/credit-notes" element={<CreditNotes />} />
            <Route path="/stock-increase" element={<Stock direction="IN" />} />
            <Route path="/stock-decrease" element={<Stock direction="OUT" />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Placeholder />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
