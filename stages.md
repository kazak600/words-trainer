## Not finished yet

Everything below is built or planned but not done. Nothing here is committed to a deploy.

**Needs the user**

- Review and approve the 9 pending Latvian A2 units and the 13 English units (`review_<topic>.csv`), then import and load them locally.
- Provide the textbook B1 unit word lists (`data/wordlists/<topic>__B1.txt`) so the B1 pipeline run can start.

**Deploy (outward-facing, only on request)**

- Apply migrations 0006–0010 to the remote D1 and deploy the Worker and web app. Then load approved words with `load_words.py --remote` (and `--lang en --remote`).
