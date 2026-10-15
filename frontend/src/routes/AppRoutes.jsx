import { useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import Navbar from "../components/layout/Navbar";
import Sidebar from "../components/layout/Sidebar";
import Loader from "../components/common/Loader";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Dashboard from "../pages/Dashboard";
import Income from "../pages/Income";
import FixedCommitments from "../pages/FixedCommitments";
import Expenses from "../pages/Expenses";
import Budgets from "../pages/Budgets";
import BillCalendar from "../pages/BillCalendar";
import Investments from "../pages/Investments";
import Goals from "../pages/Goals";
import Reports from "../pages/Reports";
import Settings from "../pages/Settings";

function ProtectedLayout({ children }) {
  const { isAuthenticated, loading, sessionError } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return <Loader full label="Checking your session..." />;
  if (sessionError) return <div role="alert" className="mx-auto mt-12 max-w-md rounded-xl border border-rose-200 bg-white p-6 text-slate-800">
    <h1 className="text-lg font-semibold">Unable to connect to the server</h1>
    <p className="mt-2 text-sm">{sessionError}</p>
    <button type="button" className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-white" onClick={() => window.location.reload()}>Retry connection</button>
  </div>;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-[#090d11]">
      <Navbar
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
      />
      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm md:hidden"
          />
        )}
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
        <main
          key={location.pathname}
          className="min-w-0 flex-1 animate-fade-in-up p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function PublicOnly({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <Loader full label="Checking your session..." />;
  return isAuthenticated ? <Navigate to="/" replace /> : children;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
      <Route path="/income" element={<ProtectedLayout><Income /></ProtectedLayout>} />
      <Route path="/fixed-commitments" element={<ProtectedLayout><FixedCommitments /></ProtectedLayout>} />
      <Route path="/expenses" element={<ProtectedLayout><Expenses /></ProtectedLayout>} />
      <Route path="/budgets" element={<ProtectedLayout><Budgets /></ProtectedLayout>} />
      <Route path="/calendar" element={<ProtectedLayout><BillCalendar /></ProtectedLayout>} />
      <Route path="/investments" element={<ProtectedLayout><Investments /></ProtectedLayout>} />
      <Route path="/goals" element={<ProtectedLayout><Goals /></ProtectedLayout>} />
      <Route path="/reports" element={<ProtectedLayout><Reports /></ProtectedLayout>} />
      <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
