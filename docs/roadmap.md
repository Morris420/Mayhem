# Mayhem roadmap (agreed Nov 24, 2026)

Docs in this folder:
- `system-guide.md` - what every feature does and how the code behind it works. Start here.
- `arena-design.md` - the combat game: scope, engine decision, combat maths, milestones.
- `arena-playbook.md` - the implementation brief for building it (conventions, three.js notes, gotchas).
- `ai-coach-setup.md`, `google-calendar-setup.md` - setting up the two optional integrations.

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

## Next session: the arena combat game
- Full plan, engine comparison, combat maths and milestones: docs/arena-design.md. Read it first.
- Blocker: this container cannot install npm packages. Turn on network access for package installs and start a NEW chat.
- Engine decided: three.js (+ Rapier). Real-time V1, code-built neon figures. See arena-playbook.md.

## Later: arena combat game
- Combat stats computed server-side from skills (Strength attack, Stamina HP, Discipline defense, Intellect ability power, Faith healing/resist, Affection support, Fortune crit/loot, Craft gear).
- Three.js arena, turn-based boss fights first, then PvP over WebSockets (Laravel Reverb).

## Open items
- Coach: working for real on his Gemini key (Nov 25). Dashboard shows the day's best suggestion; dismissed ones are not offered again.
- Google Calendar sync: first real test pending (needs his Google account added as a test user).
- Punishment mechanic: penalty quests, not XP loss (undecided).

## Decisions (Nov 24)
- AI coach: free provider first (Gemini free tier), can see all app data except Google Calendar, up to ~10 users when deployed.
- Skills: the nine listed above are approved; more can be added later.
