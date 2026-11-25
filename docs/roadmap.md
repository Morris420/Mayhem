# Mayhem roadmap (agreed Nov 24, 2026)

Docs in this folder:
- `system-guide.md` - what every feature does and how the code behind it works. Start here.
- `arena-design.md` - the combat game: scope, engine decision, combat maths, milestones.
- `arena-playbook.md` - the implementation brief for building it (conventions, three.js notes, gotchas).
- `ai-coach-setup.md`, `google-calendar-setup.md` - setting up the two optional integrations.
- `next-session-prompt.md` - what to paste into a new chat to pick the project up.

Goal: finish and polish the System in 1-2 days of sessions, then build the arena combat game (domains, bosses, PvP) over about 5 weeks.

## Done (Nov 24-25)
- Calendar redesign (time grid, mobile one day), Briefcase, Hunter banner + Today brief.

## Session 1: Skills engine (OSRS-style levels) (DONE)
- Sources: quests -> quest skill, gym day 30 + record 15 -> Strength, diet day on target 25 -> Stamina. Tune in SkillService; curve scale in SkillCurve::SCALE.
- Catalog of skills + per-user XP ledger. Every XP source (quest, gym log, diet day, achievement, later briefcase/AI quests) writes a ledger row tied to a skill.
- OSRS-shaped XP curve, scaled to personal pace (tunable constant), cap 99. Total level = sum of skill levels.
- Quests get a skill (picker in quest builder, default Discipline). Backfill old completions.
- Skills list on dashboard; level-up toasts per skill.
- Skills (9): Strength, Stamina, Discipline, Intellect, Literacy, Faith, Affection, Fortune (money), Craft (building/career).

## Session 2: AI quest coach (DONE)
- Provider: Gemini free tier by default (GEMINI_API_KEY), or anything OpenAI-compatible (OpenRouter/Groq/Ollama). See docs/ai-coach-setup.md.
- Add a provider: implement App\Support\Coach\CoachProvider and add it to the match in AppServiceProvider.
- Caps: COACH_DAILY_MESSAGES (25) and COACH_DAILY_QUESTS (10) per person per day.
- Hunter profile (big text: goals, status, how to be challenged) stored in the database.
- Chat that only creates quests: model returns structured quest proposals, you accept or reject.
- Daily generation (lazy on first open of the day), hard cap on messages/quests per day.
- Context: profile, recent completions, skill levels, optionally gym/diet/calendar (toggles).
- Provider pluggable: Claude Haiku (API key), Gemini free tier, or Ollama locally.

## Session 3: Briefcase (DONE)
- Finder-style page: folders, upload (xlsx, csv, pdf, docx, images), rename, delete, replace with new version.
- Link items: a Google Sheets/Drive/OneDrive URL opens straight in the web app (best for sheets you edit daily).
- Files stored on a private disk, only served to the logged-in owner.

## Session 4: Hero banner (DONE, skill radar still to add; restyle when his design arrives)
- LoL-style hunter card: rank frame that evolves, total level, skill radar, titles, streak, cosmetics unlocked by achievements.
- Data model + placeholder first; final look comes from his design.

## Session 5: Wrap-up
- Weekly System report, daily reflection note in the day journal, JSON export/backup, rest-day-aware streaks, PWA install, polish.
- Deployment decision (needed before Briefcase holds real finances and before PvP).

## Arena: where we are
- Direction (25 Nov): a Tekken-style anime fighter built for rollback netplay. docs/arena-design.md §0 has the plan and Morrison's four decisions (own engine, skills matter little, feel first, keyboard first / controllers last).
- **M1 - it moves: DONE.** `/arena`, room, camera, deterministic fixed-step loop, `window.__arena` test hook.
- **M2 - movement, the hunter, our own engine: DONE (25 Nov).** Screenshots: docs/screenshots/arena-m2-*.png.
  - Room: 32 x 32 m, 6 m walls, darker and dimmer, ledges (1.0 / 2.0 / 3.4 m staircase, 0.8 and 1.3 m ledges), slow dust. The flicker is fixed (the post-processing had no anti-aliasing; now 4x MSAA, and the floor grid is a mipmapped texture instead of thin lines).
  - Controls: WASD move, Shift sprint, Space jump (tap = hop, hold = full jump, coyote time, jump buffer); in the air push into a wall to cling and slide, Space to kick off it.
  - Hunter: KayKit "Rogue Hooded" (CC0) - dark toon shading, cyan outline, idle / walk / run / sprint / jump / land / wall-cling animations. Placeholder, see docs/arena-assets.md.
  - Engine: Rapier removed; our own deterministic collision in `src/arena/physics.js`; `snapshot()` / `restore()` for rollback. Arena download 4.9 MB -> 680 KB (173 KB gzipped) + the model (1.07 MB gzipped, cached).
  - Tests: 29 unit tests for the simulation (incl. rewind/replay and a guard against non-deterministic maths), 16 browser tests.
- **M2b - the fighter kit + a training dummy: DONE (25 Nov).** Screenshots: docs/screenshots/arena-m3-*.png.
  - Arena 44 x 44 m, 7 m walls; the centre is open for fighting, ledges in the corners.
  - Controls: WASD move, Shift sprint, Space jump, C dash (no direction = backdash), J light, K heavy, L block (hold). Strings: J J J (jab, cross, spin kick - knockdown), J K / J J K (rising strike - knockdown), K alone = heavy blow. J in the air = jump kick.
  - Combat (all frame data in `src/arena/moves.js`): startup / active / recovery, hitstun and blockstun, hitstop on impact, pushback, knockdown + get-up, KO + respawn, one hit per move, an 8-frame input buffer (presses during the hit freeze count), soft lock-on when you attack near someone. Block works from the front only - sidestep (dash sideways) and hit them in the back.
  - Dash: 2 m burst, the first 6 frames dodge everything, cooldown.
  - Training dummy: same fighter kit, driven by `src/arena/ai.js` (wanders, closes in, strings, heavies, blocks ~45% of attacks it sees coming, dashes in and sidesteps). Deterministic: a whole fight replays identically.
  - Camera: fixed behind you while exploring; when someone is within 12 m it eases to a 3/4 view of the fight so the fighters never hide each other, and WASD follows the camera. `CAMERA.fightAngle` in engine.js (0 = always straight behind).
  - HUD: health bars (you / the dummy), combo counter, the controls. Hit sparks and a camera shake on heavy hits.
  - Tests: 66 unit (34 for combat and the dummy, incl. a whole fight replayed after a rewind), 17 browser.
- **Polish round: DONE (25 Nov).** Screenshots: docs/screenshots/arena-m4-*.png.
  - Double jump (Space again in the air: a bit higher, carries you the way you steer or were moving); wall jump launches higher (10.5 m/s) and further from the wall, and gives the double jump back.
  - Combo: left jab -> right cross -> uppercut; the uppercut deals 1.5x the jab and launches.
  - Controls: mouse look (click the arena to capture the mouse, Esc releases, wheel zooms), left click light, right click heavy, F (or L) guard, C dash; the stick follows the camera.
  - Guard meter: blocking costs guard (per move), holding drains it slowly, it refills after a pause; at zero the guard breaks (stunned and open). A see-through shield sphere shows while guarding and shrinks with the meter; guard bars in the HUD.
  - Tests: 75 unit, 19 browser.
- **Milestone C - stats and abilities from your skills: DONE (25 Nov, branch `arena`).** Screenshots: docs/screenshots/arena-c-*.png.
  - `GET /api/arena/loadout`: Health (Stamina), Guard (Discipline), Damage % (Strength), Ability power % (Intellect), each only ±15-20% between level 1 and 99 (level 50 = the tuned numbers). Every number in `backend/app/Support/Arena/ArenaRules.php`.
  - The page loads it before the fight; the sim takes it as fighter options (never computes it). HUD: stat card, mana bar, ability bar (Q / E / R) with cooldowns.
  - **Fire bolt** (Q, Intellect 1): interruptible wind-up, a glowing orb with a trail, ~14 m; blockable (costs guard), dodged by a dash or a sidestep, stopped by walls; 30 mana, 1.5 s cooldown. Projectiles are part of `snapshot()`, so rewinds replay bolts in flight.
  - Tests: 90 unit (15 new for abilities and loadouts, incl. rewind with a bolt in flight), 22 browser, backend 118 (7 new).
- **Next: milestone A (your VRoid hunter) when the model and Mixamo clips are attached, else D (the boss).** The whole remaining plan is `docs/arena-build-guide.md` (milestones A-G and the production checklist). Start a new chat with `docs/next-session-prompt.md`; work on the `arena` branch.

## Arena: decisions waiting for you
- Milestone C balance (my picks, all one-line changes in `ArenaRules`): fresh hunter = 80 health / 85% damage, maxed = 120 / 115%; Fire bolt unlocked from Intellect 1 so you can try it now.
- Nav change (FYI, touches the System): labels show from 1280 px up, icons below. Alternative: drop the username from the header instead.
- Mouse: right click = heavy and F = guard were my picks (you asked for left click = attack); easy to swap in `input.js`.
- The hunter is a placeholder (KayKit, chibi). Your VRoid + Mixamo hunter replaces it.

## Later: arena combat game (original sketch, superseded by arena-design.md)
- Combat stats computed server-side from skills (Strength attack, Stamina HP, Discipline defense, Intellect ability power, Faith healing/resist, Affection support, Fortune crit/loot, Craft gear).
- Three.js arena, turn-based boss fights first, then PvP over WebSockets (Laravel Reverb).

## Open items
- Coach: working for real on his Gemini key (Nov 25). Dashboard shows the day's best suggestion; dismissed ones are not offered again.
- Google Calendar sync: first real test pending (needs his Google account added as a test user).
- Punishment mechanic: penalty quests, not XP loss (undecided).

## Decisions (Nov 24)
- AI coach: free provider first (Gemini free tier), can see all app data except Google Calendar, up to ~10 users when deployed.
- Skills: the nine listed above are approved; more can be added later.
