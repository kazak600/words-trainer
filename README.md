# Latvian Words Trainer

Personal web app for learning Latvian words (Latvian → Ukrainian), phone-first, running on Cloudflare Workers with D1.

Docs: [`development_plan.md`](development_plan.md) (what the app is), [`stages.md`](stages.md) (build order).

## Layout

| Path | Purpose |
|---|---|
| `worker/` | Cloudflare Worker, TypeScript, Hono. `routes/` (HTTP) → `services/` (logic) → `repositories/` (SQL) |
| `web/` | React + Vite frontend, built into `web/dist` and served by the Worker as static assets |
| `data/` | Offline dataset pipeline (Python), `topic_map.csv`, reviewed CSV files |
| `topics.md` | Textbook units by level, the source of the topic map |

## Commands

Run from the repo root.

| Command | What it does |
|---|---|
| `npm install` | Install all workspaces |
| `npm run dev` | Worker on `:8787` and Vite on `:5173` (Vite proxies `/api` to the Worker) |
| `npm test` | Worker and web tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` in both workspaces |
| `npm run lint` | ESLint |
| `npm run build` | Typecheck and build the frontend into `web/dist` |
| `npm run db:migrate:local` | Apply D1 migrations to the local database |

Open `http://localhost:5173` during development.

Auth: create a user (or reset the password) on the local or remote D1. The password is asked for on the terminal, or set `PASSWORD=...`:

```
cd worker
npx wrangler d1 execute latvian-words --local --command "$(npm run -s create-user -- <username>)"
```

Use `--remote` for the deployed database. `/api/health`, `/api/login` and `/api/logout` are public; every other `/api/*` route needs the session cookie. After 5 failed logins for a username (or 20 from one IP) within 15 minutes, login returns 429.

Dataset pipeline (Python 3, standard library only, run from the repo root):

| Command | What it does |
|---|---|
| `python3 -I -m unittest discover -s data/pipeline/tests` | Pipeline tests |
| `python3 -I data/pipeline/merge_wordlists.py` | Merge `data/wordlists/*.txt` into `data/csv/words_lv.csv` |
| `python3 -I data/pipeline/enrich_wiktionary.py` | Add English meaning and grammar from the kaikki Latvian dump (`data/.cache/kaikki/latvian.jsonl`, 190 MB, not committed) into `data/csv/words_lv_enriched.csv` and print the coverage report |
| `python3 -I data/pipeline/fill_grammar_tezaurs.py` | Fill missing grammar in `words_lv_enriched.csv` from the Tēzaurs morphology service (needs network; run after `enrich_wiktionary.py`) |
| `python3 -I data/pipeline/build_translations.py` | Validate `data/translations/<topic>.txt` (Ukrainian translation + gap sentence per word) and merge into `data/csv/translations_uk.csv` and `data/csv/sentences_lv.csv` |
| `python3 -I data/pipeline/review.py export [--topic SLUG ...] [--level A2]` | Write `data/csv/review_<topic>.csv` for review. Edit `ukrainian`, `sentence`, `answer`, `sentence_uk` and set `status` to `approved` |
| `python3 -I data/pipeline/review.py import [FILE ...]` | Read the reviewed files back into `translations_uk.csv` and `sentences_lv.csv`; any changed cell makes the status `edited`; unknown statuses or invalid edits abort the whole import |
| `python3 -I data/pipeline/load_words.py [--local\|--remote]` | Write `data/.cache/load_words.sql` (upserts for approved and edited words only) and run it with `wrangler d1 execute`; safe to run twice |
| `python3 -I data/pipeline/crosscheck_frequency.py` | Write `data/csv/frequency_gaps.csv` (frequent lemmas missing from the list; needs network) |

Topics seed: after editing `data/topic_map.csv`, run `python3 -I data/pipeline/seed_topics.py` to regenerate `worker/migrations/0003_seed_topics.sql`. Needs Node 22.13+ (schema tests use `node:sqlite`).
