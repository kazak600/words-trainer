export type UserRow = { id: number; username: string; password_hash: string };

export function findUserByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .bind(username)
    .first<UserRow>();
}

export async function insertSession(
  db: D1Database,
  tokenHash: string,
  userId: number,
  expiresAt: number,
): Promise<void> {
  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, userId, expiresAt)
    .run();
}

export function findUserBySession(
  db: D1Database,
  tokenHash: string,
  now: number,
): Promise<{ id: number; username: string } | null> {
  return db
    .prepare(
      `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, now)
    .first();
}

export async function deleteSession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export async function deleteExpiredSessions(db: D1Database, now: number): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
}

export async function countFailures(db: D1Database, key: string, since: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND created_at > ?')
    .bind(key, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function recordFailures(db: D1Database, keys: string[], now: number): Promise<void> {
  await db.batch(
    keys.map((key) =>
      db.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind(key, now),
    ),
  );
}

export async function clearFailures(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
}

export async function deleteOldFailures(db: D1Database, before: number): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE created_at <= ?').bind(before).run();
}
