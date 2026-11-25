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
Tekken-style anime fighter built for rollback netplay (`docs/arena-design.md` §0). Done: a dark
neon hall, movement (sprint, jump, wall jump, dash), the fighter kit (J/K strings, block, hitstop,
knockdowns, all frame data in `moves.js`), an AI training dummy on the same kit, a 3/4 fight
camera, on our own deterministic engine with snapshot/restore. The hunter model is a KayKit
placeholder. The browser harness lives in the repo (`cd frontend && npm run test:e2e`).

**Today:** [pick one]
- *If my VRoid model + Mixamo clips are in the folder I connect:* load the VRM, retarget the
  Mixamo clips, map them in `figure.js` (`LOCO`, `MOVE_CLIPS`), keep the raw Mixamo files out of
  the repo (docs/arena-assets.md).
- *Otherwise:* stats and abilities from my skills (server-side `ArenaRules` + `/api/arena/loadout`,
  small effect as decided), and a first ability: a fire bolt.

Work the way the playbook says: take the whole milestone, run the unit tests, `php artisan test`
and the browser suite, show me a screenshot, commit and push, update `docs/roadmap.md`. Ask me
only about things that are genuinely mine to decide.
