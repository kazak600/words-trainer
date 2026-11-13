import { vi } from 'vitest';

export type MockReply = { status?: number; body?: unknown };
export type MockHandler = (init: { body: unknown }) => MockReply;

// Stands in for the network: routes are keyed "METHOD /path".
export function mockApi(routes: Record<string, MockHandler>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(input)}`;
      calls.push(key);
      const handler = routes[key];
      const reply = handler
        ? handler({
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
          })
        : { status: 404, body: { error: 'not mocked' } };
      return new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
