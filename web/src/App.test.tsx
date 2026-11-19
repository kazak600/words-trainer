import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { setUnauthorizedHandler } from './api/client';
import { appRoutes, mockApi } from './test/mockApi';

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const loggedOut = {
  'GET /api/me': () => ({ status: 401, body: { error: 'unauthorized' } }),
};
const loggedIn = appRoutes();

async function fillAndSubmit(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('auth guard', () => {
  it('sends a visitor without a session to the login page', async () => {
    mockApi(loggedOut);

    renderApp('/');

    expect(
      await screen.findByRole('button', { name: 'Log in' }),
    ).toBeInTheDocument();
  });

  it('shows Home right away when the session is still valid (a reload keeps the session)', async () => {
    mockApi(loggedIn);

    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Topics' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Log in' }),
    ).not.toBeInTheDocument();
  });

  it('shows nothing from the app while the session is being checked', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));

    renderApp('/');

    expect(
      screen.queryByRole('button', { name: 'Log in' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Topics' }),
    ).not.toBeInTheDocument();
  });

  it('keeps a logged-in user off the login page', async () => {
    mockApi(loggedIn);

    renderApp('/login');

    expect(
      await screen.findByRole('heading', { name: 'Topics' }),
    ).toBeInTheDocument();
  });
});

describe('unreachable server', () => {
  it('offers a retry instead of the login page when the network fails, then recovers', async () => {
    let up = false;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (!up) throw new TypeError('network down');
      const url = String(input);
      const body =
        url === '/api/me'
          ? { username: 'anton' }
          : url === '/api/decks'
            ? [
                {
                  slug: 'lv-uk',
                  sourceLang: 'lv',
                  targetLang: 'uk',
                  title: 'Latvian → Ukrainian',
                },
              ]
            : url.includes('/review')
              ? { due: 0, newToday: 0, newCap: 15, cards: [] }
              : [];
      return new Response(JSON.stringify(body), { status: 200 });
    });
    renderApp('/');
    const user = userEvent.setup();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'reach the server',
    );
    up = true;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('heading', { name: 'Topics' }),
    ).toBeInTheDocument();
  });
});

describe('login', () => {
  it('logs in and lands on the empty Home page', async () => {
    let sessionActive = false;
    const { calls } = mockApi({
      ...appRoutes(),
      'GET /api/me': () =>
        sessionActive
          ? { body: { username: 'anton' } }
          : { status: 401, body: { error: 'unauthorized' } },
      'POST /api/login': ({ body }) => {
        expect(body).toEqual({ username: 'anton', password: 'secret' });
        sessionActive = true;
        return { body: { username: 'anton' } };
      },
    });
    renderApp('/');

    await fillAndSubmit('anton', 'secret');

    expect(
      await screen.findByRole('heading', { name: 'Topics' }),
    ).toBeInTheDocument();
    expect(calls).toContain('POST /api/login');
  });

  it('shows an error and stays on the form for a wrong password', async () => {
    mockApi({
      ...loggedOut,
      'POST /api/login': () => ({
        status: 401,
        body: { error: 'invalid credentials' },
      }),
    });
    renderApp('/');

    await fillAndSubmit('anton', 'nope');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Wrong username or password',
    );
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('shows a rate-limit message on 429', async () => {
    mockApi({
      ...loggedOut,
      'POST /api/login': () => ({ status: 429, body: { error: 'too many' } }),
    });
    renderApp('/');

    await fillAndSubmit('anton', 'nope');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts',
    );
  });

  it('configures the form for phone keyboards and password managers', async () => {
    mockApi(loggedOut);
    renderApp('/');

    const username = await screen.findByLabelText('Username');
    const password = screen.getByLabelText('Password');

    expect(username).toHaveAttribute('autocomplete', 'username');
    expect(username).toHaveAttribute('autocapitalize', 'none');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('type', 'password');
  });
});

describe('logout and expired sessions', () => {
  it('logs out from Settings and returns to the login page', async () => {
    mockApi({
      ...loggedIn,
      'POST /api/logout': () => ({ body: { ok: true } }),
    });
    renderApp('/settings');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(
      await screen.findByRole('button', { name: 'Log in' }),
    ).toBeInTheDocument();
  });

  it('returns to login when the API answers 401 later (session expired)', async () => {
    const { fetchMock } = mockApi({
      ...loggedIn,
    });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Topics' });

    const { api } = await import('./api/client');
    mockApi({
      'GET /api/anything': () => ({
        status: 401,
        body: { error: 'unauthorized' },
      }),
    });
    await api('/api/anything').catch(() => {});

    expect(
      await screen.findByRole('button', { name: 'Log in' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('tab bar', () => {
  const tabs = ['Home', 'Review', 'Add', 'Stats', 'Settings'];

  it('shows the five tabs and marks the current one', async () => {
    mockApi(loggedIn);
    renderApp('/');

    const nav = await screen.findByRole('navigation', { name: 'Main' });

    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(tabs);
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(nav).getByRole('link', { name: 'Settings' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('is not shown on the login page', async () => {
    mockApi(loggedOut);
    renderApp('/');

    await screen.findByRole('button', { name: 'Log in' });

    expect(
      screen.queryByRole('navigation', { name: 'Main' }),
    ).not.toBeInTheDocument();
  });

  it('is not shown during a session', async () => {
    mockApi(
      appRoutes({
        'GET /api/decks/lv-uk/sessions/current': () => ({
          body: {
            id: 's1',
            topicId: 1,
            total: 2,
            index: 0,
            card: {
              index: 0,
              kind: 'recognition',
              retry: false,
              wordId: 1,
              pos: 'noun',
              translation: 'хліб',
              lemma: 'maize',
            },
          },
        }),
      }),
    );
    renderApp('/session');

    await screen.findByText('maize');

    expect(
      screen.queryByRole('navigation', { name: 'Main' }),
    ).not.toBeInTheDocument();
  });

  it('navigates between pages, with Add and Stats as placeholders', async () => {
    mockApi(loggedIn);
    renderApp('/');
    const user = userEvent.setup();
    const nav = await screen.findByRole('navigation', { name: 'Main' });

    await user.click(within(nav).getByRole('link', { name: 'Add' }));
    expect(
      await screen.findByRole('heading', { name: 'Add' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();

    await user.click(within(nav).getByRole('link', { name: 'Stats' }));
    expect(
      await screen.findByRole('heading', { name: 'Stats' }),
    ).toBeInTheDocument();

    await user.click(within(nav).getByRole('link', { name: 'Review' }));
    expect(
      await screen.findByRole('heading', { name: 'Review' }),
    ).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('lists the decks with the current one selected and switches the deck', async () => {
    mockApi(
      appRoutes({
        'GET /api/decks': () => ({
          body: [
            {
              slug: 'lv-uk',
              sourceLang: 'lv',
              targetLang: 'uk',
              title: 'Latvian → Ukrainian',
            },
            {
              slug: 'en-uk',
              sourceLang: 'en',
              targetLang: 'uk',
              title: 'English → Ukrainian',
            },
          ],
        }),
      }),
    );
    localStorage.clear();
    renderApp('/settings');
    const user = userEvent.setup();

    const latvian = await screen.findByRole('button', {
      name: 'Latvian → Ukrainian',
    });
    expect(latvian).toHaveAttribute('aria-pressed', 'true');
    const english = screen.getByRole('button', { name: 'English → Ukrainian' });
    expect(english).toHaveAttribute('aria-pressed', 'false');

    await user.click(english);

    expect(english).toHaveAttribute('aria-pressed', 'true');
    expect(latvian).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('deck')).toBe('en-uk');
    localStorage.clear();
  });
});
