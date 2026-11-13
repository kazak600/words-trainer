import { computeStreak, localDay } from '../lib/streak';
import { listStudyTimestamps } from '../repositories/streak';

const LOOKBACK_DAYS = 400;

export async function getStreak(
  db: D1Database,
  userId: number,
  tzOffsetMinutes: number,
  now: number,
) {
  const since = now - LOOKBACK_DAYS * 86_400;
  const stamps = await listStudyTimestamps(db, userId, since);
  const days = [...new Set(stamps.map((s) => localDay(s, tzOffsetMinutes)))];
  return computeStreak(days, localDay(now, tzOffsetMinutes));
}
