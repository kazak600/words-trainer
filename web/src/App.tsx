import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './Layout';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { LoginPage } from './pages/LoginPage';

function Gate() {
  const { state, retry } = useAuth();
  if (state.status === 'loading') return null;
  if (state.status === 'unreachable') {
    return (
      <div className="layout">
        <main>
          <section className="card">
            <p role="alert">Can’t reach the server.</p>
            <button type="button" className="primary" onClick={retry}>
              Retry
            </button>
          </section>
        </main>
      </div>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/session" element={<SessionPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
