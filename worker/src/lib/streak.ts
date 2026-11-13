const DAY_SECONDS = 86_400;

export function localDay(timestamp: number, tzOffsetMinutes: number): number {
  return Math.floor((timestamp + tzOffsetMinutes * 60) / DAY_SECONDS);
}

// A streak is alive while the last study day is today or yesterday.
export function computeStreak(
  days: number[],
  today: number,
): { days: number; studiedToday: boolean } {
  const studied = new Set(days.filter((d) => d <= today));
  const studiedToday = studied.has(today);
  let cursor = studiedToday ? today : today - 1;
  let count = 0;
  while (studied.has(cursor)) {
    count++;
    cursor--;
  }
  return { days: count, studiedToday };
}
