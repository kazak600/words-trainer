import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { loginCookie } from './helpers/auth';
import { createTestD1, seedCard, seedWord, type TestD1 } from './helpers/d1';

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
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    env,
  );
}

const topicId = async (slug: string) =>
  (await t.db
    .prepare("SELECT id FROM topics WHERE lang = 'lv' AND slug = ?")
    .bind(slug)
    .first<{ id: number }>())!.id;

async function add(body: Record<string, unknown>) {
  return call('/api/decks/lv-uk/words', {
    method: 'POST',
    body: {
      lemma: 'maize',
      translation: 'хліб',
      pos: 'noun',
      topicId: await topicId('home'),
      ...body,
    },
  });
}

const count = async (table: string) =>
  (await t.db
    .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .first<{ n: number }>())!.n;

const sentence = {
  textWithGap: 'Es ēdu ___.',
  answer: 'maizi',
  hint: 'Я їм хліб.',
};

describe('POST /api/decks/:deck/words', () => {
  it('adds an approved manual word that shows in its topic and in a session as a new word', async () => {
    const res = await add({});

    expect(res.status).toBe(201);
    const { wordId } = (await res.json()) as { wordId: number };
    const row = await t.db
      .prepare(
        'SELECT w.source, w.level, w.lang, tr.text, tr.review_status, tr.target_lang FROM words w JOIN translations tr ON tr.word_id = w.id WHERE w.id = ?',
      )
      .bind(wordId)
      .first();
    expect(row).toEqual({
      source: 'manual',
      level: 'A2',
      lang: 'lv',
      text: 'хліб',
      review_status: 'approved',
      target_lang: 'uk',
    });

    const words = (await (
      await call(`/api/decks/lv-uk/topics/${await topicId('home')}/words`)
    ).json()) as { lemma: string; translation: string }[];
    expect(words).toMatchObject([{ lemma: 'maize', translation: 'хліб' }]);
    const session = await call('/api/decks/lv-uk/sessions', {
      method: 'POST',
      body: { topicId: await topicId('home') },
    });
    expect(await session.json()).toMatchObject({
      total: 1,
      card: { kind: 'recognition', lemma: 'maize' },
    });
  });

  it('trims the text and keeps an explicit level', async () => {
    await add({ lemma: '  skola ', translation: ' школа ', level: 'B1' });

    expect(
      await t.db.prepare('SELECT lemma, level FROM words').first(),
    ).toEqual({ lemma: 'skola', level: 'B1' });
    expect(
      (await t.db
        .prepare('SELECT text FROM translations')
        .first<{ text: string }>())!.text,
    ).toBe('школа');
  });

  it('stores an optional sentence as an approved manual sentence', async () => {
    await add({ sentence });

    expect(
      await t.db
        .prepare(
          'SELECT text_with_gap, answer, hint, hint_target_lang, review_status, source FROM sentences',
        )
        .first(),
    ).toEqual({
      text_with_gap: 'Es ēdu ___.',
      answer: 'maizi',
      hint: 'Я їм хліб.',
      hint_target_lang: 'uk',
      review_status: 'approved',
      source: 'manual',
    });
  });

  it('treats a decomposed letter like the composed one when looking for duplicates', async () => {
    await add({ lemma: 'ma\u0304ja' });

    expect((await add({ lemma: 'm\u0101ja' })).status).toBe(409);
    expect(await t.db.prepare('SELECT lemma FROM words').first()).toEqual({
      lemma: 'm\u0101ja',
    });
  });

  it('rejects a duplicate lemma and part of speech, ignoring spaces and case, but allows another part of speech', async () => {
    await add({});

    expect((await add({ lemma: ' Maize ' })).status).toBe(409);
    expect(await (await add({ lemma: 'MAIZE' })).json()).toEqual({
      error: 'duplicate_word',
    });
    expect((await add({ pos: 'verb' })).status).toBe(201);
    expect(await count('words')).toBe(2);
  });

  it('detects a duplicate of a dataset word with a capital letter', async () => {
    await seedWord(t.db, {
      lemma: 'Rīga',
      pos: 'propn',
      topic: 'home',
      level: 'A1',
    });

    expect((await add({ lemma: 'rīga', pos: 'propn' })).status).toBe(409);
  });

  it.each([
    ['an empty lemma', { lemma: '  ' }],
    ['an empty translation', { translation: '' }],
    ['an unknown part of speech', { pos: 'thing' }],
    ['an unknown level', { level: 'C3' }],
    ['a 101-character lemma', { lemma: 'a'.repeat(101) }],
    ['a non-string lemma', { lemma: 5 }],
    [
      'a sentence without a gap',
      { sentence: { ...sentence, textWithGap: 'Es ēdu.' } },
    ],
    [
      'a sentence with two gaps',
      { sentence: { ...sentence, textWithGap: '___ un ___' } },
    ],
    [
      'a sentence without an answer',
      { sentence: { ...sentence, answer: ' ' } },
    ],
    ['a sentence without a hint', { sentence: { ...sentence, hint: '' } }],
    [
      'a 101-character sentence answer',
      { sentence: { ...sentence, answer: 'a'.repeat(101) } },
    ],
  ])('rejects %s and writes nothing', async (_name, patch) => {
    const res = await add(patch);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_word' });
    expect(await count('words')).toBe(0);
    expect(await count('translations')).toBe(0);
    expect(await count('sentences')).toBe(0);
  });

  it('answers 404 for a topic that does not exist or belongs to another language', async () => {
    const english = (await t.db
      .prepare("SELECT id FROM topics WHERE lang = 'en' AND slug = 'work-and-careers'")
      .first<{ id: number }>())!.id;

    expect((await add({ topicId: 99_999 })).status).toBe(404);
    expect(await (await add({ topicId: english })).json()).toEqual({
      error: 'topic_not_found',
    });
    expect((await add({ topicId: 'home' })).status).toBe(400);
    expect(await count('words')).toBe(0);
  });

  it('answers 404 for an unknown deck, 400 for a bad body and 401 without a login', async () => {
    expect(
      (await call('/api/decks/nope/words', { method: 'POST', body: {} }))
        .status,
    ).toBe(404);
    expect(
      (await call('/api/decks/lv-uk/words', { method: 'POST', body: 'x' }))
        .status,
    ).toBe(400);
    expect(
      (
        await call('/api/decks/lv-uk/words', {
          method: 'POST',
          body: {},
          cookie: null,
        })
      ).status,
    ).toBe(401);
  });
});

describe('GET /api/decks/:deck/topic-options', () => {
  it('lists every topic of the deck language, including empty ones', async () => {
    const res = await call('/api/decks/lv-uk/topic-options');
    const options = (await res.json()) as {
      id: number;
      slug: string;
      title: string;
      titleUk: string;
    }[];

    expect(res.status).toBe(200);
    expect(options.length).toBeGreaterThan(20);
    expect(options.map((o) => o.slug)).toContain('home');
    expect(options[0]).toEqual({
      id: expect.any(Number),
      slug: expect.any(String),
      title: expect.any(String),
      titleUk: expect.any(String),
    });
    expect(options.map((o) => o.id)).toEqual(
      [...options.map((o) => o.id)].sort((a, b) => a - b),
    );
  });

  it('requires a login', async () => {
    expect(
      (await call('/api/decks/lv-uk/topic-options', { cookie: null })).status,
    ).toBe(401);
  });
});

describe('POST /api/decks/:deck/words/:wordId/sentences', () => {
  const addSentence = (
    wordId: number | string,
    body: unknown,
    c?: string | null,
  ) =>
    call(`/api/decks/lv-uk/words/${wordId}/sentences`, {
      method: 'POST',
      body,
      cookie: c,
    });

  it('adds a manual approved sentence to an existing word', async () => {
    const id = await seedWord(t.db, {
      lemma: 'maize',
      topic: 'home',
      level: 'A1',
    });

    const res = await addSentence(id, sentence);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ sentenceId: expect.any(Number) });
    expect(
      await t.db
        .prepare(
          'SELECT source, review_status FROM sentences WHERE word_id = ?',
        )
        .bind(id)
        .first(),
    ).toEqual({
      source: 'manual',
      review_status: 'approved',
    });
  });

  it('gives the word a cloze card for the new sentence when its production answer passes', async () => {
    const id = await seedWord(t.db, {
      lemma: 'maize',
      topic: 'home',
      level: 'A1',
    });
    await seedCard(t.db, {
      userId,
      wordId: id,
      kind: 'production',
      dueAt: 1,
      state: 2,
      stability: 5,
      reps: 3,
    });
    const { sentenceId } = (await (await addSentence(id, sentence)).json()) as {
      sentenceId: number;
    };
    const session = (await (
      await call('/api/decks/lv-uk/sessions', {
        method: 'POST',
        body: { review: true },
      })
    ).json()) as { id: string };

    await call(`/api/sessions/${session.id}/answer`, {
      method: 'POST',
      body: { cardIndex: 0, typed: 'maize' },
    });

    const row = await t.db
      .prepare("SELECT sentence_id FROM cards WHERE kind = 'cloze'")
      .first();
    expect(row).toEqual({ sentence_id: sentenceId });
  });

  it('validates the sentence and the word', async () => {
    const id = await seedWord(t.db, {
      lemma: 'maize',
      topic: 'home',
      level: 'A1',
    });
    const foreign = await t.db
      .prepare(
        "INSERT INTO words (lang, lemma, pos, topic_id, level) VALUES ('en', 'bread', 'noun', (SELECT id FROM topics LIMIT 1), 'A1') RETURNING id",
      )
      .first<{ id: number }>();

    expect(
      (await addSentence(id, { ...sentence, textWithGap: 'no gap' })).status,
    ).toBe(400);
    expect((await addSentence(id, 'x')).status).toBe(400);
    expect((await addSentence(99_999, sentence)).status).toBe(404);
    expect((await addSentence(foreign!.id, sentence)).status).toBe(404);
    expect((await addSentence('abc', sentence)).status).toBe(404);
    expect(await count('sentences')).toBe(0);
  });

  it('requires a login', async () => {
    expect((await addSentence(1, sentence, null)).status).toBe(401);
  });
});
