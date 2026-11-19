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

export const lvDeck = {
  slug: 'lv-uk',
  sourceLang: 'lv',
  targetLang: 'uk',
  title: 'Latvian → Ukrainian',
};

export const emptyReview = {
  due: 0,
  newToday: 0,
  newCap: 15,
  leeches: 0,
  cards: [],
};

export const topicOptions = [
  { id: 1, slug: 'home', title: 'Home', titleUk: 'Дім' },
  { id: 2, slug: 'food-and-drink', title: 'Food and drink', titleUk: 'Їжа' },
];

// The calls every logged-in page makes; tests override or add routes.
export function appRoutes(
  extra: Record<string, MockHandler> = {},
): Record<string, MockHandler> {
  return {
    'GET /api/me': () => ({ body: { username: 'anton' } }),
    'GET /api/decks': () => ({ body: [lvDeck] }),
    'GET /api/decks/lv-uk/topics': () => ({ body: [] }),
    'GET /api/decks/lv-uk/review?tzOffset=0': () => ({ body: emptyReview }),
    'GET /api/decks/lv-uk/topic-options': () => ({ body: topicOptions }),
    ...extra,
  };
}
