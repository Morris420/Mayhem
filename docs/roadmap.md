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
- Engine decided: three.js + Rapier. Real-time V1, code-built neon figures. Plan: docs/arena-design.md; how-to: docs/arena-playbook.md.
- **M1 - it moves: DONE (Nov 25).** `/arena` page (nav: "Arena"), dark Training Hall with neon trim and bloom, locked third-person camera, a capsule that falls, walks (WASD / arrows) and collides with walls and pillars. Screenshot: docs/screenshots/arena-m1.png.
  - Deterministic fixed-step loop; `window.__arena` test hook with `?test=1` (step, state, input, seed, teleport, pixels, debug).
  - The simulation (`src/arena/sim.js`) runs headless, so it has Node unit tests: 12 in `src/arena/__tests__/sim.spec.js`.
  - Browser suite now lives in the repo: `cd frontend && npm run test:e2e` (14 tests: arena + nav at six widths). The old System e2e suite is not rebuilt yet.
  - Leaving the page frees the WebGL context (tested: two visits, 0 contexts left).
- **Next: decided at the start of the next session** (see arena-design.md §0). Proposed: M2 = the fighter kit vs a training dummy, on our own deterministic sim.

## Arena: decisions waiting for you
- **New direction (25 Nov, late): Tekken-style anime fighter, built for rollback netplay.** Read docs/arena-design.md §0 first: it proposes replacing Rapier with our own fixed-point fight simulation, a new milestone order (fighter kit -> look -> stats/abilities -> boss -> LAN 1v1 -> online -> free-for-all) and lists four decisions.
- **Bundle weight.** The arena chunk is 4.9 MB (1.8 MB gzipped), only loaded on /arena and cached after the first visit. three.js is ~150 KB gzipped; the rest is Rapier (3 MB of wasm, inlined as base64 by the `-compat` build). Options: (a) accept it for V1 - it never touches the rest of the app; (b) switch to the non-compat Rapier build and load the .wasm as a separate file (~30% smaller, needs a Vite wasm plugin); (c) drop Rapier for our own capsule-vs-box collision - the arena is boxes and capsules, so it is feasible, but we lose the character controller. Recommendation: (a) now, revisit at M5 polish.
- **Nav change (FYI, touches the System).** The nav already overlapped between 640 and 1024 px before the arena; adding the eighth link broke 1280 px too. Labels now show from 1280 px up; below that it is icons with tooltips. If you would rather keep labels on a laptop, the alternative is dropping the username from the header.

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
