import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { createUserSql } from '../scripts/create-user.ts';
import { createTestD1, type TestD1 } from './helpers/d1';

let t: TestD1;

beforeEach(async () => {
  t = await createTestD1();
});

afterEach(async () => {
  await t.dispose();
});

function login(username: string, password: string) {
  return app.request(
    '/api/login',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) },
    { DB: t.db },
  );
}

describe('createUserSql', () => {
  it('prints SQL that creates a user who can log in, with no plaintext password', async () => {
    const sql = await createUserSql('anton', 'secret pass');

    await t.db.exec(sql.replace(/\n/g, ' '));

    expect(sql).not.toContain('secret pass');
    expect((await login('anton', 'secret pass')).status).toBe(200);
    expect((await login('anton', 'wrong')).status).toBe(401);
  });

  it('running it again for the same username changes the password', async () => {
    await t.db.exec((await createUserSql('anton', 'old')).replace(/\n/g, ' '));
    await t.db.exec((await createUserSql('anton', 'new')).replace(/\n/g, ' '));

    expect((await login('anton', 'new')).status).toBe(200);
    expect((await login('anton', 'old')).status).toBe(401);
  });

  it('escapes quotes in the username', async () => {
    await t.db.exec((await createUserSql("o'neil", 'pw')).replace(/\n/g, ' '));

    expect((await login("o'neil", 'pw')).status).toBe(200);
  });
});
