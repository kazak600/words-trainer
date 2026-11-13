import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { loginCookie } from './helpers/auth';
import {
  createTestD1,
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
  await t.dispose();
});

type Card = {
  index: number;
  stage: number;
  mode: string;
  retry: boolean;
  wordId: number;
  translation: string;
  lemma?: string;
  options?: { wordId: number; lemma: string }[];
};
type SessionView = { id: string; total: number; index: number; card: Card };
type AnswerView = {
  correct: boolean;
  expected: string;
  diff?: { kind: string }[];
  learned: boolean;
  finished: boolean;
  next: Card | null;
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
  slug = 'home',
): Promise<{ res: Response; body: SessionView }> {
  const res = await call('/api/decks/lv-uk/sessions', {
    method: 'POST',
    body: { topicId: await topicId(slug) },
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

async function seedProgress(
  wordId: number,
  p: { stage?: number; dueAt?: number; reps?: number; learned?: number } = {},
) {
  await t.db
    .prepare(
      `INSERT INTO progress (user_id, deck_id, word_id, stage, due_at, reps, learned)
       VALUES (?, 1, ?, ?, ?, ?, ?)`,
    )
    .bind(
      userId,
      wordId,
      p.stage ?? 1,
      p.dueAt ?? 0,
      p.reps ?? 1,
      p.learned ?? 0,
    )
    .run();
}

const now = () => Math.floor(Date.now() / 1000);

describe('POST /api/decks/:deck/sessions', () => {
  it('builds a session of 10 words, easier levels first, starting with a flip card', async () => {
    await seedMany(6, { level: 'A2' }, 'b');
    const a1 = await seedMany(6, { level: 'A1' }, 'a');

    const { res, body } = await start();

    expect(res.status).toBe(201);
    expect(body.total).toBe(10);
    expect(body.index).toBe(0);
    expect(body.card).toMatchObject({
      index: 0,
      stage: 1,
      mode: 'flip',
      retry: false,
      wordId: a1[0],
      lemma: 'a0',
    });
    const rows = await t.db
      .prepare('SELECT payload_json FROM session_state')
      .all<{ payload_json: string }>();
    const cards = JSON.parse(rows.results[0]!.payload_json).cards as {
      wordId: number;
    }[];
    expect(cards.slice(0, 6).map((c) => c.wordId)).toEqual(a1);
  });

  it('returns fewer cards when the topic has fewer than 10 words', async () => {
    await seedMany(4);

    expect((await start()).body.total).toBe(4);
  });

  it('puts due reviews first, oldest due first, then new words', async () => {
    const words = await seedMany(5, { level: 'A2' });
    const newA1 = await seedWord(t.db, {
      lemma: 'fresh',
      topic: 'home',
      level: 'A1',
    });
    await seedProgress(words[3]!, { dueAt: now() - 100 });
    await seedProgress(words[1]!, { dueAt: now() - 5000 });
    await seedProgress(words[2]!, { dueAt: now() + 86_400 });

    await start();

    const rows = await t.db
      .prepare('SELECT payload_json FROM session_state')
      .all<{ payload_json: string }>();
    const order = (
      JSON.parse(rows.results[0]!.payload_json).cards as { wordId: number }[]
    ).map((c) => c.wordId);
    expect(order).toEqual([words[1], words[3], newA1, words[0], words[4]]);
  });

  it('shows a due word at its current stage', async () => {
    await seedMany(5);
    const [first] = await seedMany(1, {}, 'due');
    await seedProgress(first!, { stage: 3, dueAt: now() - 10 });

    const { body } = await start();

    expect(body.card).toMatchObject({ wordId: first, stage: 3, mode: 'write' });
    expect(body.card.lemma).toBeUndefined();
  });

  it('skips words with a pending translation', async () => {
    await seedMany(3);
    await seedMany(3, { status: 'pending' }, 'p');

    expect((await start()).body.total).toBe(3);
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

  it('returns 409 when nothing can be studied, 404 for an unknown deck, 400 for a bad body', async () => {
    expect((await start()).res.status).toBe(409);
    const unknownDeck = await call('/api/decks/nope/sessions', {
      method: 'POST',
      body: { topicId: 1 },
    });
    const badBody = await call('/api/decks/lv-uk/sessions', {
      method: 'POST',
      body: { topicId: 'x' },
    });
    const unknownTopic = await call('/api/decks/lv-uk/sessions', {
      method: 'POST',
      body: { topicId: 99999 },
    });

    expect(unknownDeck.status).toBe(404);
    expect(badBody.status).toBe(400);
    expect(unknownTopic.status).toBe(404);
  });

  it('requires login', async () => {
    const res = await call('/api/decks/lv-uk/sessions', {
      method: 'POST',
      body: { topicId: 1 },
      cookie: null,
    });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/sessions/:id/answer', () => {
  it('a full session of Good flip answers finishes and schedules every word', async () => {
    await seedMany(10);
    const session = (await start()).body;
    let last: AnswerView | undefined;

    for (let i = 0; i < 10; i++)
      last = (await answer(session.id, i, { result: 'good' })).body;

    expect(last).toMatchObject({
      finished: true,
      next: null,
      summary: { cards: 10, correct: 10, wrong: 0 },
    });
    const rows = await t.db
      .prepare(
        'SELECT stage, reps, interval_days, due_at, learned FROM progress',
      )
      .all<{
        stage: number;
        reps: number;
        interval_days: number;
        due_at: number;
        learned: number;
      }>();
    expect(rows.results).toHaveLength(10);
    for (const r of rows.results) {
      expect(r).toMatchObject({
        stage: 2,
        reps: 1,
        interval_days: 1,
        learned: 0,
      });
      expect(Math.abs(r.due_at - (now() + 86_400))).toBeLessThan(10);
    }
    expect(
      (await t.db
        .prepare('SELECT count(*) AS n FROM review_log WHERE mode = ?')
        .bind('flip')
        .first<{ n: number }>())!.n,
    ).toBe(10);
    expect(
      (await t.db
        .prepare('SELECT count(*) AS n FROM session_state')
        .first<{ n: number }>())!.n,
    ).toBe(0);
  });

  it('a wrong word comes back once more at the end, but only once', async () => {
    const ids = await seedMany(3);
    const session = (await start()).body;

    const first = (await answer(session.id, 0, { result: 'again' })).body;
    await answer(session.id, 1, { result: 'good' });
    await answer(session.id, 2, { result: 'good' });
    const view = (await (
      await call('/api/decks/lv-uk/sessions/current')
    ).json()) as SessionView;
    const second = (await answer(session.id, 3, { result: 'again' })).body;

    expect(first.finished).toBe(false);
    expect(view.total).toBe(4);
    expect(view.card).toMatchObject({
      index: 3,
      retry: true,
      wordId: ids[0],
      stage: 1,
    });
    expect(second).toMatchObject({
      finished: true,
      summary: { cards: 4, correct: 2, wrong: 2 },
    });
  });

  it('a multiple-choice card offers 4 options from the same topic and part of speech', async () => {
    const nouns = await seedMany(6);
    const verb = await seedWord(t.db, {
      lemma: 'iet',
      pos: 'verb',
      topic: 'home',
      level: 'A2',
    });
    await seedProgress(nouns[0]!, { stage: 2, dueAt: now() - 10 });

    const { body } = await start();

    expect(body.card).toMatchObject({
      stage: 2,
      mode: 'choice',
      wordId: nouns[0],
    });
    const options = body.card.options!;
    expect(options).toHaveLength(4);
    expect(options.map((o) => o.wordId)).toContain(nouns[0]);
    expect(options.map((o) => o.wordId)).not.toContain(verb);
    expect(new Set(options.map((o) => o.wordId)).size).toBe(4);
    expect(body.card.lemma).toBeUndefined();
  });

  it('falls back to the same part of speech in other topics when the topic has too few', async () => {
    const [target] = await seedMany(1);
    const other = await seedMany(5, { topic: 'animals' }, 'z');
    await seedProgress(target!, { stage: 2, dueAt: now() - 10 });

    const { body } = await start();

    const ids = body.card.options!.map((o) => o.wordId);
    expect(ids).toHaveLength(4);
    expect(ids).toContain(target);
    expect(
      ids.filter((id) => id !== target).every((id) => other.includes(id)),
    ).toBe(true);
  });

  it('checks a multiple-choice answer and reveals the right word when wrong', async () => {
    const nouns = await seedMany(6);
    await seedProgress(nouns[0]!, { stage: 2, dueAt: now() - 10 });
    const { body: session } = await start();
    const wrongId = session.card.options!.find(
      (o) => o.wordId !== nouns[0],
    )!.wordId;

    const wrong = (await answer(session.id, 0, { choiceWordId: wrongId })).body;

    expect(wrong).toMatchObject({ correct: false, expected: 'w0' });
    const progress = await t.db
      .prepare('SELECT stage, lapses FROM progress WHERE word_id = ?')
      .bind(nouns[0])
      .first();
    expect(progress).toMatchObject({ stage: 1 });
  });

  it('checks a typed answer strictly and returns the diff, moving the word back a stage', async () => {
    const [word] = await seedMany(1, { lemma: 'maizē' });
    await seedProgress(word!, { stage: 3, dueAt: now() - 10, reps: 3 });
    const { body: session } = await start();

    const typo = (await answer(session.id, 0, { typed: 'maize' })).body;
    const retry = (
      (await (
        await call('/api/decks/lv-uk/sessions/current')
      ).json()) as SessionView
    ).card;

    expect(typo.correct).toBe(false);
    expect(typo.diff!.map((d) => d.kind)).toEqual([
      'match',
      'match',
      'match',
      'match',
      'diacritic',
    ]);
    expect(retry).toMatchObject({ retry: true, stage: 2 });
  });

  it('typing the word correctly at the writing stage makes it learned', async () => {
    const [word] = await seedMany(1, { lemma: 'maizē' });
    await seedProgress(word!, { stage: 3, dueAt: now() - 10, reps: 3 });
    const { body: session } = await start();

    const ok = (await answer(session.id, 0, { typed: ' Maizē ' })).body;

    expect(ok).toMatchObject({ correct: true, learned: true, finished: true });
    const row = await t.db
      .prepare('SELECT learned, stage FROM progress WHERE word_id = ?')
      .bind(word)
      .first();
    expect(row).toMatchObject({ learned: 1, stage: 3 });
    const log = await t.db
      .prepare('SELECT mode, correct, typed_answer FROM review_log')
      .first();
    expect(log).toMatchObject({
      mode: 'write',
      correct: 1,
      typed_answer: ' Maizē ',
    });
  });

  it('rejects a stale card index, a wrong input type, and an unknown session', async () => {
    await seedMany(3);
    const { body: session } = await start();

    expect((await answer(session.id, 2, { result: 'good' })).res.status).toBe(
      409,
    );
    expect((await answer(session.id, 0, { typed: 'x' })).res.status).toBe(400);
    expect((await answer(session.id, 0, { result: 'maybe' })).res.status).toBe(
      400,
    );
    expect((await answer('nope', 0, { result: 'good' })).res.status).toBe(404);
  });

  it("does not let another user answer someone else's session", async () => {
    await seedMany(3);
    const { body: session } = await start();
    await seedUser(t.db, 'other', 'pw-other');
    const login = await app.request(
      '/api/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'other', password: 'pw-other' }),
      },
      env,
    );
    const otherCookie = `session=${login.headers.get('set-cookie')!.match(/^session=([^;]*)/)![1]}`;

    const res = await call(`/api/sessions/${session.id}/answer`, {
      method: 'POST',
      body: { cardIndex: 0, result: 'good' },
      cookie: otherCookie,
    });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/decks/:deck/sessions/current', () => {
  it('resumes an interrupted session at the same card with the same options', async () => {
    const nouns = await seedMany(8);
    for (const id of nouns)
      await seedProgress(id, { stage: 2, dueAt: now() - 10 });
    const { body: session } = await start();
    await answer(session.id, 0, { choiceWordId: session.card.wordId });
    await answer(session.id, 1, { choiceWordId: session.card.wordId });

    const res = await call('/api/decks/lv-uk/sessions/current');
    const resumed = (await res.json()) as SessionView;
    const again = (await (
      await call('/api/decks/lv-uk/sessions/current')
    ).json()) as SessionView;

    expect(res.status).toBe(200);
    expect(resumed.id).toBe(session.id);
    expect(resumed.index).toBe(2);
    expect(resumed.card.index).toBe(2);
    expect(again.card.options).toEqual(resumed.card.options);
  });

  it('returns 404 when there is no unfinished session or after finishing', async () => {
    await seedMany(1);
    expect((await call('/api/decks/lv-uk/sessions/current')).status).toBe(404);

    const { body: session } = await start();
    await answer(session.id, 0, { result: 'good' });

    expect((await call('/api/decks/lv-uk/sessions/current')).status).toBe(404);
  });
});
