import { generateToken, hashPassword, hashToken, verifyPassword } from '../lib/crypto';
import {
  clearFailures,
  countFailures,
  deleteExpiredSessions,
  deleteOldFailures,
  deleteSession,
  findUserBySession,
  findUserByUsername,
  insertSession,
  recordFailures,
} from '../repositories/auth';

export const SESSION_SECONDS = 90 * 24 * 60 * 60;
const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES_PER_USER = 5;
const MAX_FAILURES_PER_IP = 20;

export type CurrentUser = { id: number; username: string };
export type LoginResult =
  | { ok: true; token: string; user: CurrentUser }
  | { ok: false; reason: 'invalid' | 'rate_limited' };

// Verified against when the user does not exist, so both failures cost the same time.
const dummyHash = hashPassword('dummy');

export async function login(
  db: D1Database,
  username: string,
  password: string,
  ip: string,
  now: number,
): Promise<LoginResult> {
  const userKey = `user:${username.toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  const since = now - WINDOW_SECONDS;

  if (
    (await countFailures(db, userKey, since)) >= MAX_FAILURES_PER_USER ||
    (await countFailures(db, ipKey, since)) >= MAX_FAILURES_PER_IP
  ) {
    return { ok: false, reason: 'rate_limited' };
  }

  const user = await findUserByUsername(db, username);
  const valid = await verifyPassword(password, user ? user.password_hash : await dummyHash);
  if (!user || !valid) {
    await recordFailures(db, [userKey, ipKey], now);
    await deleteOldFailures(db, since);
    return { ok: false, reason: 'invalid' };
  }

  await clearFailures(db, userKey);
  await deleteExpiredSessions(db, now);
  const token = generateToken();
  await insertSession(db, await hashToken(token), user.id, now + SESSION_SECONDS);
  return { ok: true, token, user: { id: user.id, username: user.username } };
}

export async function authenticate(
  db: D1Database,
  token: string,
  now: number,
): Promise<CurrentUser | null> {
  return findUserBySession(db, await hashToken(token), now);
}

export async function logout(db: D1Database, token: string): Promise<void> {
  await deleteSession(db, await hashToken(token));
}
