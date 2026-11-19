import { Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="layout">
      <main>
        <Outlet />
      </main>
      <footer>
      </footer>
    </div>
  );
}
