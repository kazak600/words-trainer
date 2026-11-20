-- Local testing only: makes about a dozen of the first user's cards due right now,
-- so the Review page has something to show (a mix of recognition, typed and cloze cards, one card per word).
-- Run: npx wrangler d1 execute DB --local --file=scripts/dev-make-review-due.sql   (from worker/)

UPDATE cards SET due_at = unixepoch() - 3600
WHERE id IN (
  SELECT MIN(id) FROM cards
  WHERE user_id = (SELECT MIN(id) FROM users) AND kind = 'recognition' AND suspended = 0
  GROUP BY word_id ORDER BY MIN(id) LIMIT 6
);

UPDATE cards SET due_at = unixepoch() - 3600
WHERE id IN (
  SELECT MIN(id) FROM cards
  WHERE user_id = (SELECT MIN(id) FROM users) AND kind = 'production' AND suspended = 0
    AND word_id NOT IN (SELECT word_id FROM cards WHERE due_at <= unixepoch())
  GROUP BY word_id ORDER BY MIN(id) LIMIT 5
);

UPDATE cards SET due_at = unixepoch() - 3600
WHERE id IN (
  SELECT MIN(id) FROM cards
  WHERE user_id = (SELECT MIN(id) FROM users) AND kind = 'cloze' AND suspended = 0
    AND word_id NOT IN (SELECT word_id FROM cards WHERE due_at <= unixepoch())
  GROUP BY word_id LIMIT 1
);
