# Arena playbook — the implementation brief

Working notes for building the combat game. `docs/arena-design.md` holds the *what* and *why*
(scope, engine comparison, milestones). This file holds the *how*: everything I need in front of
me to write the code without re-deriving it.

If you are an assistant picking this project up: read `docs/system-guide.md` first for the app,
then `docs/arena-design.md` for the plan, then this.

---

## 1. Decisions locked

| | Decision |
|---|---|
| Engine | **three.js** for rendering + **our own deterministic simulation** (`src/arena/physics.js`, `player.js`, `sim.js`). Rapier was used in M1 and removed in M2 (25 Nov): rollback netplay needs bit-identical results on every machine and cheap snapshots |
| Models | KayKit Adventurers (CC0) as the placeholder hunter — docs/arena-assets.md |
| Mode | **Real-time** single-player against one boss. PvP is a later decision, not a V1 constraint |
| Where | A new page in the existing SPA, inside the existing Vite build. Not a separate project |
| Authority | The server owns stats, the boss, and every reward |

Rejected and why, in one line each: **Unity** — the editor is a desktop GUI I cannot drive, so
the build-look-fix loop breaks, and an empty WebGL build is already ten times the weight of the
whole current frontend. **PlayCanvas / Godot** — same problem, milder. **Mixamo** — needs an
Adobe login, so the files can only arrive through him; keep it as the V2 upgrade.

---

## 2. Environment and how work gets verified

**Packages install.** Since 25 Nov the container has network access for npm and Composer.
`frontend/.npmrc` sets `legacy-peer-deps=true`, because `eslint-plugin-oxlint` 1.73 declares a
peer of `oxlint` 1.73 while we run 1.74 — without it every `npm install` fails with ERESOLVE.
Playwright's own browser download host is blocked in the container, so there the suite runs
against the preinstalled Chromium via `PW_CHROMIUM_PATH` (see below).

**How a milestone gets checked.** The browser harness now lives **in the repo**
(`frontend/playwright.config.js`, `frontend/e2e/`), so it cannot vanish with a session again:

```bash
cd frontend
npx playwright install chromium      # once per machine
npm run test:e2e                     # vite build + Playwright
# in the Claude container:
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npm run test:e2e
```

It builds the app, boots Laravel with `php -S` against a throwaway SQLite file
(`e2e/backend.sh` — your MySQL is never touched), serves the build with `vite preview` (which
proxies `/api` exactly like `npm run dev`), registers one hunter in `e2e/global-setup.js`, and
drives real Chromium. Every test fails on a console error, an uncaught exception, a failed
request or a 5xx. Screenshots land in `e2e/screenshots/` (git-ignored); the ones worth keeping
are copied to `docs/screenshots/`.

What it covers today: the arena (`e2e/arena.spec.js`) and the nav at six widths
(`e2e/nav.spec.js`). **The old end-to-end suite for the System (register, quests, workout,
food search, calendar sync, coach) was in the lost scratchpad and has not been rebuilt** —
it is a good candidate for the wrap-up session, now that the harness exists.

The single most important technical requirement in this document:

> **The game loop must be steppable from the outside.** Not "render when the browser feels like
> it" — a fixed timestep that a test can advance by hand.

Concretely:

```js
// in ArenaView.vue / engine.js, enabled with ?test=1
window.__arena = {
  step(ms),          // advance the simulation deterministically
  state(),           // { player: {hp, pos, stamina}, boss: {hp, state}, phase }
  input(action),     // 'attack' | 'dodge' | 'ability:heavy' | move vector
  seed(n),
}
```

With that, a browser test can assert "after 2 seconds of holding attack the boss has lost
exactly N health" instead of squinting at a picture — and the screenshots become a visual check
rather than the only check. Build this in M1, not later; retrofitting determinism into a
finished game loop is miserable.

Since M2b also: buttons as taps (`input('light' | 'heavy' | 'dash' | 'jump')`) or held
(`input({ block: true })`), `dummy('auto' | 'idle' | 'block' | 'attack')`, `teleport(pos, 'dummy')`,
`snapshot()` / `restore()`, and `state().events` (this step's hits and blocks).

Built in M1 exactly like this, plus `teleport(pos)`, `pixels()` (reads back a rendered frame:
share of lit and of neon-cyan pixels) and `debug()` (draw calls, triangles). In test mode
nothing advances on its own and the keyboard is ignored; `step(ms)` runs `round(ms / 16.67)`
fixed steps. `input('attack')` answers `{accepted: false}` until M4.

**WebGL in headless Chromium: verified working in M1** with
`--use-angle=swiftshader --enable-unsafe-swiftshader`, bloom included. The pixel read-back
test proves frames are really drawn, not just that a canvas exists.

**Determinism rules (for online play).** The simulation (`physics.js`, `player.js`, `sim.js`)
must give bit-identical results on every machine:

- only `+ - * /`, `Math.sqrt`, `Math.abs/min/max/floor/ceil`, comparisons. **Never**
  `Math.sin/cos/tan/atan2/hypot/pow/exp/log` or `**` — their last digit can differ between
  browsers. A unit test greps for them.
- angles are stored as unit vectors (`facing: {x, z}`); turning uses `TURN_COS/TURN_SIN`
  written out as literals. `state().player.yaw` exists for the renderer only.
- no `Math.random`, no clock, no DOM: inputs in, state out. Randomness comes from the seeded rng.
- `snapshot()` / `restore()` save and load the whole state as plain data (< 2 KB). A unit test
  and a browser test rewind and replay and require an identical result.

**The simulation also runs without a browser.** `src/arena/sim.js` has no three.js and no DOM,
so Vitest runs it under Node (`src/arena/__tests__/sim.spec.js`): falls, walks, wall and
pillar collisions, determinism. Prefer a unit test there for any rule; use the browser suite
for what needs a real page.

---

## 3. Conventions the game code must follow

The arena is part of Mayhem, not a guest in it. Matching the existing style is not cosmetic —
it is what keeps the project readable by one person.

**Backend**

- Logic goes in `app/Support/Arena/`, not in the controller. Controllers validate, call, shape.
- Every tunable number goes in one constants class, `ArenaRules`, the way `Progression` and
  `SkillCurve` do. Unit-test it.
- Models declare fields with `#[Fillable([...])]`; `protected function casts()` for casts.
- Load records through `$request->user()->relation()` so ownership cannot be forgotten.
- Migrations guard with `hasTable` / `hasColumn` and are safe to re-run.
- Run `./vendor/bin/pint <files>` on what you touched. Do not reformat the whole repo.
- A feature is not done until `php artisan test` passes.

**Frontend**

- Plain JS modules under `frontend/src/arena/`. **No Vue reactivity inside the frame loop** —
  Vue owns the HUD, the game pushes state to it at most a few times a second.
- API calls go through `lib/api.js` (cookies and CSRF are handled there), from a Pinia store.
- Tailwind v4: literal class strings only, never computed ones — the scanner has to see them.
  Keyframes live in `assets/main.css`.
- Icons are inline SVG paths added to `AppIcon.vue`. No icon package.
- The page must clean up after itself completely on unmount (see §6).

---

## 4. Architecture

```
frontend/src/arena/
  engine.js     renderer, scene, camera follow, the rAF loop, resize, dispose, the test hook
  sim.js        the headless simulation: room + player, step(), state(), seed, snapshot/restore
  physics.js    our collision: upright cylinder vs axis-aligned boxes, step-up, snap-down, walls  [M2]
  loop.js       the fixed-step clock (1/60 s, frame delta clamped at 100 ms)                [M1]
  input.js      keyboard -> stick (WASD / arrows); ignored in test mode                     [M1]
  rooms/        one data file per arena (training-hall.js)                                  [M1]
  world.js      roomBoxes() -> colliders AND meshes from the same list; lights, fog, trim
  figure.js     what fighters look like: the glTF hunter + animation picking; capsule fallback
  player.js     movement rules and feel (MOVE constants): walk, sprint, jump, wall hug/jump
  moves.js      the move list as frame data (MOVES) + everything else combat (COMBAT)    [M2b]
  combat.js     fighters: body + combat state machine, hits, block, dash, pushboxes     [M2b]
  ai.js         the training dummy's brain: produces the same controls a player does    [M2b]
  effects.js    hit sparks and camera shake (render-only, driven by sim events)        [M2b]
  boss.js       the boss: stat block, AI state machine, telegraphs, hitboxes
  combat.js     damage, cooldowns, stamina, hit resolution, the fight result
  hud/          Vue components for bars, cooldowns, the result screen
frontend/src/views/ArenaView.vue
frontend/src/stores/arena.js

backend/app/Support/Arena/ArenaRules.php      every number
backend/app/Support/Arena/Loadout.php         skills -> stats and abilities
backend/app/Http/Controllers/ArenaController.php
backend/database/migrations/..._create_arena_fights.php
```

**API**

```
GET  /api/arena/loadout            stats + unlocked abilities, computed from skills
POST /api/arena/fights             start: returns fight id, boss stat block, server seed
POST /api/arena/fights/{id}/result report the outcome; server validates and pays out once
```

`arena_fights`: `user_id`, `boss_slug`, `seed`, `started_at`, `ended_at`, `outcome`,
`rewarded_at`, plus the stat block the fight was started with. Paying out twice must be
impossible — check `rewarded_at` inside a transaction.

**Server authority, V1 edition.** The threat model today is one person on their own account, so
the server verifies rather than simulates: it issues the stats and the boss, and rejects a result
that is impossible — a fight shorter than the boss's minimum time-to-kill given the player's
damage, a duration that does not match the reported hits, an unknown fight id, or one already
paid. Rewards (skill XP, an achievement) are granted server-side only. When PvP arrives the
server will have to run the simulation itself; keeping all the rules in `ArenaRules` and out of
the client is what makes that port possible rather than a rewrite.

---

## 5. Skills become a fighter

First draft, all tunable in `ArenaRules`:

| Stat | Formula |
|---|---|
| Health | `100 + Stamina × 6 + Discipline × 2` |
| Attack | `10 + Strength × 1.2` |
| Defense | `Discipline × 0.4` %, capped at 60 |
| Ability power | `Intellect × 1.5` |
| Crit chance | `5% + Fortune × 0.5%`, capped at 50 |
| Healing | `Faith × 0.8` per use |
| Stamina pool | `50 + Stamina × 2` |

`damage = Attack × move multiplier × (1 − Defense) × crit`

Abilities unlock at thresholds: Strike and Dodge always; Heavy blow at Strength 10; Second wind
at Faith 10; Focus at Intellect 10; Iron skin at Discipline 20. Affection (an ally) and Craft
(gear) are V2.

Sanity anchors to keep as a test: a fresh hunter (all skills 1) has 108 health and 11 attack; the
current save (Strength 50, Stamina 9, Discipline 33) has 220 health and 70 attack. The gap has to
stay visible — if training stops mattering in the fight, the numbers are wrong, not the design.

Boss V1: health ≈ 15 × the player's attack, so a fight runs 30–60 seconds.

---

## 6. three.js notes worth having written down

**Renderer.** `WebGLRenderer({ antialias: true })`, `outputColorSpace = SRGBColorSpace`,
`toneMapping = ACESFilmicToneMapping`, pixel ratio clamped to 2. Resize through a
`ResizeObserver` on the container, not a window listener, so it behaves inside the SPA layout.

**The loop.** Fixed timestep accumulator:

```js
const STEP = 1 / 60
let acc = 0
function frame(now) {
  acc += Math.min(now - last, 100) / 1000   // clamp, or a backgrounded tab explodes
  while (acc >= STEP) { physics.step(); game.update(STEP); acc -= STEP }
  render(acc / STEP)                         // interpolate for smoothness
}
```

Clamping the delta matters: switch tabs for ten seconds and an unclamped accumulator runs 600
physics steps in one frame.

**Dispose, every time.** Leaving `/arena` has to free everything, or each visit leaks a renderer
and its textures:

```js
scene.traverse(o => { o.geometry?.dispose(); materials(o).forEach(m => { m.map?.dispose(); m.dispose() }) })
renderer.dispose(); renderer.forceContextLoss()
cancelAnimationFrame(raf); resizeObserver.disconnect(); controls?.dispose()
```

There should be a test that mounts and unmounts the page twice and asserts the WebGL context
count did not grow.

**Physics: ours, not a library** (since M2). The fighter is an upright cylinder against
axis-aligned boxes (`physics.js`): vertical and horizontal moves resolved separately, push-out
along the contact normal (so walls slide), step-up 0.3 m, snap-down 0.2 m, moves split into
≤ 0.2 m sub-steps so nothing tunnels. Rapier did this in M1, but it is neither bit-identical
across machines nor cheap to snapshot, and rollback needs both.

**Hit detection.** For V1 do *not* use physics sensors for attacks. Resolve hits yourself during
the attack's active window with a capsule-vs-capsule or sphere-overlap check against the target.
It is easier to tune, trivially deterministic, and testable without a physics step.

**The neon figure.** Build a small skeleton of `Group`s — hips → spine → chest → head, two arms,
two legs — with capsule geometry per bone, and animate by setting joint rotations in code: sine
waves for idle breathing and run cycles, short tweened poses for attack, hit and death. No glTF,
no animation clips, no retargeting.

The look comes from the same trick as the dashboard figure: a dark, almost-black body material
plus a bright edge. In 3D that is either `EdgesGeometry` + `LineSegments` on each bone, or an
inverted-hull outline, with a cheap bloom pass over the whole scene. Try edges first — it is one
line per mesh and it reads at distance.

Tie the proportions to the save: bone thickness interpolates from lean to heavy exactly like
`PhysiqueFigure`'s `L(lean, buff)` helper, driven by the physique stage. Your avatar in the arena
should visibly be the body you trained. That is the whole point of the game existing.

**Budget.** 60 fps on a laptop with integrated graphics. Keep the room to a handful of draw calls
(merge static geometry). Start with no shadow maps — a blob shadow under each fighter is a
quarter of the cost and reads fine in a dark arena. Add one directional shadow only if the room
looks flat without it.

---

## 7. Gotchas carried over from the app

- **Dates.** Never `toISOString().slice(0,10)` for "today" — it returns the UTC day and is wrong
  after 01:00 Amsterdam time. Build the string from local parts.
- **Timezone is global** (`app.timezone`), not per user. Fine for now; the first thing to fix
  before other people play.
- **MySQL vs SQLite.** Development is MySQL, tests are SQLite. SQLite ignores string length
  limits and MySQL does not, so a `string` column will reject a long value in production that
  passed in tests. Use `text` where length is not genuinely bounded.
- **Ambiguous columns.** A query that joins two tables both having `user_id` needs the column
  qualified, or SQLite throws at runtime and the test looks like a 500.
- **Full-page screenshots** of the app show the sticky nav floating mid-page. That is an artifact
  of `fullPage`, not a bug.
- **The nav is nearly full on a phone** at seven items. Adding "Arena" makes eight — check the
  horizontal-overflow assertion at 390px, and if it fails, the labels are already hidden so the
  next lever is nav padding.
- **Post-processing kills anti-aliasing unless you ask.** The `EffectComposer` renders into its
  own target; without `samples: 4` on it, every thin bright edge crawled and flickered while the
  camera moved (Morrison's "flickering hue light"). Thin line geometry (GridHelper) shimmers too:
  the floor grid is now a mipmapped texture.
- **Neon close to the camera glares.** A trim strip a metre from the lens fills the screen and
  the bloom smears it. The camera keeps `wallMargin` from walls and stays `belowTop` under the
  top of the walls.
- **Buffer attack presses.** Players press the next button exactly on impact — during the
  hitstop freeze. Without a buffer those presses vanished and strings dropped their third hit.
  `COMBAT.inputBuffer` (8 frames) remembers them; a browser test found this one.
- **Combos are maths, not luck.** Every string link must land before the previous hit's hitstun
  ends (`next hit frame ≤ startup + 1 + hitstun`). A unit test checks every link in `MOVES`, so a
  tuning change that breaks a combo fails loudly.
- **Behind-the-back cameras hide fights.** Two fighters a metre apart, seen from behind one of
  them, overlap completely. The camera swings to a 3/4 view in a fight, and the stick is
  relative to the camera (`input.view`, part of the recorded input so replays still match).
- **Jumping onto ledges** (lessons from the Rapier version, still covered by tests): "grounded"
  must not be reported while rising, and only a downward-facing surface is a ceiling. Either
  mistake stops a jump dead halfway up a ledge.
- **Bundle weight.** Arena chunk 680 KB (173 KB gzipped), mostly three.js; the hunter model is a
  separate 1.07 MB gzipped file. (With Rapier it was 4.9 MB.)
- **`php -S` for Laravel must start inside `public/`.** Laravel's `server.php` router finds
  `index.php` from the working directory. `artisan serve` does this for you, but it also drops
  most environment variables, which is why the e2e script uses `php -S` directly.
- **Sanctum and non-browser clients.** A request is only treated as a session (cookies + CSRF)
  when its `Origin`/`Referer` is a stateful domain. Playwright's API request context sends
  neither by default, which gives a 500 "Session store not set on request".
- **The nav already overflowed between 640 and 1024 px** before the arena existed; the eighth
  link pushed 1280 px over too. Labels now show from 1280 px (xl) up, icons with tooltips and
  aria-labels below that. `e2e/nav.spec.js` checks six widths.

---

## 8. Milestones and what "done" means

M0 decide · M1 it moves · M2 it looks like a hunter · M3 it knows who you are · M4 the fight ·
M5 it pays out. Full descriptions in `docs/arena-design.md` §6.

Done, for every milestone, means all of:

1. it runs with `npm run dev` + `php artisan serve`;
2. `php artisan test` passes, and there are tests for anything with a rule in it;
3. the browser suite passes, including the console-error and mobile-overflow checks;
4. a screenshot exists and has been looked at;
5. it is committed and pushed, and `docs/roadmap.md` says where we are.

---

## 9. Open questions

- **Camera**: locked third-person follow, or orbit with the mouse? Orbit is nicer to play and
  harder to test. Start locked, revisit at M4.
- **Death**: retry instantly, or a cooldown that makes losing sting? Ties into the undecided
  punishment mechanic — losing a boss fight is a natural place for a penalty quest.
- **Rewards**: which skill does a win pay into? Probably Strength for a boss, or a split across
  the stats the fight used. Decide with real numbers at M5.
- **Sound**: none planned for V1. A hit without sound feels weightless, so budget an hour at M5
  for three generated sounds rather than shipping silence.
