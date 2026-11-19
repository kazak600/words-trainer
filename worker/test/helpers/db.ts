import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../migrations');

export function createMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8'));
  }
  return db;
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

// Applies every migration up to and including `lastFile`, so a test can insert data before the next one runs.
export function createDbAtMigration(lastFile: string): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of migrationFiles().filter((f) => f <= lastFile)) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8'));
  }
  return db;
}

export function applyMigration(db: DatabaseSync, file: string): void {
  db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8'));
}

export function migrationSql(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
}
