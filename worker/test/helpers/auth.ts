import { app } from '../../src/app';
import { seedUser } from './d1';

export const USERNAME = 'anton';
export const PASSWORD = 'correct horse battery';

export function cookieValue(res: Response): string | null {
  const header = res.headers.get('set-cookie');
  const match = header?.match(/^session=([^;]*)/);
  return match?.[1] ?? null;
}

// Creates the user, logs in through the real route, returns a Cookie header value.
export async function loginCookie(env: { DB: D1Database }): Promise<string> {
  await seedUser(env.DB, USERNAME, PASSWORD);
  const res = await app.request(
    '/api/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    },
    env,
  );
  return `session=${cookieValue(res)}`;
}
