import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { BottomNav } from './components/BottomNav';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { Insights } from './pages/Insights';
import { Settings } from './pages/Settings';
import { Ask } from './pages/Ask';

function ProtectedShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}

function App() {
  return (
    <div className="mx-auto h-full max-w-md bg-white">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<ProtectedShell><Home /></ProtectedShell>} />
        <Route path="/history" element={<ProtectedShell><History /></ProtectedShell>} />
        <Route path="/insights" element={<ProtectedShell><Insights /></ProtectedShell>} />
        <Route path="/ask" element={<ProtectedShell><Ask /></ProtectedShell>} />
        <Route path="/settings" element={<ProtectedShell><Settings /></ProtectedShell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
