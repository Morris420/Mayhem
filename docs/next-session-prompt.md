# Starting the next session

Paste the block below into a **new chat** (new, so it picks up the setting that allows package
installs). Everything after it is in the docs folder.

---

I'm Morrison, working on **Mayhem** — my Solo Leveling style productivity app. Laravel 13 API +
Vue 3 SPA, repo `Morris420/Mayhem`, branch `main`. Attach and clone that repo first.

**Before anything else, test this and tell me the result:**

```
cd frontend && npm install three @dimforge/rapier3d-compat
```

A previous session's container had no network and could not install packages at all. I have
since turned network access on, which is why we are in a new chat. If the install still fails,
stop and tell me — the whole plan for today depends on it and we will need a different approach.

If it works, read these in the repo, in this order:

- `docs/system-guide.md` — what every feature does and how the code behind it works
- `docs/arena-design.md` — the combat game: scope, why three.js, the combat maths, milestones
- `docs/arena-playbook.md` — the implementation brief: conventions, three.js notes, gotchas

**Where we are.** The productivity app is finished and I use it daily: quests with XP, levels and
E–S ranks, nine OSRS-style skills, gym and nutrition tracking, automatic achievements, a calendar
with two-way Google Calendar sync, a Briefcase for files, and an AI coach on Gemini that reads my
data and proposes quests I accept or reject. 111 backend tests and a browser suite pass.

**What I want next.** The arena: a 3D fighting game on a new page inside the same app, where the
skills I have actually trained become my combat stats. Already decided — three.js + Rapier,
real-time, one boss, fighters built in code in the app's neon style, and the server owns every
stat and reward.

**Today: M1 from the design doc.** An `/arena` page, a dark room with neon trim, a third-person
camera, and a capsule that walks, falls and collides with the walls. Build the game loop so a
test can step it deterministically through a `window.__arena` hook — the playbook explains why
that cannot be retrofitted later. Nothing else in M1.

Work the way the playbook's "how we work" section says: take the whole milestone, run the tests,
show me a screenshot, commit and push. Ask me only about things that are genuinely mine to
decide. The browser test harness from the last session lived outside the repo and is gone — with
npm working you can build with `vite build` and drive it with Playwright directly.
