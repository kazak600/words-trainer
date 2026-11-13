export async function listStudyTimestamps(
  db: D1Database,
  userId: number,
  since: number,
): Promise<number[]> {
  const { results } = await db
    .prepare(
      'SELECT created_at FROM review_log WHERE user_id = ? AND created_at >= ?',
    )
    .bind(userId, since)
    .all<{ created_at: number }>();
  return results.map((r) => r.created_at);
}
