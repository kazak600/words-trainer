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
    .bind(w.lemma, pos, w.topic, w.level, w.grammar ? JSON.stringify(w.grammar) : null)
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
      .bind(id, w.sentence.gap, w.sentence.answer, w.sentence.hint, w.status ?? 'approved')
      .run();
  }
  return id;
}

export async function seedUser(db: D1Database, username: string, password: string): Promise<number> {
  const row = await db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id')
    .bind(username, await hashPassword(password))
    .first<{ id: number }>();
  return row!.id;
}
