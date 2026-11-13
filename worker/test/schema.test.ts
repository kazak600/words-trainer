import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createMigratedDb } from './helpers/db';
import { parseCsv } from './helpers/csv';

const TOPIC_MAP = join(import.meta.dirname, '../../data/topic_map.csv');

describe('database schema', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createMigratedDb();
  });

  it('creates every table', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'sessions',
        'decks',
        'topics',
        'words',
        'translations',
        'sentences',
        'progress',
        'review_log',
        'session_state',
      ]),
    );
  });

  it('seeds the lv-uk deck', () => {
    const deck = db.prepare('SELECT * FROM decks').all();

    expect(deck).toEqual([
      expect.objectContaining({
        slug: 'lv-uk',
        source_lang: 'lv',
        target_lang: 'uk',
      }),
    ]);
  });

  it('seeds the topics from the topic map', () => {
    const mapRows = parseCsv(TOPIC_MAP);
    const expected = new Map(
      mapRows.map((r) => [r.topic_slug!, [r.title_lv, r.title_uk]]),
    );
    const topics = db
      .prepare('SELECT slug, title, title_uk FROM topics')
      .all() as { slug: string; title: string; title_uk: string }[];

    expect(expected.size).toBe(25);
    expect(topics).toHaveLength(expected.size);
    for (const topic of topics) {
      expect([topic.title, topic.title_uk]).toEqual(expected.get(topic.slug));
    }
    for (const row of mapRows) {
      expect(topics.map((t) => t.slug)).toContain(row.topic_slug);
    }
  });

  describe('constraints', () => {
    const insertWord = (topicId: number, level = 'A1', lemma = 'maize') =>
      db
        .prepare(
          'INSERT INTO words (lang, lemma, pos, topic_id, level) VALUES (?, ?, ?, ?, ?)',
        )
        .run('lv', lemma, 'noun', topicId, level);

    it('rejects a word with an unknown topic', () => {
      expect(() => insertWord(9999)).toThrow(/FOREIGN KEY/);
    });

    it('rejects an unknown level', () => {
      expect(() => insertWord(1, 'C2')).toThrow(/CHECK/);
    });

    it('rejects a duplicate lemma and part of speech', () => {
      insertWord(1);

      expect(() => insertWord(1)).toThrow(/UNIQUE/);
    });

    it('rejects an unknown review status', () => {
      const { lastInsertRowid } = insertWord(1);

      expect(() =>
        db
          .prepare(
            'INSERT INTO translations (word_id, target_lang, text, review_status) VALUES (?, ?, ?, ?)',
          )
          .run(lastInsertRowid, 'uk', 'хліб', 'maybe'),
      ).toThrow(/CHECK/);
    });

    it('stores one translation per word and language', () => {
      const { lastInsertRowid } = insertWord(1);
      const insert = db.prepare(
        'INSERT INTO translations (word_id, target_lang, text) VALUES (?, ?, ?)',
      );
      insert.run(lastInsertRowid, 'uk', 'хліб');
      insert.run(lastInsertRowid, 'en', 'bread');

      expect(() => insert.run(lastInsertRowid, 'uk', 'хліб 2')).toThrow(
        /UNIQUE/,
      );
    });

    it('deletes translations, sentences and progress with their word', () => {
      const { lastInsertRowid: wordId } = insertWord(1);
      const { lastInsertRowid: userId } = db
        .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
        .run('anton', 'hash');
      db.prepare(
        'INSERT INTO translations (word_id, target_lang, text) VALUES (?, ?, ?)',
      ).run(wordId, 'uk', 'хліб');
      db.prepare(
        'INSERT INTO sentences (word_id, text_with_gap, answer, hint_target_lang, hint) VALUES (?, ?, ?, ?, ?)',
      ).run(wordId, 'Es ēdu ___', 'maizi', 'uk', 'Я їм хліб');
      db.prepare(
        'INSERT INTO progress (user_id, deck_id, word_id, due_at) VALUES (?, 1, ?, 0)',
      ).run(userId, wordId);

      db.prepare('DELETE FROM words WHERE id = ?').run(wordId);

      for (const table of ['translations', 'sentences', 'progress']) {
        const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
          n: number;
        };
        expect(row.n).toBe(0);
      }
    });
  });
});
