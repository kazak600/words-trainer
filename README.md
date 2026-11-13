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
| `npm test` | Worker unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` in both workspaces |
| `npm run lint` | ESLint |
| `npm run build` | Typecheck and build the frontend into `web/dist` |
| `npm run db:migrate:local` | Apply D1 migrations to the local database |

Open `http://localhost:5173` during development.

Dataset pipeline (Python 3, standard library only, run from the repo root):

| Command | What it does |
|---|---|
| `python3 -I -m unittest discover -s data/pipeline/tests` | Pipeline tests |
| `python3 -I data/pipeline/merge_wordlists.py` | Merge `data/wordlists/*.txt` into `data/csv/words_lv.csv` |
| `python3 -I data/pipeline/crosscheck_frequency.py` | Write `data/csv/frequency_gaps.csv` (frequent lemmas missing from the list; needs network) |

Topics seed: after editing `data/topic_map.csv`, run `python3 -I data/pipeline/seed_topics.py` to regenerate `worker/migrations/0003_seed_topics.sql`. Needs Node 22.13+ (schema tests use `node:sqlite`).
