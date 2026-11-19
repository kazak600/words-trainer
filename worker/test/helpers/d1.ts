import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { hashPassword } from '../../src/lib/crypto';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../migrations');

export type TestD1 = { db: D1Database; dispose: () => Promise<void> };

export async function createTestD1(): Promise<TestD1> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(import.meta.dirname, '../../wrangler.jsonc'),
    persist: false,
  });
  const db = proxy.env.DB;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(statements.map((s) => db.prepare(s)));
  }
  return { db, dispose: () => proxy.dispose() };
}

export type WordSeed = {
  lemma: string;
  pos?: string;
  topic: string;
  level: string;
  ukrainian?: string;
  status?: 'pending' | 'approved' | 'edited';
  grammar?: object;
  sentence?: { gap: string; answer: string; hint: string };
};

export async function seedWord(db: D1Database, w: WordSeed): Promise<number> {
  const pos = w.pos ?? 'noun';
  const word = await db
    .prepare(
      `INSERT INTO words (lang, lemma, pos, topic_id, level, grammar_json)
       VALUES ('lv', ?, ?, (SELECT id FROM topics WHERE lang = 'lv' AND slug = ?), ?, ?)
       RETURNING id`,
    )
    .bind(
      w.lemma,
      pos,
      w.topic,
      w.level,
      w.grammar ? JSON.stringify(w.grammar) : null,
    )
    .first<{ id: number }>();
  const id = word!.id;
  await db
    .prepare(
      `INSERT INTO translations (word_id, target_lang, text, review_status) VALUES (?, 'uk', ?, ?)`,
    )
    .bind(id, w.ukrainian ?? `uk-${w.lemma}`, w.status ?? 'approved')
    .run();
  if (w.sentence) {
    await db
      .prepare(
        `INSERT INTO sentences (word_id, text_with_gap, answer, hint_target_lang, hint, review_status)
         VALUES (?, ?, ?, 'uk', ?, ?)`,
      )
      .bind(
        id,
        w.sentence.gap,
        w.sentence.answer,
        w.sentence.hint,
        w.status ?? 'approved',
      )
      .run();
  }
  return id;
}

export async function seedUser(
  db: D1Database,
  username: string,
  password: string,
): Promise<number> {
  const row = await db
    .prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id',
    )
    .bind(username, await hashPassword(password))
    .first<{ id: number }>();
  return row!.id;
}

export type CardSeed = {
  userId: number;
  wordId: number;
  kind?: 'recognition' | 'production' | 'cloze';
  sentenceId?: number;
  dueAt?: number;
  state?: number;
  stability?: number;
  reps?: number;
  lapses?: number;
  suspended?: boolean;
  leech?: boolean;
};

export async function seedCard(db: D1Database, c: CardSeed): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO cards (user_id, deck_id, word_id, kind, sentence_id, state, due_at, stability, difficulty, reps, lapses, suspended, leech)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, 5, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      c.userId,
      c.wordId,
      c.kind ?? 'recognition',
      c.sentenceId ?? null,
      c.state ?? 2,
      c.dueAt ?? 0,
      c.stability ?? 1,
      c.reps ?? 1,
      c.lapses ?? 0,
      c.suspended ? 1 : 0,
      c.leech ? 1 : 0,
    )
    .first<{ id: number }>();
  return row!.id;
}

export function seedReviewLog(
  db: D1Database,
  userId: number,
  wordId: number,
  createdAt: number,
): Promise<D1Result> {
  return db
    .prepare(
      `INSERT INTO review_log (user_id, deck_id, word_id, mode, correct, created_at)
       VALUES (?, 1, ?, 'flip', 1, ?)`,
    )
    .bind(userId, wordId, createdAt)
    .run();
}

export async function seedSentence(
  db: D1Database,
  wordId: number,
  s: {
    gap: string;
    answer: string;
    hint: string;
    status?: string;
    lang?: string;
  },
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO sentences (word_id, text_with_gap, answer, hint_target_lang, hint, review_status)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      wordId,
      s.gap,
      s.answer,
      s.lang ?? 'uk',
      s.hint,
      s.status ?? 'approved',
    )
    .first<{ id: number }>();
  return row!.id;
}
