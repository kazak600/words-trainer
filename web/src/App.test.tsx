import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { setUnauthorizedHandler } from './api/client';
import { mockApi } from './test/mockApi';

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
const loggedIn = { 'GET /api/me': () => ({ body: { username: 'anton' } }) };

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
      const body = String(input) === '/api/me' ? { username: 'anton' } : [];
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
  it('logs out and returns to the login page', async () => {
    mockApi({
      ...loggedIn,
      'POST /api/logout': () => ({ body: { ok: true } }),
    });
    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(
      await screen.findByRole('button', { name: 'Log in' }),
    ).toBeInTheDocument();
  });

  it('returns to login when the API answers 401 later (session expired)', async () => {
    const { fetchMock } = mockApi({
      ...loggedIn,
      'GET /api/decks': () => ({
        status: 401,
        body: { error: 'unauthorized' },
      }),
    });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Topics' });

    const { api } = await import('./api/client');
    await api('/api/decks').catch(() => {});

    expect(
      await screen.findByRole('button', { name: 'Log in' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('layout', () => {
  it('shows the Wiktionary attribution on every page', async () => {
    mockApi(loggedOut);
    renderApp('/');

    await screen.findByRole('button', { name: 'Log in' });

    expect(screen.getByText(/Wiktionary/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CC BY-SA 4\.0/ })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    );
  });
});
