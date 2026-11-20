# Agent guide: Latvian Words Trainer

Personal vocabulary trainer for one user (no sign-up). Phone-first web app on Cloudflare Workers + D1. Latvian → Ukrainian is live; English → Ukrainian data exists but is not loaded yet. Read `README.md` for commands and `stages.md` for what is unfinished.

## Layout

| Path | Purpose |
|---|---|
| `worker/src/routes/` → `services/` → `repositories/` | HTTP → logic → SQL (Hono, TypeScript) |
| `worker/src/lib/` | FSRS scheduling, answer checker, grading, day boundaries |
| `worker/migrations/` | D1 migrations, applied in order. Never edit an applied one |
| `web/src/` | React + Vite app. `pages/` are screens, `api/` wraps the HTTP calls |
| `data/topic_map.csv` | Topic ↔ textbook unit ↔ level. Source of the topics |
| `data/wordlists/<topic>__<LEVEL>.txt` | Base-form words per topic and level (`pos: word, word`) |
| `data/translations/<topic>.txt` | Ukrainian translation and gap sentence per word |
| `data/csv/` | Pipeline stores and review files (Latvian). `data/en/` is the English copy |
| `data/pipeline/` | Python 3 scripts, standard library only. Tests: `python3 -I -m unittest discover -s data/pipeline/tests` |

## Features

- **Login**: one user, session cookie. Login is rate-limited (5 failures per user or 20 per IP in 15 min).
- **Decks**: `lv-uk` (Latvian → Ukrainian) and `en-uk` (English → Ukrainian, no words loaded yet).
- **Topics**: browse words per topic.
- **Study sessions** (FSRS spaced repetition, `ts-fsrs`):
  - New words go through an intro and practice step before a card is written.
  - Card kinds: `recognition` (choose meaning), `production` (type the Latvian word), `cloze` (fill the gap in a sentence).
  - Topic sessions have 10 words. Review sessions have up to 20 due cards.
  - Daily cap: 10 new words (`NEW_WORDS_PER_DAY` in `worker/src/services/study.ts`).
- **Leeches**: words that keep failing are listed. A user can add a mnemonic and a similar word, and unsuspend cards.
- **Quick add**: one word pair added from the app, no AI (`source = 'manual'`).
- **Stats** per deck, **grammar panel** (gender, declension, forms), **settings**.

API: all routes are under `/api`. Public: `/api/health`, `/api/login`, `/api/logout`. Everything else needs the session cookie.

## Load new words (dataset pipeline)

Run from the repo root. Latvian is the default; add `--lang en` for English.

1. **Edit the word list**: `data/wordlists/<topic>__<LEVEL>.txt`, one line per part of speech, for example `noun: māja, dzīvoklis`. Allowed POS: noun, propn, verb, adj, adv, pron, prep, conj, num, part, interj, phrase.
2. **Merge**: `python3 -I data/pipeline/merge_wordlists.py` → `data/csv/words_lv.csv`. A word in several cells is kept once (lowest level wins).
3. **Enrich** (only for new Latvian words; needs `data/.cache/kaikki/latvian.jsonl`): `enrich_wiktionary.py`, then `fill_grammar_tezaurs.py` (needs network).
4. **Translations and sentences**: add lines to `data/translations/<topic>.txt`, format `lemma | pos | ukrainian | sentence with ___ | answer | ukrainian translation of the sentence`. Then run `python3 -I data/pipeline/build_translations.py`.
   **Warning:** `build_translations.py` resets every row in `translations_uk.csv` and `sentences_lv.csv` to `pending`. Run it only when translation files changed, and re-approve afterwards.
5. **Review**:
   - Export: `python3 -I data/pipeline/review.py export --topic <slug> --level <LEVEL>`. This **overwrites** `data/csv/review_<slug>.csv`. If the file already has rows from another level, back it up and merge the rows back afterwards.
   - The user edits `ukrainian`, `sentence`, `answer`, `sentence_uk` and sets `status` to `approved`. Do not approve words on the user's behalf unless they ask.
   - Import: `python3 -I data/pipeline/review.py import` (all files, or pass file paths). Errors abort the whole import.
6. **Local DB**: `python3 -I data/pipeline/load_words.py --local`. It writes `data/.cache/load_words.sql` and loads approved and edited words only. Safe to run twice.

Verify: `cd worker && npx wrangler d1 execute latvian-words --local --command "select level, count(*) from words group by level"`.

## Add a new topic

Words are not enough: the topic row must exist in D1 first.

1. Add rows to `data/topic_map.csv` (`topic_slug,title_lv,title_uk,level,origin,source_hint`). One row per (topic, level).
2. Regenerate the seed: `python3 -I data/pipeline/seed_topics.py`. This rewrites `worker/migrations/0003_seed_topics.sql`.
   **Do not rely on that for existing databases.** 0003 is already applied locally and remotely, so D1 will not run it again. For a topic added after 0010, write a **new** migration (`worker/migrations/00NN_<name>.sql`) with only the new `INSERT INTO topics (lang, slug, title, title_uk) VALUES (...)`. The `lang` column is `'lv'` or `'en'`.
3. Apply locally: `npm run db:migrate:local`.
4. Then follow "Load new words" above.

## Deploy (only when the user asks)

Deploy is outward-facing. Do not run any of these steps without an explicit request.

1. Tests and build: `npm test`, `npm run typecheck`, `npm run build` (builds `web/dist`, which the Worker serves as static assets).
2. Check pending remote migrations before applying: `cd worker && npx wrangler d1 migrations list latvian-words --remote`. As of the last check, `0006`–`0010` were not applied remotely.
3. Apply migrations: `cd worker && npx wrangler d1 migrations apply DB --remote`.
4. Deploy the Worker and the web app together: `cd worker && npx wrangler deploy` (the config is `worker/wrangler.jsonc`, Worker name `train-words`).
5. Load approved words: `python3 -I data/pipeline/load_words.py --remote` and, for English, `--lang en --remote`. This is idempotent.
6. Create a user if needed: `cd worker && npx wrangler d1 execute latvian-words --remote --command "$(npm run -s create-user -- <username>)"`. The password is asked on the terminal.

Smoke test: `GET /api/health` returns `{"status":"ok"}`.

## Rules for agents

- Do not commit or push unless the user asks. Leave changes in the working tree.
- Do not deploy, and do not run `--remote` commands, unless the user asks.
- Do not edit applied migrations. Add a new one.
- Do not approve review rows on the user's behalf unless they say so.
- Keep code comments to non-obvious logic only.
