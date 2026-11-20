import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { loginCookie } from './helpers/auth';
import { createTestD1, seedWord, type TestD1 } from './helpers/d1';

let t: TestD1;
let env: { DB: D1Database };
let cookie: string;

beforeEach(async () => {
  t = await createTestD1();
  env = { DB: t.db };
  cookie = await loginCookie(env);
});

afterEach(async () => {
  await t.dispose();
});

type Card = {
  index: number;
  kind: string;
  wordId: number;
  translation: string;
  lemma?: string;
  forms?: unknown;
};
type Session = { id: string; total: number; index: number; card: Card };
type Reply = {
  correct: boolean;
  verdict?: string;
  expected: string;
  finished: boolean;
  canRaise: boolean;
  next: Card | null;
};

const call = (path: string, method = 'GET', body?: unknown) =>
  app.request(
    path,
    {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );

async function start(learn: boolean): Promise<Session> {
  const topic = await t.db
    .prepare("SELECT id FROM topics WHERE lang = 'lv' AND slug = 'home'")
    .first<{ id: number }>();
  const res = await call('/api/decks/lv-uk/sessions', 'POST', {
    topicId: topic!.id,
    ...(learn ? { learn: true } : {}),
  });
  return (await res.json()) as Session;
}

const answer = async (s: Session, cardIndex: number, input: object) => {
  const res = await call(`/api/sessions/${s.id}/answer`, 'POST', {
    cardIndex,
    ...input,
  });
  return { res, body: (await res.json()) as Reply };
};

async function seedTwo() {
  const forms = { singular: { nominative: 'maize' } };
  await seedWord(t.db, { lemma: 'maize', topic: 'home', level: 'A1', forms });
  await seedWord(t.db, { lemma: 'ūdens', topic: 'home', level: 'A1' });
}

const rows = async (table: string) =>
  (await t.db
    .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .first<{ n: number }>())!.n;

describe('learn mode on a topic session', () => {
  it('teaches each new word, then asks it back, before the recognition round', async () => {
    await seedTwo();

    const s = await start(true);

    expect(s.total).toBe(6);
    expect(s.card).toMatchObject({
      kind: 'intro',
      lemma: 'maize',
      translation: 'uk-maize',
      forms: { singular: { nominative: 'maize' } },
    });
    const kinds: string[] = [];
    let card: Card | null = s.card;
    while (card) {
      kinds.push(card.kind);
      const input: object =
        card.kind === 'practice'
          ? { typed: card.translation === 'uk-maize' ? 'maize' : 'ūdens' }
          : { grade: 'good' };
      card = (await answer(s, card.index, input)).body.next;
    }
    expect(kinds).toEqual([
      'intro',
      'practice',
      'intro',
      'practice',
      'recognition',
      'recognition',
    ]);
  });

  it('keeps the old session shape when learn is not asked for', async () => {
    await seedTwo();

    const s = await start(false);

    expect(s.total).toBe(2);
    expect(s.card.kind).toBe('recognition');
  });

  it('writes no card, no log row and no cap use for the learning steps', async () => {
    await seedTwo();
    const s = await start(true);

    await answer(s, 0, { grade: 'good' });
    await answer(s, 1, { typed: 'maize' });

    expect(await rows('cards')).toBe(0);
    expect(await rows('review_log')).toBe(0);
  });

  it('makes the user retype a wrong practice answer, with the correction', async () => {
    await seedTwo();
    const s = await start(true);
    await answer(s, 0, { grade: 'good' });

    const wrong = await answer(s, 1, { typed: 'ūdens' });

    expect(wrong.body).toMatchObject({
      correct: false,
      expected: 'maize',
      canRaise: false,
      finished: false,
    });
    expect(wrong.body.next).toMatchObject({
      kind: 'practice',
      translation: 'uk-maize',
      index: 2,
    });

    const right = await answer(s, 2, { typed: 'maize' });
    expect(right.body.correct).toBe(true);
    expect(right.body.next).toMatchObject({ kind: 'intro', index: 3 });
  });

  it('lets a typo through but still shows the correction', async () => {
    await seedTwo();
    const s = await start(true);
    await answer(s, 0, { grade: 'good' });

    const { body } = await answer(s, 1, { typed: 'maze' });

    expect(body).toMatchObject({ correct: true, verdict: 'typo' });
    expect(body.next).toMatchObject({ kind: 'intro', index: 2 });
  });

  it('summarises only the scored cards, not the learning steps or retries', async () => {
    await seedTwo();
    const s = await start(true);
    await answer(s, 0, { grade: 'good' });
    await answer(s, 1, { typed: 'ūdens' });
    const steps: object[] = [
      { typed: 'maize' },
      { grade: 'good' },
      { typed: 'ūdens' },
      { grade: 'good' },
    ];
    for (const [i, input] of steps.entries()) await answer(s, i + 2, input);

    const done = await answer(s, 6, { grade: 'good' });

    expect(done.body).toMatchObject({
      finished: true,
      summary: { cards: 2, correct: 2, wrong: 0 },
    });
  });

  it('rejects a practice answer that is not text', async () => {
    await seedTwo();
    const s = await start(true);
    await answer(s, 0, { grade: 'good' });

    expect((await answer(s, 1, { grade: 'good' })).res.status).toBe(400);
  });

  it('schedules the recognition cards as before, once the round is reached', async () => {
    await seedTwo();
    const s = await start(true);
    for (const [i, input] of [
      { grade: 'good' },
      { typed: 'maize' },
      { grade: 'good' },
      { typed: 'ūdens' },
    ].entries())
      await answer(s, i, input);

    await answer(s, 4, { grade: 'good' });

    const kinds = await t.db
      .prepare('SELECT kind FROM cards ORDER BY kind')
      .all<{ kind: string }>();
    expect(kinds.results.map((r) => r.kind)).toEqual([
      'production',
      'recognition',
    ]);
    expect(await rows('review_log')).toBe(1);
  });
});
