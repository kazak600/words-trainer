import { useAuth } from '../auth/AuthContext';

export function HomePage() {
  const { state, logout } = useAuth();
  return (
    <section className="card">
      <header className="row">
        <h1>Topics</h1>
        <button type="button" onClick={logout}>
          Log out
        </button>
      </header>
      <p>{state.status === 'in' ? `Signed in as ${state.username}.` : null}</p>
      <p className="muted">Topics will appear here.</p>
    </section>
  );
}
