import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { loginCookie } from './helpers/auth';
import {
  createTestD1,
  seedCard,
  seedSentence,
  seedUser,
  seedWord,
  type TestD1,
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

const word = (lemma: string) =>
  seedWord(t.db, { lemma, topic: 'home', level: 'A1' });
const leech = (
  wordId: number,
  extra: Parameters<typeof seedCard>[1] extends infer P
    ? Partial<P>
    : never = {},
) =>
  seedCard(t.db, {
    userId,
    wordId,
    leech: true,
    suspended: true,
    lapses: 5,
    ...extra,
  });

describe('GET /api/decks/:deck/leeches', () => {
  it('lists the user leech cards, most failed first, with notes and the cloze sentence', async () => {
    const a = await word('maize');
    const b = await word('piens');
    const sentenceId = await seedSentence(t.db, b, {
      gap: 'Es dzeru ___.',
      answer: 'pienu',
      hint: "Я п'ю молоко.",
    });
    const cardA = await leech(a, { lapses: 5 });
    const cardB = await leech(b, { kind: 'cloze', sentenceId, lapses: 8 });
    await t.db
      .prepare(
        "INSERT INTO word_notes (user_id, word_id, mnemonic, similar_word) VALUES (?, ?, 'bread', 'maiz')",
      )
      .bind(userId, a)
      .run();

    const res = await call('/api/decks/lv-uk/leeches');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        cardId: cardB,
        wordId: b,
        kind: 'cloze',
        lapses: 8,
        lemma: 'piens',
        pos: 'noun',
        translation: 'uk-piens',
        textWithGap: 'Es dzeru ___.',
        hint: "Я п'ю молоко.",
        mnemonic: '',
        similarWord: '',
      },
      {
        cardId: cardA,
        wordId: a,
        kind: 'recognition',
        lapses: 5,
        lemma: 'maize',
        pos: 'noun',
        translation: 'uk-maize',
        textWithGap: null,
        hint: null,
        mnemonic: 'bread',
        similarWord: 'maiz',
      },
    ]);
  });

  it('skips non-leeches and other users cards, and never shows their notes', async () => {
    const a = await word('maize');
    const b = await word('piens');
    const other = await seedUser(t.db, 'other', 'pw');
    await seedCard(t.db, { userId, wordId: await word('plain'), lapses: 2 });
    await seedCard(t.db, {
      userId: other,
      wordId: b,
      leech: true,
      suspended: true,
      lapses: 5,
    });
    await leech(a);
    await t.db
      .prepare(
        "INSERT INTO word_notes (user_id, word_id, mnemonic) VALUES (?, ?, 'theirs')",
      )
      .bind(other, a)
      .run();

    const items = (await (await call('/api/decks/lv-uk/leeches')).json()) as {
      wordId: number;
      mnemonic: string;
    }[];

    expect(items.map((i) => i.wordId)).toEqual([a]);
    expect(items[0]!.mnemonic).toBe('');
  });

  it('answers 404 for an unknown deck and 401 without a login', async () => {
    expect((await call('/api/decks/nope/leeches')).status).toBe(404);
    expect(
      (await call('/api/decks/lv-uk/leeches', { cookie: null })).status,
    ).toBe(401);
  });
});

describe('PUT /api/decks/:deck/words/:wordId/notes', () => {
  const put = (wordId: number, body: unknown) =>
    call(`/api/decks/lv-uk/words/${wordId}/notes`, { method: 'PUT', body });

  it('creates the note, then updates one field and keeps the other', async () => {
    const id = await word('maize');

    expect(
      await (
        await put(id, { mnemonic: 'maize = corn bread', similarWord: 'maiz' })
      ).json(),
    ).toEqual({
      mnemonic: 'maize = corn bread',
      similarWord: 'maiz',
    });
    expect(await (await put(id, { mnemonic: 'new' })).json()).toEqual({
      mnemonic: 'new',
      similarWord: 'maiz',
    });
  });

  it('rejects fields over 500 characters and non-string values', async () => {
    const id = await word('maize');

    expect((await put(id, { mnemonic: 'a'.repeat(501) })).status).toBe(400);
    expect((await put(id, { similarWord: 5 })).status).toBe(400);
    expect((await put(id, 'nope')).status).toBe(400);
  });

  it('answers 404 for a word of another language or a missing word', async () => {
    const foreign = await t.db
      .prepare(
        "INSERT INTO words (lang, lemma, pos, topic_id, level) VALUES ('en', 'bread', 'noun', (SELECT id FROM topics LIMIT 1), 'A1') RETURNING id",
      )
      .first<{ id: number }>();

    expect((await put(foreign!.id, { mnemonic: 'x' })).status).toBe(404);
    expect((await put(99_999, { mnemonic: 'x' })).status).toBe(404);
  });

  it('answers 401 without a login and 404 for an unknown deck', async () => {
    const id = await word('maize');

    expect(
      (
        await call(`/api/decks/lv-uk/words/${id}/notes`, {
          method: 'PUT',
          body: {},
          cookie: null,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(`/api/decks/nope/words/${id}/notes`, {
          method: 'PUT',
          body: {},
        })
      ).status,
    ).toBe(404);
  });

  it('keeps notes per user', async () => {
    const id = await word('maize');
    await put(id, { mnemonic: 'mine' });
    const other = await seedUser(t.db, 'other', 'pw');

    const row = await t.db
      .prepare('SELECT COUNT(*) AS n FROM word_notes WHERE user_id = ?')
      .bind(other)
      .first<{ n: number }>();

    expect(row!.n).toBe(0);
  });
});

describe('POST /api/decks/:deck/cards/:cardId/unsuspend', () => {
  const unsuspend = (cardId: number, c?: string | null) =>
    call(`/api/decks/lv-uk/cards/${cardId}/unsuspend`, {
      method: 'POST',
      cookie: c,
    });

  it('clears both flags and puts the card back in the queue', async () => {
    const id = await word('maize');
    const cardId = await leech(id, { dueAt: 1 });
    expect(
      (
        (await (await call('/api/decks/lv-uk/review')).json()) as {
          due: number;
        }
      ).due,
    ).toBe(0);

    const res = await unsuspend(cardId);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cardId });
    const row = await t.db
      .prepare('SELECT suspended, leech, lapses FROM cards WHERE id = ?')
      .bind(cardId)
      .first();
    expect(row).toEqual({ suspended: 0, leech: 0, lapses: 5 });
    expect(
      (
        (await (await call('/api/decks/lv-uk/review')).json()) as {
          due: number;
        }
      ).due,
    ).toBe(1);
  });

  it('answers 404 for a missing card, a non-leech, or another user card', async () => {
    const id = await word('maize');
    const plain = await seedCard(t.db, {
      userId,
      wordId: id,
      kind: 'production',
    });
    const other = await seedUser(t.db, 'other', 'pw');
    const theirs = await seedCard(t.db, {
      userId: other,
      wordId: id,
      leech: true,
      suspended: true,
    });

    expect((await unsuspend(99_999)).status).toBe(404);
    expect((await unsuspend(plain)).status).toBe(404);
    expect((await unsuspend(theirs)).status).toBe(404);
  });

  it('requires a login and a known deck', async () => {
    expect(
      (await call('/api/decks/nope/cards/1/unsuspend', { method: 'POST' }))
        .status,
    ).toBe(404);
    expect((await unsuspend(1, null)).status).toBe(401);
  });
});
