import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import CreditNotes from './pages/CreditNotes';
import Stock from './pages/Stock';
import StockTransfer from './pages/StockTransfer';
import LookupPage from './pages/LookupPage';
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
            <Route path="/stock-transfer" element={<StockTransfer />} />
            {/* EFRIS read-only lookups (live from the middleware) */}
            <Route path="/efris-invoices" element={<Invoices />} />
            <Route path="/efris-goods" element={<LookupPage name="goods" title="EFRIS Goods & Services" description="Products registered with URA for this TIN." searchParam="search" />} />
            <Route path="/excise-duties" element={<LookupPage name="excise-duty" title="Excise Duties" description="Valid excise duty codes and rates from the EFRIS registry." searchParam="excise_name" />} />
            <Route path="/units-of-measure" element={<LookupPage name="units-of-measure" title="Units of Measure" description="Valid EFRIS unit codes (T115 rateUnit)." />} />
            <Route path="/commodity-categories" element={<LookupPage name="commodity-categories" title="Commodity Categories" description="Commodity classification codes for product registration." />} />
            <Route path="/efris-branches" element={<LookupPage name="branches" title="EFRIS Branches" description="Branch IDs registered with URA (T138). These branch IDs are what stock transfers use as source/destination." />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Placeholder />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
