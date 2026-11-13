import { Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="layout">
      <main>
        <Outlet />
      </main>
      <footer>
        Word data from{' '}
        <a href="https://en.wiktionary.org" target="_blank" rel="noreferrer">
          Wiktionary
        </a>
        , licensed{' '}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY-SA 4.0
        </a>
        .
      </footer>
    </div>
  );
}
