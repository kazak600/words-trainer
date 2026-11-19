import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const icon = (path: string): ReactNode => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d={path} />
  </svg>
);

const TABS = [
  {
    to: '/',
    label: 'Home',
    end: true,
    icon: icon('M12 3 3 10.5V21h6v-6h6v6h6V10.5z'),
  },
  {
    to: '/review',
    label: 'Review',
    end: false,
    icon: icon(
      'M12 4a8 8 0 1 0 7.7 10h-2.1A6 6 0 1 1 12 6c1.7 0 3.1.7 4.2 1.8L13 11h8V3l-2.8 2.8A8 8 0 0 0 12 4z',
    ),
  },
  {
    to: '/add',
    label: 'Add',
    end: false,
    icon: icon(
      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4z',
    ),
  },
  {
    to: '/stats',
    label: 'Stats',
    end: false,
    icon: icon('M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z'),
  },
  {
    to: '/settings',
    label: 'Settings',
    end: false,
    icon: icon(
      'M19.4 13a7.7 7.7 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3.3h-4L10.7 6a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.7 7.7 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.3 2.7h4l.3-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z',
    ),
  },
];

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab">
          {tab.icon}
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
