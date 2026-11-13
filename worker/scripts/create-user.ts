// Prints SQL that creates (or resets the password of) a user.
//   PASSWORD=... node --experimental-strip-types scripts/create-user.ts <username>
// Without PASSWORD the password is asked for on the terminal. Pipe the output to D1:
//   npx wrangler d1 execute latvian-words --local --command "$(npm run -s create-user -- anton)"
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/crypto.ts';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function createUserSql(username: string, password: string): Promise<string> {
  const hash = await hashPassword(password);
  return (
    `INSERT INTO users (username, password_hash) VALUES (${quote(username)}, ${quote(hash)}) ` +
    'ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash;'
  );
}

function askPassword(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  return new Promise((resolve) => {
    process.stderr.write('Password: ');
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    rl.question('', (answer) => {
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = write;
      process.stderr.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error('usage: create-user <username>');
    process.exit(1);
  }
  const password = process.env.PASSWORD ?? (await askPassword());
  if (!password) {
    console.error('empty password');
    process.exit(1);
  }
  console.log(await createUserSql(username, password));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
