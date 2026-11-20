import { localDayWindow } from '../lib/day';
import { listReviewDays, listWordProgress } from '../repositories/stats';
import { requireDeck } from './study';

const CALENDAR_DAYS = 90;

export type Stats = {
  states: { new: number; learning: number; review: number; learned: number };
  levels: { level: string; total: number; learned: number }[];
  topics: {
    topicId: number;
    title: string;
    titleUk: string;
    total: number;
    learned: number;
  }[];
  days: { day: string; reviews: number }[];
};

export async function getStats(
  db: D1Database,
  userId: number,
  deckSlug: string,
  tzOffsetMinutes: number,
  now: number,
): Promise<Stats> {
  const deck = await requireDeck(db, deckSlug);
  const today = localDayWindow(now, tzOffsetMinutes).from;
  const [words, days] = await Promise.all([
    listWordProgress(db, {
      userId,
      deckId: deck.id,
      sourceLang: deck.source_lang,
      targetLang: deck.target_lang,
    }),
    listReviewDays(db, {
      userId,
      deckId: deck.id,
      from: today - (CALENDAR_DAYS - 1) * 86_400,
      tzOffsetMinutes,
    }),
  ]);

  const states = { new: 0, learning: 0, review: 0, learned: 0 };
  const levels = new Map<string, { total: number; learned: number }>();
  const topics = new Map<number, Stats['topics'][number]>();
  for (const w of words) {
    const state = w.learned
      ? 'learned'
      : w.review
        ? 'review'
        : w.learning
          ? 'learning'
          : 'new';
    states[state] += 1;

    const level = levels.get(w.level) ?? { total: 0, learned: 0 };
    level.total += 1;
    level.learned += w.learned;
    levels.set(w.level, level);

    const topic = topics.get(w.topic_id) ?? {
      topicId: w.topic_id,
      title: w.title,
      titleUk: w.title_uk,
      total: 0,
      learned: 0,
    };
    topic.total += 1;
    topic.learned += w.learned;
    topics.set(w.topic_id, topic);
  }

  return {
    states,
    levels: [...levels]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([level, v]) => ({ level, ...v })),
    topics: [...topics.values()],
    days,
  };
}
