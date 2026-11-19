const DAY_SECONDS = 86_400;

export function localDay(timestamp: number, tzOffsetMinutes: number): number {
  return Math.floor((timestamp + tzOffsetMinutes * 60) / DAY_SECONDS);
}

// The local day containing `timestamp`, as a [from, to) range of Unix seconds.
export function localDayWindow(
  timestamp: number,
  tzOffsetMinutes: number,
): { from: number; to: number } {
  const from =
    localDay(timestamp, tzOffsetMinutes) * DAY_SECONDS - tzOffsetMinutes * 60;
  return { from, to: from + DAY_SECONDS };
}

// Minutes east of UTC; null when the value is not a whole number within +-14 hours.
export function parseTzOffset(raw: unknown): number | null {
  if (raw === undefined) return 0;
  const offset = Number(raw);
  return Number.isInteger(offset) && Math.abs(offset) <= 14 * 60
    ? offset
    : null;
}
