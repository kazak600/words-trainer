-- Failed login attempts for rate limiting. key is 'user:<name>' or 'ip:<address>'.
CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts_key_time ON login_attempts(key, created_at);
