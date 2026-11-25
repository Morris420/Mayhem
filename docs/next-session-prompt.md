# Starting the next session

Paste the block below into a **new chat** (new, so it picks up the setting that allows package
installs). Everything after it is in the docs folder.

---

I'm Morrison, working on **Mayhem** — my Solo Leveling style productivity app. Laravel 13 API +
Vue 3 SPA, repo `Morris420/Mayhem`, branch `main`. Attach and clone that repo first.

Read these in the repo, in this order:

- `docs/roadmap.md` — where we are, and the arena decisions waiting for me
- `docs/system-guide.md` — what every feature does and how the code behind it works
- `docs/arena-design.md` — the combat game: scope, why three.js, the combat maths, milestones
- `docs/arena-playbook.md` — the implementation brief: conventions, harness, three.js notes, gotchas

**Where we are.** The productivity app is finished and I use it daily. The arena is a 3D
Tekken-style anime fighter built for rollback netplay (`docs/arena-design.md` §0, decisions made).
**M1 and M2 are done**: a dark neon Training Hall with ledges, a KayKit hunter (placeholder) that
walks, sprints, jumps and wall-jumps, on our own deterministic engine with snapshot/restore.
The browser harness lives in the repo (`cd frontend && npm run test:e2e`).

**Today: M2b, the fighter kit against a training dummy** — feel first. Light / Heavy / Block,
1- and 3-hit strings with frame data, hitstop / hitstun / blockstun / knockdown, a dummy that
stands or blocks on a toggle. Keyboard only (controllers are the very last step). Keep it all
inside the deterministic simulation and keep the determinism rules in the playbook.

Work the way the playbook says: take the whole milestone, run the unit tests, `php artisan test`
and the browser suite, show me a screenshot, commit and push, update `docs/roadmap.md`. Ask me
only about things that are genuinely mine to decide.
