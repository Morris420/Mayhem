# Arena — build guide (the plan to finish the game)

The working brief for building the arena from where it is now to a finished, production-ready
game inside Mayhem. Read after `docs/system-guide.md` (the app), `docs/arena-design.md` (the
why) and `docs/arena-playbook.md` (conventions, test harness, gotchas). Where this file and the
code disagree, the code is right — fix this file.

Written 25 Nov 2026, at the end of the session that built the fighter kit.

---

## 1. Where it stands

`/arena` in the Vue app (`frontend/src/views/ArenaView.vue`, game code in `frontend/src/arena/`).

| Done | Where |
|---|---|
| Dark neon Training Hall, 44 × 44 m, ledges, dust, bloom with MSAA | `rooms/training-hall.js`, `world.js` |
| Own deterministic physics (cylinder vs boxes), no physics library | `physics.js` |
| Walk, sprint, jump (hop/full, coyote, buffer), double jump, wall cling + wall jump, dash | `player.js`, `combat.js` |
| Fighter kit: jab → cross → uppercut (1.5× the jab), J J K / heavy, jump kick, block from the front, guard meter + guard break, hitstun, hitstop, knockdown, KO, input buffer, pushboxes | `moves.js`, `combat.js` |
| Training dummy AI on the same kit (wanders, attacks, blocks, dashes), seeded | `ai.js` |
| Mouse orbit camera (pointer lock), stick relative to camera, fight framing | `engine.js`, `input.js` |
| Placeholder hunter (KayKit CC0) with speed-blended locomotion and scrubbed attack clips | `figure.js` |
| Shield sphere (shrinks with the guard), hit sparks, camera shake, HUD bars + combo | `shield.js`, `effects.js`, `ArenaView.vue` |
| `snapshot()` / `restore()` — whole-fight rewind, the base for rollback | `sim.js` |
| Tests: 75 unit (sim, combat, AI, determinism), 19 browser | `src/arena/__tests__/`, `frontend/e2e/` |

Controls today: click the arena to capture the mouse (Esc releases) · mouse look, wheel zoom ·
WASD move · Shift sprint · Space jump / double jump · C dash · left click (or J) light ·
right click (or K) heavy · F or L hold guard. Strings: L L L, L K, L L K.

---

## 2. Rules that must not be broken

These are what make the rest possible. Every milestone keeps them.

1. **The simulation is deterministic.** `physics.js`, `player.js`, `combat.js`, `ai.js`,
   `sim.js`, `moves.js` (and anything they call) use only `+ - * /`, `Math.sqrt/abs/min/max/
   floor/ceil`, comparisons and integer maths. No `Math.sin/cos/atan2/hypot/pow/exp/log`, no
   `**`, no `Math.random` (use the sim's seeded rng), no clocks, no DOM. Angles are unit vectors;
   rotations use constants written out as literals. A unit test greps for forbidden maths —
   add new sim files to its list.
2. **The renderer only reads the simulation.** Everything visual (models, animations,
   sparks, shields, camera) is in `engine.js`, `figure.js`, `effects.js`, `shield.js`,
   `world.js` and may use any maths. Nothing visual feeds back into `sim.step()`.
3. **Everything that happens is an input or a rule.** New mechanics are new fields in the
   fighter state plus rules in `step`, never something the renderer decides.
4. **`snapshot()` must capture everything.** Any new state (projectiles, cooldowns, the boss's
   brain) goes into `snapshot()`/`restore()`, and the "rewind mid-fight and replay" test must
   still pass. That test is what makes online play possible.
5. **Numbers live in one place.** Feel: `MOVE` (player.js), `MOVES`/`COMBAT` (moves.js), `AI`
   (ai.js), `CAMERA`/`BLOOM` (engine.js). Balance that matters for rewards: the server's
   `ArenaRules` (milestone C).
6. **The server owns stats and rewards.** The client never sends a damage number or an XP
   amount — see `docs/system-guide.md` §3.
7. **Vue never runs in the frame loop.** The engine pushes HUD state ~10× a second.
8. **Leaving `/arena` frees everything** (the WebGL-context test must stay green).
9. **Assets:** every file in the repo gets a line in `docs/arena-assets.md` with source and
   licence. Raw Mixamo files are never committed (their licence forbids redistributing the
   raw files) — only the game's own converted file.

---

## 3. How to work

- **Branch:** build on a branch named `arena`, not on `main`. `main` is the live site. When a
  milestone is done and green, it is merged to `main` by a pull request (`gh pr create`).
- **Per milestone:** unit tests for every rule (`npx vitest run`), the browser suite
  (`npm run test:e2e`, in the Claude container with
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`), `php artisan test`
  when the backend changed, a screenshot looked at, `docs/roadmap.md` updated, commit, push.
- **Installing:** `frontend/.npmrc` already sets `legacy-peer-deps` (a known oxlint peer
  mismatch). Composer needs `--prefer-dist` in the container.
- **Ask Morrison** only what is his to decide (feel, look, balance); otherwise take the
  recommended option, say which, and carry on.

---

## 4. The milestones, in order

**Morrison's order (25 Nov, agreed):**
1. **A** — the character: VRoid → Blender (VRM add-on) → FBX → Mixamo auto-rig, so the model
   is on Mixamo's skeleton and every Mixamo clip fits with no retargeting. Start with idle,
   run and a punch to judge the look; then the full clip list below.
2. **Combat + camera** — a real combo and attack system on the fighter kit (B's tuning plus
   new moves and strings) and better camera controls. Feel first, before effects, because
   effects attach to moves.
3. **Looks** — VFX and particles for the finished moves, arena polish.
4. **C** — stats from the System's skills (+ abilities). That makes the **playable build**;
   then D (boss, fight flow) and E (rewards).
5. **F** — netcode: LAN 1v1, then online, then free-for-all. **G** controllers last.

Note for A with the Mixamo-rig route: the model arrives as FBX on the `mixamorig` skeleton.
Convert model + clips once, offline, to one `.glb` (FBX2glTF or Blender's glTF export), keep
the raw Mixamo files out of the repo, and map the clip names in `figure.js`. `@pixiv/three-vrm`
is then not needed; recreate the toon look and outline in `figure.js` as now.

Each has what to build and what "done" means.

### A. The real hunter (VRoid + Mixamo) — DONE 25 Nov (textures and a few clips still to come; docs/arena-assets.md)

Morrison makes an original Solo-Leveling-*inspired* hunter in **VRoid Studio** (free) and
exports **VRM 1.0** (reduce polygons on, 2048 texture atlas). He downloads **Mixamo** clips as
*FBX Binary, Without Skin, 30 fps, In Place*, and connects the folder to the chat or attaches a
zip. Never use ripped "Sung Jinwoo" models: they belong to the rights holders.

Clips wanted: Idle, Fighting Idle, Walking, Jogging, Running, Sprint, strafe left/right,
Walking Backward, Left/Right Turn, Jump, Falling Idle, Falling To Landing, a wall-hang or
wall-run clip, Left Jab, Right Cross (or "Cross Punch"), **Uppercut**, a kick, Block Idle,
Block Hit, 2 hit reactions, Knocked Down, Getting Up, Dying, a magic cast, Dodge/roll.

Build:
- `npm i @pixiv/three-vrm` (MIT). Load the `.vrm` with `GLTFLoader` + `VRMLoaderPlugin`.
- Retarget each Mixamo FBX (`FBXLoader`) onto the VRM's normalized humanoid bones. The
  three-vrm project's own `humanoidAnimation` example (`loadMixamoAnimation`) is the reference
  approach: map `mixamorig*` bone names to VRM humanoid bone names, convert rest-pose
  rotations, scale hip translation by the height ratio.
- Do the retargeting **once, offline**: a Node script (in a scratch folder, not the repo) that
  bakes all clips onto the VRM and writes one `hunter.vrm`/`.glb` into
  `frontend/public/models/arena/`. Then the game loads one file and no raw Mixamo file ships.
- Swap the names in `figure.js`: `LOCO` and `MOVE_CLIPS` (+ the `overrideClip` names). Retune
  `attackProgress` so each clip's impact frame lands on the move's active frames.
- Keep the outline/toon look; add glowing blue eyes as an emissive material on the eye mesh.
- Done when: the hunter loads in < 3 s on broadband, every state has the right clip, attacks
  visibly connect on the active frames, both fighters use it (the dummy tinted red),
  `docs/arena-assets.md` lists the files and licences, screenshots look right.

### B. Feel pass

With the real model in, play and tune with Morrison: walk/run speed, jump height, dash length,
hitstop, pushback, guard drain/regen, the dummy's aggression. Only numbers change (§2.5).
Add: a short "Fight!" / "K.O." banner, three generated sounds (hit, block, guard break — tiny
WebAudio synths, no files), dash and double-jump trails.

### C. Stats and abilities from the skills (server) — backend + HUD DONE 25 Nov; Fire bolt still to do

- Backend: `app/Support/Arena/ArenaRules.php` (every balance constant), `Loadout.php`
  (skills → stats). **Decided: skills matter only a little** — e.g. damage ±15%, health
  ±20%, guard ±20% between a fresh hunter and a maxed one. Abilities unlock at skill thresholds
  (design doc §4). `GET /api/arena/loadout`, through the logged-in user, with Feature tests and
  a unit test for the anchors.
- Frontend: `stores/arena.js` fetches the loadout; the sim takes it as fighter options
  (`createFighter({ stats })`) — stats are *inputs to* the deterministic sim, never computed in
  it from client data.
- First ability, **Fire bolt** (Intellect): a projectile entity in the sim (position,
  velocity, owner, lifetime, hitbox) — deterministic, in `snapshot()`. Blockable (costs guard),
  dodged by dash i-frames and sidesteps. A cooldown and a small resource (mana or stamina).
  Keys: Q / E / R for abilities 1–3. Render: a glowing orb with a trail.
- Done when: the HUD shows your real stats and unlocked abilities, the fire bolt works and is
  tested (hit, block, dodge, cooldown, rewind).

### D. The boss and a real fight

- A boss = the fighter kit + a stronger AI (`ai.js`, a new brain with phases: e.g. below 50%
  health it gets a new string and a telegraphed heavy with a visible wind-up).
- Fight flow in the sim: `phase` = `intro` → `fight` → `won`/`lost`; a round timer; a win /
  lose screen in Vue; "fight again".
- Server: `arena_fights` table (`user_id`, `boss_slug`, `seed`, stats at start, `started_at`,
  `ended_at`, `outcome`, `rewarded_at`), `POST /api/arena/fights` (returns id, seed, boss stat
  block), `POST /api/arena/fights/{id}/result` (validates: known fight, not paid, duration ≥
  the boss's minimum time-to-kill given the player's stats; pays once inside a transaction).
  The client also sends its **input log**; store it — milestone F's verifier replays it.
- Done when: a full fight against the boss can be won and lost, the result is paid once,
  impossible results are refused (Feature tests).

### E. Rewards

Skill XP for a win (which skill: decide with Morrison — Strength for a boss is the default),
an achievement or two, a fight log on the dashboard. Optionally the punishment mechanic: a
lost boss fight creates a penalty quest (still undecided — ask).

### F. Netcode: LAN 1v1 → online → free-for-all

- **Rollback over WebRTC data channels** (unreliable/unordered), browser to browser. Each
  frame: send your input (a few bytes: stick as int8, buttons as bits, `view` as int16
  angle-quantised, frame number). Run with 2 frames of input delay; predict the opponent's
  input = their last one; when a real input arrives for a past frame, `restore()` the snapshot
  from that frame and re-simulate to now. Keep ~8 frames of snapshots.
- **Determinism check:** every 30 frames exchange a hash of `snapshot()`; on mismatch, log
  both states (desync bug) and resync from the host's snapshot.
- **Laravel as lobby and signalling only** (challenge, accept, exchange the WebRTC
  offer/answer/ICE): plain endpoints + polling first; Laravel Reverb (WebSockets) later.
  Laravel never sits in the fight's frame loop.
- **LAN** = the same thing on one network (no TURN needed). Do this first: it proves the
  netcode without deployment.
- **Online** needs deployment (below) and a TURN server (e.g. coturn) for strict networks.
- **Rewards in PvP:** the server replays both input logs with the same JS sim in a small Node
  verifier (`frontend/src/arena/sim.js` runs in Node already) before paying anything.
- **Free-for-all, 3–4 hunters:** the sim already handles N fighters; the work is the
  N-way input exchange and the lobby.

### G. Controllers (final step)

Gamepad API (`navigator.getGamepads()`), polled in `input.js` behind the same `controls()`
shape: left stick move, right stick camera, A jump, X light, Y heavy, RB guard, B dash, LT
sprint, D-pad abilities. Xbox and Switch Pro controllers both map through the "standard"
layout. Add a short controls overlay that switches labels to the pad in use.

---

## 5. Production — what "ready to ship" means

The arena merges into the live site when all of this holds:

- **Performance:** 60 fps on a laptop with integrated graphics in a 1v1; arena JS chunk
  ≤ ~800 KB (≈ 200 KB gzipped) — three.js dominates; models ≤ ~3 MB each, gzip/brotli on.
  Lazy-loaded only on `/arena` (already).
- **Robustness:** WebGL failure shows the friendly error (already); model load failure falls
  back to the capsule (already); leaving and re-entering `/arena` never leaks a context
  (tested); tab-hidden pauses rendering.
- **Server authority:** stats from `/api/arena/loadout`; fights and rewards only through the
  fight endpoints with validation; nothing that pays out trusts a client number.
- **Tests green:** `php artisan test`, `npx vitest run`, `npm run test:e2e`.
- **Deployment notes** (the app is not deployed yet — `docs/roadmap.md`): serve
  `public/models/` with long cache headers; the SPA and API on one origin (as in development);
  HTTPS required for WebRTC and pointer lock; a TURN server for online play.
- **Docs:** `docs/system-guide.md` §5.13 describes the finished arena; `docs/arena-assets.md`
  complete; `docs/roadmap.md` current.

When a milestone is done, Morrison brings the result back to the main project chat (or the
same branch) and it is merged to `main` by pull request after the checks above.
