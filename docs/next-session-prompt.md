# Starting the next session

Paste the block below into a **new chat**. Everything after it is in the docs folder.

---

I'm Morrison, working on **Mayhem**, my Solo Leveling style productivity app. Repo
`Morris420/Mayhem`. Attach and clone it, then check out and work on the `arena` branch
(`main` is the live site; finished milestones go to `main` by pull request).

**The project.** A Laravel 13 API (Sanctum SPA auth, MySQL locally via XAMPP, SQLite in tests)
and a Vue 3 SPA (Vite, Pinia, Vue Router, Tailwind 4). Quests with XP and E–S ranks, nine
OSRS-style skills, gym and nutrition tracking, achievements, a calendar with Google sync, a
Briefcase, and an AI coach on Gemini. The rule everywhere: the server owns every number that
counts.

**The arena** is a 3D Tekken-style anime fighter on `/arena`, where my trained skills become
(lightly) my combat stats, built to be played online later with rollback netcode.
- **Stack:** three.js for rendering, plus **our own deterministic simulation**: no physics
  library, only exactly-rounded maths, with `snapshot()`/`restore()` for rollback.
- **Models:** my own VRoid Studio hunter with Mixamo clips, converted offline to one
  `hunter.glb` (no textures yet); the arena is built from KayKit Dungeon Remastered (CC0).
  `docs/arena-assets.md` says how, and how to add a clip.
- **Tests:** Vitest for the simulation, Playwright for the browser suite (in the repo, run with
  `npm run test:e2e`), glTF-Transform for preparing models.
- **Later:** WebRTC for netplay.

Read these in order before doing anything:
1. `docs/arena-build-guide.md`: where the game stands, the rules that must not be broken,
   how to work, the milestones A–G with what "done" means, and the production checklist.
2. `docs/roadmap.md`
3. `docs/arena-playbook.md`: conventions, the test harness, gotchas we already hit
4. `docs/arena-design.md` (§0 has my decisions) and `docs/system-guide.md` (the app)

Where the docs disagree, `arena-design.md` §0 (my decisions) and the build guide win, and the
code beats both — fix the doc you found wrong.

**Today:** milestones A (the hunter, the dungeon arena) and C (stats from skills, the fire
bolt) are done. Do **B** (the feel pass) with me, then **D** (the boss and a real fight, with
the server validating results). If I've attached the `.vrm` or new Mixamo clips, add those first.

**How to work:** take the whole milestone, test it (unit, browser, backend if touched), show
me a screenshot, commit and push to `arena`, and update `docs/roadmap.md`. Ask me only what
is genuinely mine to decide (feel, looks, balance); otherwise pick the recommended option,
tell me which, and keep going.
