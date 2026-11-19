import { Outlet, useLocation } from 'react-router-dom';
import { DeckProvider } from '../decks/DeckContext';
import { TabBar } from './TabBar';

export function AppShell() {
  const inSession = useLocation().pathname === '/session';
  return (
    <DeckProvider>
      <div className={inSession ? undefined : 'with-tabs'}>
        <Outlet />
      </div>
      {!inSession && <TabBar />}
    </DeckProvider>
  );
}
