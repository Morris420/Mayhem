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

**Where we are.** The productivity app is finished and I use it daily. The arena's **M1 is done**:
`/arena` has a neon Training Hall, a locked third-person camera, and a capsule that falls, walks
and collides, on a deterministic fixed-step loop driven by tests through `window.__arena`.
The browser harness now lives in the repo (`cd frontend && npm run test:e2e`).

**Today: M2 from the design doc** — the neon hunter replaces the capsule (in `figure.js`), with
idle / run / attack / hit / death states and the camera behaving during each. Body proportions
from the physique stage come in M3 with the real stats; in M2 use a fixed mid build.

Work the way the playbook says: take the whole milestone, run the unit tests, `php artisan test`
and the browser suite, show me a screenshot, commit and push, update `docs/roadmap.md`. Ask me
only about things that are genuinely mine to decide.
