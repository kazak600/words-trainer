import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { loginCookie } from './helpers/auth';
import {
  createTestD1,
  seedCard,
  seedReviewLog,
  seedUser,
  seedWord,
  type TestD1,
  type WordSeed,
} from './helpers/d1';

let t: TestD1;
let env: { DB: D1Database };
let cookie: string;
let userId: number;

beforeEach(async () => {
  t = await createTestD1();
  env = { DB: t.db };
  cookie = await loginCookie(env);
  userId = (await t.db.prepare('SELECT id FROM users').first<{ id: number }>())!
    .id;
});

afterEach(async () => {
  vi.useRealTimers();
  await t.dispose();
});

type CardView = {
  index: number;
  kind: 'recognition' | 'production';
  retry: boolean;
  wordId: number;
  translation: string;
  lemma?: string;
};
type SessionView = { id: string; total: number; index: number; card: CardView };
type AnswerView = {
  grade: string;
  verdict?: string;
  correct: boolean;
  expected: string;
  diff?: { kind: string }[];
  learned: boolean;
  canRaise: boolean;
  finished: boolean;
  next: CardView | null;
  summary?: { cards: number; correct: number; wrong: number };
};

async function topicId(slug: string): Promise<number> {
  return (await t.db
    .prepare('SELECT id FROM topics WHERE slug = ?')
    .bind(slug)
    .first<{ id: number }>())!.id;
}

function call(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string | null } = {},
) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (init.cookie !== null) headers.cookie = init.cookie ?? cookie;
  return app.request(
    path,
    {
      method: init.method ?? 'GET',
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    },
    env,
  );
}

async function start(
  body: object | null = null,
): Promise<{ res: Response; body: SessionView }> {
  const res = await call('/api/decks/lv-uk/sessions', {
    method: 'POST',
    body: body ?? { topicId: await topicId('home') },
  });
  return { res, body: (await res.json()) as SessionView };
}

async function answer(
  sessionId: string,
  cardIndex: number,
  input: object,
): Promise<{ res: Response; body: AnswerView }> {
  const res = await call(`/api/sessions/${sessionId}/answer`, {
    method: 'POST',
    body: { cardIndex, ...input },
  });
  return { res, body: (await res.json()) as AnswerView };
}

async function seedMany(
  count: number,
  overrides: Partial<WordSeed> = {},
  prefix = 'w',
): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(
      await seedWord(t.db, {
        lemma: `${prefix}${i}`,
        topic: 'home',
        level: 'A2',
        ...overrides,
      }),
    );
  }
  return ids;
}

async function payload(): Promise<{
  cards: { wordId: number; kind: string; retry: boolean }[];
}> {
  const row = await t.db
    .prepare('SELECT payload_json FROM session_state')
    .first<{ payload_json: string }>();
  return JSON.parse(row!.payload_json);
}

async function cardRow(wordId: number, kind: string) {
  return t.db
    .prepare('SELECT * FROM cards WHERE word_id = ? AND kind = ?')
    .bind(wordId, kind)
    .first<Record<string, number>>();
}

const iso = (s: string) => Math.floor(Date.parse(s) / 1000);

// A word whose first review happened at `at`, with a card so it no longer counts as new.
async function reviewedAt(at: number, lemma: string): Promise<number> {
  const id = await seedWord(t.db, {
    lemma,
    topic: 'food-and-drink',
    level: 'A1',
  });
  await seedCard(t.db, { userId, wordId: id, dueAt: at + 86_400 * 30 });
  await seedReviewLog(t.db, userId, id, at);
  return id;
}

describe('topic session', () => {
  it('builds up to 10 new words, easier levels first, as recognition cards', async () => {
    await seedMany(6, { level: 'A2' }, 'b');
    const a1 = await seedMany(6, { level: 'A1' }, 'a');

    const { res, body } = await start();

    expect(res.status).toBe(201);
    expect(body.total).toBe(10);
    expect(body.index).toBe(0);
    expect(body.card).toMatchObject({
      index: 0,
      kind: 'recognition',
      retry: false,
      wordId: a1[0],
      lemma: 'a0',
    });
    const cards = (await payload()).cards;
    expect(cards.slice(0, 6).map((c) => c.wordId)).toEqual(a1);
    expect(cards.every((c) => c.kind === 'recognition')).toBe(true);
  });

  it('returns fewer cards when the topic has fewer than 10 words', async () => {
    await seedMany(4);

    expect((await start()).body.total).toBe(4);
  });

  it('skips words that already have cards and words with a pending translation', async () => {
    const words = await seedMany(3);
    await seedMany(2, { status: 'pending' }, 'p');
    await seedCard(t.db, { userId, wordId: words[0]! });

    expect((await start()).body.total).toBe(2);
  });

  it('replaces an unfinished session', async () => {
    await seedMany(3);
    const first = (await start()).body;

    const second = (await start()).body;

    expect(second.id).not.toBe(first.id);
    expect(
      (await t.db
        .prepare('SELECT count(*) AS n FROM session_state')
        .first<{ n: number }>())!.n,
    ).toBe(1);
  });

  it('returns 409 when no word is new, 404 for an unknown deck or topic, 400 for a bad body', async () => {
    expect((await start()).res.status).toBe(409);
    const unknownDeck = await call('/api/decks/nope/sessions', {
      method: 'POST',
      body: { topicId: 1 },
    });
    expect(unknownDeck.status).toBe(404);
    expect((await start({ topicId: 99_999 })).res.status).toBe(404);
    expect((await start({ foo: 1 })).res.status).toBe(400);
    expect((await start({ topicId: 1, tzOffset: 'x' })).res.status).toBe(400);
  });

  it('requires a login', async () => {
    const res = await call('/api/decks/lv-uk/sessions', {
      method: 'POST',
      body: { topicId: 1 },
      cookie: null,
    });

    expect(res.status).toBe(401);
  });
});

describe('daily cap', () => {
  const NOON = iso('2026-03-10T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOON * 1000);
  });

  it('refuses a topic session once 15 new words were started today', async () => {
    await seedMany(5);
    for (let i = 0; i < 15; i++) await reviewedAt(NOON - 3600, `r${i}`);

    const { res, body } = await start();

    expect(res.status).toBe(409);
    expect(body).toEqual({ error: 'daily_cap_reached' });
  });

  it('shrinks the session to the remaining cap', async () => {
    await seedMany(12);
    for (let i = 0; i < 10; i++) await reviewedAt(NOON - 3600, `r${i}`);

    expect((await start()).body.total).toBe(5);
  });

  it('says nothing_to_study, not cap reached, when the topic has no new words', async () => {
    for (let i = 0; i < 15; i++) await reviewedAt(NOON - 3600, `r${i}`);

    expect((await start()).body).toEqual({ error: 'nothing_to_study' });
  });

  it('does not count first reviews from before the local day', async () => {
    await seedMany(12);
    for (let i = 0; i < 15; i++) await reviewedAt(NOON - 86_400, `r${i}`);

    expect((await start()).body.total).toBe(10);
  });

  it('uses the local day: 00:10 local no longer sees 23:30 local of the day before', async () => {
    vi.setSystemTime(iso('2026-03-09T22:10:00Z') * 1000); // 00:10 at +02:00
    await seedMany(12);
    for (let i = 0; i < 15; i++)
      await reviewedAt(iso('2026-03-09T21:30:00Z'), `r${i}`); // 23:30 yesterday

    const { body } = await start({
      topicId: await topicId('home'),
      tzOffset: 120,
    });

    expect(body.total).toBe(10);
  });

  it('uses a negative offset the same way', async () => {
    vi.setSystemTime(iso('2026-03-10T03:00:00Z') * 1000); // 22:00 on 9 March at -05:00
    await seedMany(12);
    for (let i = 0; i < 4; i++)
      await reviewedAt(iso('2026-03-10T01:00:00Z'), `in${i}`); // 20:00 local, today
    for (let i = 0; i < 15; i++)
      await reviewedAt(iso('2026-03-09T04:59:00Z'), `out${i}`); // 23:59 local, yesterday

    const { body } = await start({
      topicId: await topicId('home'),
      tzOffset: -300,
    });

    expect(body.total).toBe(10);
  });

  it('counts a word reviewed yesterday and again today only yesterday', async () => {
    await seedMany(12);
    for (let i = 0; i < 15; i++) {
      const id = await reviewedAt(NOON - 86_400, `r${i}`);
      await seedReviewLog(t.db, userId, id, NOON - 60);
    }

    expect((await start()).body.total).toBe(10);
  });
});

describe('review session', () => {
  it('mixes due cards of two topics, oldest due first, skipping suspended and future ones', async () => {
    const [home] = await seedMany(1);
    const food = await seedWord(t.db, {
      lemma: 'f',
      topic: 'food-and-drink',
      level: 'A1',
    });
    const late = await seedWord(t.db, {
      lemma: 'l',
      topic: 'home',
      level: 'A1',
    });
    const off = await seedWord(t.db, {
      lemma: 'o',
      topic: 'home',
      level: 'A1',
    });
    const future = await seedWord(t.db, {
      lemma: 'u',
      topic: 'home',
      level: 'A1',
    });
    await seedCard(t.db, { userId, wordId: home!, dueAt: 200 });
    await seedCard(t.db, { userId, wordId: food, dueAt: 100 });
    await seedCard(t.db, { userId, wordId: late, dueAt: 300 });
    await seedCard(t.db, { userId, wordId: off, dueAt: 50, suspended: true });
    await seedCard(t.db, { userId, wordId: future, dueAt: 9_999_999_999 });

    const { res, body } = await start({ review: true });

    expect(res.status).toBe(201);
    expect(body.total).toBe(3);
    expect((await payload()).cards.map((c) => c.wordId)).toEqual([
      food,
      home,
      late,
    ]);
    expect(body.card.wordId).toBe(food);
  });

  it('shows a due production card without its answer', async () => {
    const [id] = await seedMany(1);
    await seedCard(t.db, { userId, wordId: id!, kind: 'production', dueAt: 1 });

    const { body } = await start({ review: true });

    expect(body.card).toMatchObject({ kind: 'production', wordId: id });
    expect(body.card.lemma).toBeUndefined();
    expect(body.card.translation).toBe('uk-w0');
  });

  it('serves only one card of a word when both are due, recognition first', async () => {
    const [id] = await seedMany(1);
    await seedCard(t.db, {
      userId,
      wordId: id!,
      kind: 'recognition',
      dueAt: 5,
    });
    await seedCard(t.db, { userId, wordId: id!, kind: 'production', dueAt: 5 });

    const { body } = await start({ review: true });

    expect(body.total).toBe(1);
    expect(body.card.kind).toBe('recognition');
  });

  it('returns 409 when nothing is due', async () => {
    await seedMany(2);

    expect((await start({ review: true })).res.status).toBe(409);
  });
});

describe('answering a recognition card', () => {
  it('schedules the card, creates the production card once, and logs the review', async () => {
    const [id] = await seedMany(1);
    const s = (await start()).body;

    const { res, body } = await answer(s.id, 0, { grade: 'good' });

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      grade: 'good',
      correct: true,
      expected: 'w0',
      canRaise: false,
      finished: true,
      next: null,
      summary: { cards: 1, correct: 1, wrong: 0 },
    });
    const rec = await cardRow(id!, 'recognition');
    const prod = await cardRow(id!, 'production');
    expect(rec!.state).not.toBe(0);
    expect(rec!.reps).toBe(1);
    expect(prod!.state).toBe(0);
    expect(prod!.due_at).toBeGreaterThanOrEqual(rec!.due_at!);
    expect(prod!.due_at! - Math.floor(Date.now() / 1000)).toBeGreaterThan(
      86_400 - 60,
    );
    const log = await t.db
      .prepare(
        'SELECT mode, kind, grade, correct, typed_answer FROM review_log',
      )
      .first();
    expect(log).toEqual({
      mode: 'flip',
      kind: 'recognition',
      grade: 3,
      correct: 1,
      typed_answer: null,
    });
    expect(
      await t.db.prepare('SELECT 1 FROM session_state').first(),
    ).toBeNull();
  });

  it('does not create a production card on again, and retries the card once', async () => {
    const [id] = await seedMany(1);
    const s = (await start()).body;

    const first = await answer(s.id, 0, { grade: 'again' });

    expect(first.body).toMatchObject({ correct: false, finished: false });
    expect(first.body.next).toMatchObject({
      kind: 'recognition',
      retry: true,
      wordId: id,
    });
    expect(await cardRow(id!, 'production')).toBeNull();

    const second = await answer(s.id, 1, { grade: 'again' });
    expect(second.body.finished).toBe(true);
    expect(second.body.summary).toMatchObject({ cards: 2, wrong: 2 });
  });

  it('keeps hard as a pass', async () => {
    await seedMany(1);
    const s = (await start()).body;

    const { body } = await answer(s.id, 0, { grade: 'hard' });

    expect(body).toMatchObject({
      grade: 'hard',
      correct: true,
      finished: true,
    });
  });

  it('leaves an existing production card alone', async () => {
    const [id] = await seedMany(1);
    await seedCard(t.db, { userId, wordId: id!, dueAt: 1, reps: 3 });
    await seedCard(t.db, {
      userId,
      wordId: id!,
      kind: 'production',
      dueAt: 9_999_999_999,
      reps: 5,
    });
    const s = (await start({ review: true })).body;

    await answer(s.id, 0, { grade: 'good' });

    expect(await cardRow(id!, 'production')).toMatchObject({
      reps: 5,
      due_at: 9_999_999_999,
    });
  });

  it('rejects a missing or unknown grade', async () => {
    await seedMany(1);
    const s = (await start()).body;

    expect((await answer(s.id, 0, {})).res.status).toBe(400);
    expect((await answer(s.id, 0, { grade: 'medium' })).res.status).toBe(400);
    expect((await answer(s.id, 0, { typed: 'w0' })).res.status).toBe(400);
  });
});

describe('answering a production card', () => {
  async function production(
    lemma: string,
    extra: { stability?: number; state?: number; reps?: number } = {},
  ) {
    const id = await seedWord(t.db, { lemma, topic: 'home', level: 'A1' });
    await seedCard(t.db, {
      userId,
      wordId: id,
      kind: 'production',
      dueAt: 1,
      ...extra,
    });
    return { id, s: (await start({ review: true })).body };
  }

  it('grades an exact answer Good and allows raising it', async () => {
    const { id, s } = await production('maize');

    const { body } = await answer(s.id, 0, { typed: ' Maize ' });

    expect(body).toMatchObject({
      verdict: 'exact',
      grade: 'good',
      correct: true,
      canRaise: true,
      expected: 'maize',
      finished: true,
    });
    const log = await t.db
      .prepare('SELECT mode, kind, grade, typed_answer FROM review_log')
      .first();
    expect(log).toEqual({
      mode: 'write',
      kind: 'production',
      grade: 3,
      typed_answer: ' Maize ',
    });
    expect((await cardRow(id, 'production'))!.reps).toBe(2);
  });

  it('passes a missing diacritic as a typo with Hard, shows the diff, and does not retry', async () => {
    const { s } = await production('maizē');

    const { body } = await answer(s.id, 0, { typed: 'maize' });

    expect(body).toMatchObject({
      verdict: 'typo',
      grade: 'hard',
      correct: true,
      canRaise: false,
      finished: true,
    });
    expect(body.diff!.map((d) => d.kind)).toContain('diacritic');
  });

  it('fails a far miss with Again and queues one retry', async () => {
    const { s } = await production('maize');

    const { body } = await answer(s.id, 0, { typed: 'xxxxx' });

    expect(body).toMatchObject({
      verdict: 'wrong',
      grade: 'again',
      correct: false,
      finished: false,
    });
    expect(body.next).toMatchObject({ kind: 'production', retry: true });
  });

  it('reports a word as learned when the production card is stable enough', async () => {
    const { s } = await production('maize', {
      state: 2,
      stability: 40,
      reps: 5,
    });

    expect((await answer(s.id, 0, { typed: 'maize' })).body.learned).toBe(true);
  });

  it('does not report learned for a young card', async () => {
    const { s } = await production('maize', {
      state: 2,
      stability: 2,
      reps: 2,
    });

    expect((await answer(s.id, 0, { typed: 'maize' })).body.learned).toBe(
      false,
    );
  });

  it('rejects an absurdly long typed answer', async () => {
    const { s } = await production('maize');

    expect((await answer(s.id, 0, { typed: 'a'.repeat(101) })).res.status).toBe(
      400,
    );
  });

  it('rejects a missing typed answer', async () => {
    const { s } = await production('maize');

    expect((await answer(s.id, 0, {})).res.status).toBe(400);
    expect((await answer(s.id, 0, { grade: 'good' })).res.status).toBe(400);
  });
});

describe('session flow', () => {
  it('returns 409 for a stale card index and 404 for an unknown session', async () => {
    await seedMany(3);
    const s = (await start()).body;

    expect((await answer(s.id, 2, { grade: 'good' })).res.status).toBe(409);
    expect((await answer('nope', 0, { grade: 'good' })).res.status).toBe(404);
  });

  it('resumes the unfinished session where it stopped', async () => {
    const words = await seedMany(3);
    const s = (await start()).body;
    await answer(s.id, 0, { grade: 'good' });

    const res = await call('/api/decks/lv-uk/sessions/current');
    const current = (await res.json()) as SessionView;

    expect(res.status).toBe(200);
    expect(current).toMatchObject({ id: s.id, total: 3, index: 1 });
    expect(current.card.wordId).toBe(words[1]);
  });

  it('has no current session before one is started or after it finishes', async () => {
    expect((await call('/api/decks/lv-uk/sessions/current')).status).toBe(404);
    await seedMany(1);
    const s = (await start()).body;
    await answer(s.id, 0, { grade: 'good' });

    expect((await call('/api/decks/lv-uk/sessions/current')).status).toBe(404);
  });

  it('ignores a session saved in the old stage format', async () => {
    const [id] = await seedMany(1);
    await t.db
      .prepare(
        'INSERT INTO session_state (user_id, deck_id, payload_json) VALUES (?, 1, ?)',
      )
      .bind(
        userId,
        JSON.stringify({
          id: 'old',
          topicId: 1,
          cards: [{ wordId: id, stage: 1, retry: false }],
          index: 0,
          correct: 0,
          wrong: 0,
        }),
      )
      .run();

    expect((await call('/api/decks/lv-uk/sessions/current')).status).toBe(404);
    expect((await answer('old', 0, { grade: 'good' })).res.status).toBe(404);
  });

  it('does not let another user answer or see a session', async () => {
    await seedMany(2);
    const s = (await start()).body;
    await seedUser(t.db, 'other', 'secret');
    const login = await app.request(
      '/api/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'other', password: 'secret' }),
      },
      env,
    );
    const otherCookie = `session=${login.headers.get('set-cookie')!.match(/^session=([^;]*)/)![1]}`;

    const res = await call(`/api/sessions/${s.id}/answer`, {
      method: 'POST',
      body: { cardIndex: 0, grade: 'good' },
      cookie: otherCookie,
    });

    expect(res.status).toBe(404);
  });
});

describe('raising an exact answer to Easy', () => {
  async function twoProductionCards() {
    const ids: number[] = [];
    for (const lemma of ['maize', 'ūdens']) {
      const id = await seedWord(t.db, { lemma, topic: 'home', level: 'A1' });
      await seedCard(t.db, {
        userId,
        wordId: id,
        kind: 'production',
        dueAt: ids.length + 1,
        state: 2,
        stability: 5,
        reps: 3,
      });
      ids.push(id);
    }
    return { ids, s: (await start({ review: true })).body };
  }
  const raise = (sessionId: string, cardIndex = 0) =>
    call(`/api/sessions/${sessionId}/easy`, {
      method: 'POST',
      body: { cardIndex },
    });
  const interval = async (wordId: number) =>
    (await cardRow(wordId, 'production'))!;

  it('replays the answer as Easy from the card state before it, and updates the log', async () => {
    const { ids, s } = await twoProductionCards();
    await answer(s.id, 0, { typed: 'maize' });
    const good = await interval(ids[0]!);

    const res = await raise(s.id);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ grade: 'easy', learned: false });
    const easy = await interval(ids[0]!);
    expect(easy.scheduled_days).toBeGreaterThan(good.scheduled_days!);
    expect(easy.reps).toBe(good.reps);
    const logs = await t.db
      .prepare('SELECT grade FROM review_log ORDER BY id')
      .all<{ grade: number }>();
    expect(logs.results).toEqual([{ grade: 4 }]);
  });

  it('works on the last card of a session and after a resume', async () => {
    const { s } = await twoProductionCards();
    await answer(s.id, 0, { typed: 'maize' });
    await call('/api/decks/lv-uk/sessions/current');
    expect((await raise(s.id)).status).toBe(200);

    await answer(s.id, 1, { typed: 'ūdens' });
    expect((await raise(s.id, 1)).status).toBe(200);
    expect(
      await t.db.prepare('SELECT 1 FROM session_state').first(),
    ).toBeNull();
  });

  it('is refused after a typo or a wrong answer', async () => {
    const { s } = await twoProductionCards();
    await answer(s.id, 0, { typed: 'maiz' });
    expect((await raise(s.id)).status).toBe(409);

    await answer(s.id, 1, { typed: 'xxxxx' });
    expect(await (await raise(s.id, 1)).json()).toEqual({
      error: 'not_raisable',
    });
  });

  it('is refused a second time', async () => {
    const { s } = await twoProductionCards();
    await answer(s.id, 0, { typed: 'maize' });

    expect((await raise(s.id)).status).toBe(200);
    expect((await raise(s.id)).status).toBe(409);
  });

  it('raises the card it names, not the latest one', async () => {
    const { ids, s } = await twoProductionCards();
    await answer(s.id, 0, { typed: 'maize' });
    await answer(s.id, 1, { typed: 'ūdens' });
    const second = await interval(ids[1]!);

    expect((await raise(s.id, 0)).status).toBe(409);
    expect((await interval(ids[1]!)).scheduled_days).toBe(
      second.scheduled_days,
    );
    expect((await raise(s.id, 1)).status).toBe(200);
  });

  it('requires the card index', async () => {
    const { s } = await twoProductionCards();
    await answer(s.id, 0, { typed: 'maize' });

    const res = await call(`/api/sessions/${s.id}/easy`, { method: 'POST' });

    expect(res.status).toBe(400);
  });

  it('is refused for the earlier card once the next one was answered', async () => {
    const { s } = await twoProductionCards();
    await answer(s.id, 0, { typed: 'maize' });
    await answer(s.id, 1, { typed: 'ūdenz' });

    expect((await raise(s.id)).status).toBe(404);
  });

  it('is refused for a recognition answer and for an unknown or foreign session', async () => {
    const [id] = await seedMany(1);
    await seedCard(t.db, { userId, wordId: id!, dueAt: 1 });
    const s = (await start({ review: true })).body;
    await answer(s.id, 0, { grade: 'easy' });

    expect((await raise(s.id)).status).toBe(404);
    expect((await raise('nope')).status).toBe(404);
  });
});
