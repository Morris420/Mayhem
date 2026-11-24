# The Arena — design and working plan

Written Nov 25, 2026, the night before we start. Read this first; it is the thing we argue
with, not a contract. Anything in here can change in one sentence tomorrow.

The goal of V1 is one honest vertical slice: a page in Mayhem that loads a 3D room, puts a
hunter in it who moves and collides properly, gives that hunter stats and abilities taken from
the skills he actually trained, and lets him fight one boss to the death. Everything else —
more domains, PvP, loot, gear — is deliberately out, and the V1 code is shaped so they can be
added without a rewrite.

---

## 1. One thing to do tonight (30 seconds)

**This container cannot install npm packages or reach the internet.** I checked: there is no
`three`, no Babylon, and `npm install` fails with a network error. Whatever we pick, I cannot
add it to the project in the current chat.

In Claude's settings, turn on network access for package installs. Then **start tomorrow in a
new chat** — the setting is picked up by a new chat, not by a running one. Point the new chat
at this file and say "read docs/arena-design.md, let's do M0".

If that setting cannot be changed, the fallback is: you run `npm install three @dimforge/rapier3d-compat`
locally and push the lockfile, and I write code I cannot run. That costs us the screenshot-and-fix
loop that has caught most of the bugs so far, so it is worth the 30 seconds.

---

## 2. The decision to make first: what we build it with

You said Unity, and that it is worth researching properly. Here is the honest version.

| | Weight on the page | How we would work | Assets |
|---|---|---|---|
| **Unity (WebGL)** | Empty build 8 MB+, a real one tens of MB; slow start, weak on mobile browsers | **Desktop editor on your machine.** I cannot open it, build it, or look at the result | Huge Asset Store |
| **three.js** | ~150 KB library, inside the Vite build we already have | Plain JS in this repo. I write it, run it, screenshot it, fix it | glTF: Mixamo, Quaternius, Sketchfab, Poly Haven |
| **Babylon.js** | Full engine, heavier than three, physics included | Same as three.js, with more batteries | Same glTF world |
| **PlayCanvas** | 1–2 MB runtime | Hosted editor, project lives outside the repo | Good, editor-centric |
| **Godot 4 (web)** | Middling | Desktop editor, separate project, wasm blob | Smaller market |

**My recommendation: three.js, with Rapier for physics.** Ranked by why:

1. **I can actually build it.** The single biggest reason. three.js is npm + plain JavaScript in
   the repo you already have. I write a milestone, run it, take a screenshot, see that the boss
   is clipping through the floor, and fix it — the loop that has made the last week fast. With
   Unity I would be writing C# blind and handing you a list of things to click.
2. **It lives in Mayhem, not next to it.** Same Vite build, same router, same Sanctum session,
   same deploy. Unity would be a second codebase with its own pipeline and its own auth plumbing.
3. **It loads.** Mayhem's entire frontend is ~800 KB today. A Unity build would be the heaviest
   thing on the site by a factor of thirty, and mobile browsers are where Unity WebGL is weakest.
4. **You can read the diff.** Scenes and prefabs are opaque in git; `player.js` is not. You are
   doing this to relearn to build things, and that only works if you can read what changed.

**The honest counter-argument:** if what you want out of this is *Unity on your CV*, that is a
real reason and it beats all four points above. Unity is the industry default for 3D games, and
no amount of three.js makes you employable as a Unity developer. If that is the goal, say so
tomorrow and we do Unity — you drive the editor, I write C# and systems design, and we accept a
slower loop. Pick on what you want to own afterwards, not on what is convenient tonight.

**Babylon.js is the fallback.** If by the end of day one we are writing too much plumbing that an
engine should have given us (character controller, animation blending, physics glue), we switch.
Both read glTF, so nothing we make is wasted.

### The second decision: real-time or turn-based

You wrote "brawl room", which sounds real-time. The earlier roadmap said turn-based first.
They produce different games, so pick one tomorrow:

- **Real-time action** (recommended for V1): you move, dodge, time your swings. It is what
  "brawl" means and it is what makes physics worth having. Harder later for PvP, because two
  browsers have to agree on what happened.
- **Turn-based**: you pick a move, both sides resolve. Trivially fair, trivially server-authoritative,
  great for PvP, and a strange fit for a 3D room with physics.

My take: **real-time for V1 against a boss**, and when PvP comes, decide then whether it is
real-time with the server simulating, or a turn-based duel mode. Single-player V1 does not force
that choice, so do not pay for it now.

---

## 3. Where the code goes

```
frontend/src/arena/          plain JS, no Vue inside the game loop
  engine.js                  renderer, camera, clock, resize, dispose
  world.js                   the room: floor, walls, lights, fog, neon trim
  player.js                  capsule physics, input, movement, camera follow
  boss.js                    the boss: state machine, telegraphs, hitboxes
  combat.js                  damage, cooldowns, hit detection, the fight's result
  figures.js                 the neon hunter + boss meshes (see art, below)
frontend/src/views/ArenaView.vue   mounts the engine, draws the HUD, unmounts cleanly
backend/app/Support/Arena/ArenaRules.php    every balance number, one file, tested
backend/app/Http/Controllers/ArenaController.php
```

Rules that keep this from rotting:

- **Vue owns the HUD, never the frame loop.** The game ticks on `requestAnimationFrame` and
  pushes state out; Vue re-renders bars and numbers. Reactivity inside a 60 fps loop is how
  these projects die.
- **Everything disposes.** Leaving `/arena` must free geometries, materials, textures and the
  renderer, or the tab leaks memory every visit. There will be a test that mounts and unmounts
  the page twice.
- **The client never decides a reward.** More on that next.

### The API

```
GET  /api/arena/loadout              your combat stats + unlocked abilities, computed from skills
POST /api/arena/fights               starts a fight: returns fight id, boss stats, a server seed
POST /api/arena/fights/{id}/result   you report the outcome; the server checks and pays out once
```

V1 is single-player against a boss on your own account, so the realistic threat model is "you
could cheat yourself". The server still owns the numbers: it computes your stats, it sets the
boss, it decides the XP, it refuses a result that is impossible (a fight shorter than the boss's
minimum time-to-kill, damage above your theoretical maximum, a fight id already paid out). That
is enough for V1 and it is the shape that PvP needs later, when the server will have to simulate
rather than verify.

---

## 4. Skills become a fighter

This is the part that makes the whole System pay off: the nine skills you have been grinding
turn into a character sheet. First draft, all of it tunable in `ArenaRules`:

| Stat | Formula | What it feels like |
|---|---|---|
| Health | `100 + Stamina × 6 + Discipline × 2` | how long you last |
| Attack | `10 + Strength × 1.2` | how hard you hit |
| Defense | `Discipline × 0.4` %, capped 60% | damage taken |
| Ability power | `Intellect × 1.5` | how hard your abilities hit |
| Crit chance | `5% + Fortune × 0.5%`, capped 50% | the spikes |
| Healing | `Faith × 0.8` per use | the comeback |
| Stamina pool | `50 + Stamina × 2` | dodges and sprint |
| Affection | an ally you can summon | **V2** |
| Craft | gear slots and upgrades | **V2** |

`damage = Attack × move multiplier × (1 − Defense) × crit`

Sanity check with your numbers today (Strength 50, Stamina 9, Discipline 33, rest at 1):
health 220, attack 70, defense 13%, crit 5.5%. A brand-new hunter at all 1s: health 108, attack 11.
That is a 6× gap in damage, which is the point — the gym has to be visible in the fight. If it
ever stops being visible, the numbers are wrong, not the design.

Boss V1 is tuned to roughly 15× your attack in health, so a fight lasts 30–60 seconds, and hits
hard enough that standing still kills you.

**Abilities unlock at skill thresholds**, so there is something to chase:

| Ability | Unlocks at | Does |
|---|---|---|
| Strike | always | basic attack |
| Dodge | always | i-frames, costs stamina |
| Heavy blow | Strength 10 | slow, big, staggers |
| Second wind | Faith 10 | heal once per fight |
| Focus | Intellect 10 | next hit always crits |
| Iron skin | Discipline 20 | damage reduction for a few seconds |

---

## 5. Art: no downloads, no logins

The obvious route is Mixamo — free with an Adobe ID, royalty-free for games, auto-rigged
humanoids with an animation library. It needs a login, so you would have to fetch the files
yourself, and I cannot see them until they are in the repo.

**For V1 I would rather build the figures in code**, the same way the physique figure on the
dashboard is built: a dark body with a glowing cyan edge, assembled from primitives, animated by
moving joints rather than by baked clips. Reasons: it is exactly the app's existing identity, it
needs no asset, no licence and no login, it is a few hundred bytes instead of a few megabytes,
and I can iterate on it offline. The boss gets the same treatment in a hostile colour — deep red
edge, heavier silhouette.

If it looks cheap in motion, we swap in Mixamo in V2 and nothing else changes, because the model
sits behind one module (`figures.js`). Every asset that does land in the repo gets a line in
`docs/arena-assets.md` with where it came from and its licence. No exceptions.

---

## 6. Milestones

Each one ends the same way: it runs locally, tests pass where there is logic, there is a
screenshot, it is committed and pushed, and `docs/roadmap.md` is updated.

- **M0 — Decide.** Engine, real-time vs turn-based, and whether the figures are code-built or
  Mixamo. Ten minutes, three answers.
- **M1 — It moves.** `/arena` page, a dark room with neon trim, third-person camera, a capsule
  that walks, falls, and collides with walls. Nothing else. This proves the whole stack and is
  the point where we find out if the engine choice was right.
- **M2 — It looks like a hunter.** The neon figure replaces the capsule, with idle / run / attack
  / hit / death states and the camera behaving during each.
- **M3 — It knows who you are.** `ArenaRules`, `/api/arena/loadout`, and a HUD showing your real
  stats and unlocked abilities. The fight is still unwinnable; the numbers are real.
- **M4 — The fight.** Boss state machine with telegraphed attacks, hit detection both ways,
  stamina, dodge, cooldowns, win and lose screens.
- **M5 — It pays out.** Server-granted rewards, a fight log, "fight again", sound if there is
  time, and the polish pass.

Honest estimate: M1 is a session. M2–M4 are the week. M5 is a morning. The thing that always
takes longer than expected is M4, because "fun" is not a thing you can get right on the first
try — budget for throwing the first version of the boss away.

---

## 7. How we work tomorrow

You asked for a prompt conduct. This is what gets the most out of a day:

**Starting.** Open a new chat (for the npm setting), say *"read docs/arena-design.md, do M1"*.
One milestone per message is the sweet spot — big enough that I can work for a while without
you, small enough that you can still judge the result.

**Talk about feel, not implementation.** "The swings should feel heavier" is a better instruction
than "raise the attack cooldown to 600 ms", because the second one is my job and the first one is
the thing only you know. Same for the room: "colder, emptier, more dread" beats a hex colour.

**Judge the screenshot, not the code.** I will end every milestone with a picture, and with a
short clip once there is movement worth watching. If it looks wrong, say what looks wrong in
plain words.

**Decisions.** Where something is genuinely yours to call — art direction, whether a thing is
fun — I will ask with two or three options and a recommendation. If you are asleep or away, I
take the recommended one, say clearly which way I went, and carry on rather than stalling.

**Numbers live in one file.** Every balance constant goes in `ArenaRules`, and I will tell you
which line to change. Tuning should not need me.

**I will not touch the System while building the game**, unless something there breaks.

**When I am blocked** — an asset needs your login, a decision is yours — I do everything else and
leave the blocked item written down, rather than waiting.

**What I need from you before M1:** the three answers from M0. Nothing else.

---

## 8. Still open

- Punishment mechanic: penalty quests rather than XP loss. Undecided, and the arena is a natural
  home for it (lose a fight, take a penalty quest).
- PvP: needs deployment, and a real decision about who simulates the fight.
- Domains: the fiction is that each hunter summons their own arena. V1 ships one room, built
  data-driven so the second one is a file and not a refactor.
- Mobile: the arena is desktop-first. Touch controls are not in V1 and may never be worth it.
