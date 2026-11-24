# Mayhem roadmap (agreed Nov 24, 2026)

Goal: finish and polish the System in 1-2 days of sessions, then build the arena combat game (domains, bosses, PvP) over about 5 weeks.

## Session 1: Skills engine (OSRS-style levels)
- Catalog of skills + per-user XP ledger. Every XP source (quest, gym log, diet day, achievement, later briefcase/AI quests) writes a ledger row tied to a skill.
- OSRS-shaped XP curve, scaled to personal pace (tunable constant), cap 99. Total level = sum of skill levels.
- Quests get a skill (picker in quest builder, default Discipline). Backfill old completions.
- Skills list on dashboard; level-up toasts per skill.
- Skills (9): Strength, Stamina, Discipline, Intellect, Literacy, Faith, Affection, Fortune (money), Craft (building/career).

## Session 2: AI quest coach
- Hunter profile (big text: goals, status, how to be challenged) stored in the database.
- Chat that only creates quests: model returns structured quest proposals, you accept or reject.
- Daily generation (lazy on first open of the day), hard cap on messages/quests per day.
- Context: profile, recent completions, skill levels, optionally gym/diet/calendar (toggles).
- Provider pluggable: Claude Haiku (API key), Gemini free tier, or Ollama locally.

## Session 3: Briefcase
- Finder-style page: folders, upload (xlsx, csv, pdf, docx, images), rename, delete, replace with new version.
- Link items: a Google Sheets/Drive/OneDrive URL opens straight in the web app (best for sheets you edit daily).
- Files stored on a private disk, only served to the logged-in owner.

## Session 4: Hero banner
- LoL-style hunter card: rank frame that evolves, total level, skill radar, titles, streak, cosmetics unlocked by achievements.
- Data model + placeholder first; final look comes from his design.

## Session 5: Wrap-up
- Weekly System report, daily reflection note in the day journal, JSON export/backup, rest-day-aware streaks, PWA install, polish.
- Deployment decision (needed before Briefcase holds real finances and before PvP).

## Later: arena combat game
- Combat stats computed server-side from skills (Strength attack, Stamina HP, Discipline defense, Intellect ability power, Faith healing/resist, Affection support, Fortune crit/loot, Craft gear).
- Three.js arena, turn-based boss fights first, then PvP over WebSockets (Laravel Reverb).

## Open items
- Google Calendar sync: first real test pending (needs his Google account added as a test user).
- Punishment mechanic: penalty quests, not XP loss (undecided).
