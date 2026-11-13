import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/mockApi';
import { api, ApiError, setUnauthorizedHandler } from './client';

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('sends JSON with the cookie and returns the parsed body', async () => {
    const { fetchMock } = mockApi({
      'POST /api/echo': ({ body }) => ({ body: { got: body } }),
    });

    const result = await api<{ got: unknown }>('/api/echo', {
      method: 'POST',
      body: { a: 1 },
    });

    expect(result).toEqual({ got: { a: 1 } });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['content-type']).toBe(
      'application/json',
    );
  });

  it('throws an ApiError with status and code on failure', async () => {
    mockApi({
      'GET /api/x': () => ({
        status: 409,
        body: { error: 'nothing_to_study' },
      }),
    });

    await expect(api('/api/x')).rejects.toMatchObject({
      status: 409,
      code: 'nothing_to_study',
    });
    await expect(api('/api/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('calls the unauthorized handler on a 401', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockApi({
      'GET /api/decks': () => ({
        status: 401,
        body: { error: 'unauthorized' },
      }),
    });

    await expect(api('/api/decks')).rejects.toMatchObject({ status: 401 });

    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not call the handler for a failed login, so the form can show the error', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockApi({
      'POST /api/login': () => ({
        status: 401,
        body: { error: 'invalid credentials' },
      }),
    });

    await expect(
      api('/api/login', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({ status: 401 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call the handler for other errors', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockApi({ 'GET /api/x': () => ({ status: 500 }) });

    await expect(api('/api/x')).rejects.toBeInstanceOf(ApiError);

    expect(handler).not.toHaveBeenCalled();
  });
});
