import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { BottomNav } from './components/BottomNav';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { Insights } from './pages/Insights';
import { Settings } from './pages/Settings';
import { Ask } from './pages/Ask';
import { Installments } from './pages/Installments';
import { Family } from './pages/Family';
import { Join } from './pages/Join';
import { Privacy } from './pages/Privacy';
import { peekStashedInviteToken } from './lib/family';

function ProtectedShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-stone-600 dark:text-stone-400">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  // A family invite is waiting (the person had to sign in first): finish joining before
  // anything else. The join page has its own "Not now" that clears it.
  if (peekStashedInviteToken() && location.pathname !== '/join') return <Navigate to="/join" replace />;

  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}

function App() {
  return (
    <div className="h-full">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<ProtectedShell><Home /></ProtectedShell>} />
        <Route path="/history" element={<ProtectedShell><History /></ProtectedShell>} />
        <Route path="/insights" element={<ProtectedShell><Insights /></ProtectedShell>} />
        <Route path="/ask" element={<ProtectedShell><Ask /></ProtectedShell>} />
        <Route path="/join" element={<Join />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/family" element={<ProtectedShell><Family /></ProtectedShell>} />
        <Route path="/installments" element={<ProtectedShell><Installments /></ProtectedShell>} />
        <Route path="/settings" element={<ProtectedShell><Settings /></ProtectedShell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
