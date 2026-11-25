# Mayhem — the complete guide

What every part of the application does, why it exists, and how the code behind it is put
together. Written to be read straight through by someone who has never seen the repository.

Last updated: 25 November 2026 (arena M1). If a detail here disagrees with the code, the code is right —
tell me and I will fix the document.

---

## 1. What Mayhem is

Mayhem is a personal productivity system dressed as the "System" from *Solo Leveling*: the app
that follows the protagonist around, hands him quests, awards experience, and ranks him from E
to S as he gets stronger.

The joke is that the fiction is doing real work. Habit trackers fail because logging is a chore
with no payoff. Mayhem pays you for the logging — every workout, every meal that hits its
targets, every finished task moves a number that is visible on the front page. The theme is not
decoration; it is the reward schedule.

It is built for one person who uses it daily, with a path to three to ten people later. It is
also a teaching project: the author is an experienced engineer returning to development, so the
code is written to be read, with comments that explain *why* rather than *what*.

**The shape of the thing.** A hunter has quests. Finishing a quest grants XP, which raises a
level, which raises a rank. Quests also train one of nine skills, which level on their own
curve. Workouts and meals feed the same machine without any quests at all. Achievements unlock
from either. An AI coach reads all of it and proposes new quests.

---

## 2. Running it

```bash
# backend
cd backend
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate --seed
php artisan serve                 # http://127.0.0.1:8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

Open <http://localhost:5173> and register. There is no email and no verification: a username
and a password create an account and log you straight in.

Two optional integrations have their own setup documents: `docs/google-calendar-setup.md` and
`docs/ai-coach-setup.md`. Everything else works with no keys.

In development the browser only ever talks to `localhost:5173`. Vite forwards `/api` and
`/sanctum` to Laravel (`vite.config.js`), which keeps the session cookie first-party and avoids
CORS entirely. In production the two are served from one origin.

**Versions.** PHP 8.3, Laravel 13, Sanctum 4. Vue 3.5, Vite 8, Pinia, Vue Router, Tailwind 4.
MySQL in development (XAMPP), SQLite in the test suite. Roughly 5,200 lines of PHP and 4,600
lines of Vue/JavaScript, plus 111 backend tests.

---

## 3. Architecture

Two applications that share nothing but an HTTP contract.

```
Browser
  │
  ├── Vue 3 SPA ............ pages, state, rendering
  │     stores/ (Pinia)  ← the only place that calls the API
  │     lib/api.js       ← fetch wrapper: cookies, CSRF, errors
  │
  └── Laravel 13 API ....... every rule, every number, every permission
        Controllers ....... validate input, call a service, shape a response
        Support/ .......... the actual logic: Progression, SkillService, QuestPlanner…
        Models ............ Eloquent, thin
        MySQL
```

**Why decoupled.** The frontend is replaceable and the API is reusable: a phone app or the
coming arena game talks to the same endpoints. It also forces a discipline that pays off when
the browser stops being trustworthy — in the game, and in any future multi-user deployment.

**The rule that matters most: the client never decides anything that counts.** The browser does
not send how much XP a quest is worth, it sends "I finished quest 12". The server looks up the
tier, computes the XP, writes the ledger row, and sends back the new state. Every controller in
this codebase follows that pattern, and it is why the game can later trust the same backend.

**The response shape.** Most endpoints return the *whole* slice of state they touch rather than
a diff — completing a quest returns the user, the day, and what was unlocked. Stores replace
their state wholesale. This removes a whole category of bug where the screen and the database
drift apart, at the cost of slightly larger responses. For a single-user app that is a trade
worth making every time.

### A request, end to end

Completing a quest:

1. `TodayList.vue` emits `complete(12)`.
2. `stores/game.js` calls `api.post('/tasks/12/complete')`.
3. `lib/api.js` makes sure an `XSRF-TOKEN` cookie exists (fetching `/sanctum/csrf-cookie` if
   not), echoes it in a header, and sends the cookie-authenticated request.
4. `TaskController::complete` loads the quest *through the logged-in user's relation*, so another
   user's quest is a 404 rather than a permission check that someone forgets to write.
5. Inside a transaction: refuse if it is not scheduled for today, refuse a second completion,
   write a `task_completions` row, increment the user's XP, unlock the linked achievement if
   every quest pointing at it is now done.
6. `SkillService::refresh` turns that completion into skill XP and reports any skill that
   levelled.
7. The response carries the new user, what was unlocked, and the level-ups. The store swaps in
   the new state and the toast stack announces the rest.

---

## 4. The data model

```
users ──┬── tasks ──── task_completions
        │     └── (skill_id, achievement_id)
        ├── achievement_user (pivot, unlocked_at)
        ├── skill_xp ................ one row per XP event, unique by (user_id, ref)
        ├── exercises ── exercise_logs
        ├── foods, meal_entries
        ├── checklist_items ── checklist_checks
        ├── briefcase_items ......... self-referencing tree (parent_id)
        ├── google_connection, google_events, google_pushed
        └── coach_messages ── coach_proposals

skills ......... the nine, seeded, shared by everyone
achievements ... built-in (user_id null) + per-user custom ones
```

Three decisions worth calling out:

**Soft deletes on quests.** Deleting a quest hides it but keeps its completions, so history and
XP never retroactively change. A deleted quest still counts in the "cleared by tier" chart.

**Skill XP is a ledger, not a counter.** Every award is a row with a `ref` such as `q:41`
(completion 41), `g:2026-11-20` (a workout that day), `gp:88` (a personal record) or
`d:2026-11-20` (a day on target), with a unique index on `(user_id, ref)`. Levels are derived by
summing. This makes awards idempotent — `refresh()` can run on every request without ever
double-paying — and lets gym and diet XP be *withdrawn* when the underlying log is deleted.
Quest XP is never withdrawn, because you did do the thing.

**Migrations are written to be re-runnable.** Every migration guards with `hasTable` /
`hasColumn`. MySQL cannot roll back a failed DDL statement, so a half-applied migration used to
mean a manual repair; the guards make a re-run safe.

---

## 5. The features

### 5.1 Accounts

Username and password, nothing else. No email, no verification, no reset flow. For a personal
tool, an email field is a question you have to answer every time you make a test account, in
exchange for a recovery path you will never use.

Sessions are Laravel's own, over Sanctum's SPA mode: a httpOnly session cookie plus a CSRF token
that the client echoes in a header. There are no API tokens in the browser, so there is no token
for a cross-site script to steal.

`AuthController` returns the same message for "no such user" and "wrong password", so the login
form cannot be used to discover which usernames exist.

*Code:* `AuthController`, `stores/auth.js`, `lib/api.js`, `router/index.js` (the guard that asks
"who am I?" once per page load and redirects to `/login`).

### 5.2 Quests — the core loop

A quest is a thing you intend to do, with a difficulty tier from E to S. The tier alone decides
the XP: E 10, D 25, C 50, B 100, A 200, S 400. The client never sends an XP number.

A quest is scheduled in exactly one of three ways, and the mode is derived, not stored as a flag:

| Mode | Stored as | Behaviour |
|---|---|---|
| **recurring** | `recurrence` = ISO weekdays `[1,3,5]` + `starts_on` | appears on those weekdays, can be completed once per day, forever |
| **dated** | `scheduled_date` | appears on that day; if missed, it follows you to today marked *overdue* |
| **floating** | neither | a to-do: sits on today's list until it is done once, then settles on the day it was done |

`starts_on` exists so that adding Monday to a quest next week does not retroactively claim you
failed every Monday since you created it.

`QuestPlanner` is the one place that answers "what is on day X?", shared by the dashboard, the
calendar and the day journal, so those three can never disagree. It takes all of a user's quests
and completions in two queries and resolves each day in memory, rather than querying per day.

*Code:* `Task`, `TaskCompletion`, `TaskController`, `QuestPlanner`, `TaskResource`,
`QuestBuilderView.vue`, `TodayList.vue`, `ScheduleEditor.vue`, `stores/game.js`.

### 5.3 Progression: XP, levels, ranks

`Progression` holds every number: the tier table, the level curve (`100 × (L−1) × L / 2`, so
level 2 costs 100 XP and level 10 costs 4,500), and the rank bands — E below 5, D at 5, C at 10,
B at 20, A at 35, S at 50 — each with a title from "Unawakened Novice" to "Shadow Monarch".

Everything progression-related is derived from one stored integer, `users.xp`. There is no
`level` column to fall out of sync.

*Code:* `Progression`, `UserResource`, `lib/ranks.js`, `HunterBanner.vue`. Unit-tested in
`tests/Unit/ProgressionTest.php`.

### 5.4 Achievements

Two kinds, in one table.

**Quest-linked.** You attach quests to an achievement; it unlocks when every attached quest has
been completed at least once. "Golden Medal: Marathon" waits for the quests you decided amount
to running a marathon. Users can create their own, with a name, icon and tier.

**Automatic.** Sixteen built-ins carry a `rule` and a `threshold` and unlock from your logged
data with no quest involved: `gym_sessions`, `gym_records`, `gym_week_days`, `diet_days_ok`,
`diet_streak`. "Five-a-Week" needs five training days inside one ISO week; "Unbroken Fuel" needs
thirty consecutive days on nutrition target.

`AchievementEngine::metrics` recomputes all five numbers from history on every call — a personal
dataset is small, and recomputation means an achievement added later unlocks retroactively from
data logged before the rule existed. `evaluate()` is called after anything that could move a
number, and returns what was newly unlocked so the UI can celebrate it.

*Code:* `Achievement`, `AchievementEngine`, `AchievementSeeder`, `AchievementController`,
`AchievementGrid.vue`.

### 5.5 Skills

Nine skills, levelled in the style of *Old School RuneScape*: Strength, Stamina, Discipline,
Intellect, Literacy, Faith, Affection, Fortune, Craft.

**The curve.** RuneScape's own formula, where each level costs about 10% more than the last,
divided by a constant (`SkillCurve::SCALE = 40`) to fit one person's real week. Level 5 costs 9
XP, level 20 costs 111, level 50 costs 2,533, level 99 costs 325,860. Early levels arrive in
days; the top is a multi-year road. Raising or lowering `SCALE` retunes the whole game, and
because levels are derived from the ledger, changing it re-levels everyone instantly with no
migration.

**Where XP comes from.**

| Source | Goes to | Amount |
|---|---|---|
| Completing a quest | the quest's skill (default Discipline) | the quest's tier XP |
| A day with any workout logged | Strength | 30 |
| Beating your own best on a lift | Strength | 15 |
| A day hitting both nutrition goals | Stamina | 25 |

**Total level** is the sum of all nine, shown on the hero banner — the single number that says
"how far along is this person", the way it does in RuneScape.

`SkillService::refresh` rebuilds what you *should* have from history, inserts what is missing,
and removes gym and diet rows whose source no longer exists. It is called after every action
that could matter and on dashboard load, which is how skills caught up retroactively the moment
the feature shipped.

*Code:* `Skill`, `SkillXp`, `SkillCurve`, `SkillService`, `SkillSeeder`, `SkillsPanel.vue`,
`lib/skills.js`.

### 5.6 Gym tracker

Exercises have a name, a body part, the weekdays they are scheduled on, and an optional weight
goal with a date. One log per exercise per day; logging the same day again edits it.

The page shows a 7-day strip with body-part icons, a card per exercise with its best and most
recent lift, and progress toward the goal. `GymPlanner::days` answers "what is planned and what
was done" for a date range, and is shared with the calendar.

**The physique figure** is the part people notice. It is an SVG drawn entirely in code — no
image asset — of a front-view male silhouette: dark blue body, glowing cyan edge. It has five
stages, from Beginner to Titan, at 0, 6, 20, 45 and 90 training days, and it does not jump
between them: a single parameter `t` runs 0 → 1 across the whole range and every coordinate is
interpolated, so the body thickens slightly with each workout you log. Muscle definition lines
fade in on their own schedule as `t` rises.

The geometry is built from Catmull-Rom curves through named anatomical points (temple, jaw
angle, trapezius, iliac crest, …), mirrored down the centre line. The outline is stroked first
and then covered by the fills, so only the outer silhouette glows — which is also why the neck
must never be wider than the jaw, or it visibly steps out of the head.

*Code:* `Exercise`, `ExerciseLog`, `GymController`, `GymPlanner`, `PhysiqueFigure.vue`,
`ExerciseCard.vue`, `ExerciseForm.vue`, `BodyPartIcon.vue`, `stores/gym.js`.

### 5.7 Nutrition

Daily calories and protein against a goal. Foods come from **Open Food Facts**, a free open
database with no API key.

The search goes through the Laravel server rather than the browser: no CORS problem, a proper
User-Agent as they ask, and a day-long cache per query so a free service is not hammered. It
tries their current search service and falls back to the older one, understanding both response
shapes, because the newer one is occasionally unavailable.

A food is stored on first use, so your own list of foods builds up and the twelve most recent
are one click away. Entries record grams plus the per-100g values *at the time*, so correcting a
food later does not rewrite history.

**`DietRules` is the single definition of a good day**: calories within ±10% of goal and protein
at or above goal. The diet page, the calendar badge, the automatic achievements and the Stamina
XP all call it, so they can never disagree about what counts.

A short daily checklist (vitamins, fruit, vegetables by default, up to twelve) handles the
things that are not worth weighing.

*Code:* `Food`, `MealEntry`, `ChecklistItem`, `ChecklistCheck`, `NutritionController`,
`FoodSearch`, `DietRules`, `NutritionView.vue`, `FoodPicker.vue`, `MacroBar.vue`.

### 5.8 Calendar and the day journal

A seven-day grid, roughly 90% of the viewport height, with a real time axis for timed Google
events, an all-day band above it, and your quests, workouts and diet badge per day. The current
timezone is displayed, because a calendar that silently disagrees with your phone is worse than
no calendar. On a phone it collapses to a single day with two arrows.

Clicking any day opens the **day journal**: one request to `/api/days/{date}` returns everything
that happened on that day — quests planned and completed, workouts with weights, food with
totals and whether the day was on target, achievements unlocked, and calendar events. It is the
"what did I actually do on the 14th" view, and it is the page a weekly report will later be
built from.

*Code:* `CalendarController`, `DayController`, `CalendarView.vue`, `DayDetail.vue`.

### 5.9 Google Calendar (two-way sync)

Optional. Needs a Google Cloud project; `docs/google-calendar-setup.md` has the steps.

**Pull.** Your selected calendars are read for a window of 14 days back to 60 days ahead and
cached in `google_events`, so the calendar page is fast and works offline.

**Push.** Quests for the next 28 days become all-day events in a separate calendar named
"Mayhem" — never your real ones, so nothing Mayhem does can damage your actual schedule. Events
are transparent (they do not make you "busy") and carry no reminders. Completed quests get a ✓
in the title.

**Back again.** Drag a quest's event to another day in Google and the next sync moves the quest.
Delete the event and Mayhem does not recreate it. A moved occurrence of a *recurring* quest is
ignored on purpose — the weekly pattern is the source of truth there.

Four things this feature taught us, all now in the code:

- **"Missing from the list" does not mean "deleted".** The list only covers the sync window, so
  an event dragged 90 days out vanished from it and was treated as deleted — the quest silently
  stopped syncing and the new date was lost. The calendar is now listed with `showDeleted=true`
  (real deletions come back as `status: cancelled`) and anything merely absent is fetched by id
  before any conclusion is drawn.
- **Two syncs at once create duplicates.** A double click could have two syncs both find no row
  and both create the event, leaving an orphan in Google and a unique-index crash. A per-user
  cache lock now makes the second one return a clean 409.
- **OAuth `state` alone is not enough.** The callback is a public route with no session, so
  `state` identified the user — which meant an attacker could start a connection on their own
  account and send the link to a victim, attaching the victim's calendar to the attacker's
  account. The state is now also set as a short-lived cookie and must match, so the sign-in has
  to finish in the browser that started it.
- **Never put a server string in the UI.** The callback used to pass the raw error into the
  redirect, which the frontend displayed — so a crafted link could print arbitrary text inside
  your own interface. It now sends a code (`expired`, `mismatch`, `failed`) and the frontend owns
  the wording.

Tokens are stored encrypted. Refresh tokens are kept so sync works without you signing in again;
while the Google project is in testing mode they expire after seven days.

*Code:* `GoogleClient` (OAuth and HTTP), `GoogleCalendarSync` (the sync itself),
`GoogleController`, `GoogleConnection`, `GoogleEvent`, `GooglePushed`, `GooglePanel.vue`,
`stores/google.js`. Fully covered by `GoogleCalendarTest` against a faked Google.

### 5.10 Briefcase

A small Finder: folders, uploaded files, and links to documents that live elsewhere.

Files are stored on a **private** disk (`storage/app/private`), never in `public/`, and are
served only to their owner through a controller. Uploads are limited to a whitelist of
extensions, 25 MB per file and 500 MB per user, and are served with the content type *we* decide
from the extension, never the one the browser claimed.

**Opening a spreadsheet** turned out to be the interesting problem. A browser cannot launch a
desktop application from a link, so every click downloads another copy. The current compromise is
a menu item that hands the file to Office through the `ms-excel:ofe|u|<url>` scheme using a
short-lived signed URL — that URL is the one public route in the app, valid for minutes and tied
to a single file. It is marked beta because it depends on the desktop having Office. For a sheet
you edit daily, a link item pointing at Google Sheets avoids the problem entirely.

*Code:* `BriefcaseItem`, `BriefcaseController`, `BriefcaseView.vue`.

### 5.11 The AI coach

A coach that reads your Mayhem data, talks back, and proposes quests. Setup is in
`docs/ai-coach-setup.md`.

**Provider-agnostic.** `CoachProvider` is an interface with three methods. `GeminiProvider` is
the default because Google's free tier needs no card; `OpenAiCompatibleProvider` covers
OpenRouter, Groq, OpenAI and a local Ollama. `AppServiceProvider` picks one from a single line in
`.env`. Nothing above that interface knows which model is answering.

**What it sees.** `HunterContext` builds one block of text: your profile, level and rank, all
nine skills with their slugs, your quest library with how often and how recently each was done,
the next seven days, twenty-one days of completion history, gym exercises with best and latest
lifts, nutrition goals and your last ten logged days, achievements, Briefcase file *names*, and
the suggestions you have turned down. It never sees inside a file, and it never sees your Google
Calendar — those are other people's meetings and holidays and they only muddy the suggestions.

**What it remembers.** Three different things, which is worth being precise about:

- the **profile** — your own description of your goals and how hard to push you — is permanent
  and re-read before every single answer;
- the **data context** above is rebuilt live each time, so "what have I actually been doing" is
  never stale;
- the **conversation** persists until you clear it, but only the last twelve messages are sent
  to the model, so a specific instruction buried in an old chat will eventually scroll out. That
  is why anything permanent belongs in the profile.

**It cannot touch the database.** Suggestions land in `coach_proposals` with status `pending`
and become real quests only when you accept one. Everything the model returns is treated as
input from a stranger: unknown tiers, unknown skills, empty titles, dates in the past and quests
you already have are all dropped before you see them, and at most four survive per answer.

**Cost control.** The daily briefing is generated on your first visit of the day and then cached,
so opening the page ten times costs one API call. Per person per day there is a cap on messages
(25) and on accepted quests (10), both set in `.env`. A per-user lock stops a double click
spending two calls.

The dashboard shows the day's highest-XP pending suggestion with an Accept button, so the common
case never requires opening the Coach page at all.

*Code:* `CoachProvider`, `GeminiProvider`, `OpenAiCompatibleProvider`, `QuestCoach` (the prompt,
the schema, the validation), `HunterContext`, `CoachController`, `CoachMessage`, `CoachProposal`,
`CoachView.vue`, `stores/coach.js`.

### 5.12 The dashboard

One request, `/api/dashboard`, returns everything: the user, today's plan, stats, the skills, the
tier breakdown, 14 days of activity, the achievement catalog with progress, and the coach's best
suggestion.

The **hero banner** changes with your rank. The frame colour, the glow, a faint hex lattice at C
and above, a sweeping sheen at B, and rising embers at A and S. It shows the level ring, the rank
ladder with how many levels to the next band, your four best medals, total skill level, and the
streaks. The point is that it visibly becomes more impressive as you progress, so the front page
rewards you before you do anything.

Below it a **today brief** summarises quests, gym, nutrition and calendar in one row, and the
rest of the page is the working surface: today's list, the activity chart, achievements, skills,
tier bars, and the physique figure linking to the gym.

*Code:* `DashboardController`, `DashboardView.vue`, `HunterBanner.vue`, `TodayBrief.vue`,
`ActivityChart.vue`, `CompletionRing.vue`, `TierBars.vue`, `lib/ranks.js`.

---

### 5.13 The arena (in progress)

A 3D fighting game on its own page, where the nine skills become combat stats. Built with
three.js (rendering) and our own deterministic physics, loaded only when you open `/arena`. The plan is in
`docs/arena-design.md`, the implementation brief in `docs/arena-playbook.md`.

**Done so far (M1, M2):** a dark Training Hall with neon trim and ledges, a locked third-person
camera, and a hooded hunter (a CC0 model, placeholder) you move with WASD, sprint with Shift and
jump with Space; in mid-air you can cling to a wall and kick off it. The game runs on a fixed
1/60 s step in plain JavaScript (`src/arena/`) on our own deterministic physics, so the same
inputs give the same result on every machine — the foundation for online fights. Vue only shows
a small HUD the game updates five times a second. With `?test=1` nothing moves on its own and
tests drive it step by step through `window.__arena`.

*Code:* `ArenaView.vue`, `src/arena/` (`engine`, `sim`, `physics`, `player`, `loop`, `world`,
`figure`, `input`, `rooms/`). Assets and licences: `docs/arena-assets.md`.

---

## 6. Cross-cutting concerns

**Authorisation by relation.** Nearly every controller loads records through
`$request->user()->things()` rather than `Thing::find()`. Another user's record is then simply
not found, which cannot be forgotten the way an explicit ownership check can. A test asserts
that every route requires a login.

**Validation at the edge.** Controllers validate with Laravel's validator and nothing else is
trusted. Enumerations come from the single source — tiers from `Progression::TIER_XP`, icons from
`Achievement::ICONS`, extensions from `BriefcaseItem::TYPES` — so adding a tier cannot leave a
validation rule behind.

**Errors the user can act on.** `describeError` in the frontend turns a 5xx into "the server hit
an error — if you just pulled new code, run `php artisan migrate`", and a failed fetch into
"check that `php artisan serve` is running". These are the two things that actually go wrong in
this project, and saying so saves a debugging session.

**Time.** Everything runs in `Europe/Amsterdam` via `app.timezone`. Dates are handled as `Y-m-d`
strings and compared as dates, never as timestamps. The frontend never uses `toISOString()` to
get "today", because it returns the UTC day and is wrong after 01:00 local — a bug that bit the
test harness the moment we crossed midnight. *Known limit: the timezone is global, not per user.
That is the first thing to fix before other people use the app.*

**Testing.** 111 backend tests cover each feature's behaviour, not its implementation: the quest
lifecycle, scheduling edge cases, auto-achievements, nutrition, gym, Briefcase limits and
permissions, Google sync against a faked Google, and the coach against a fake provider plus a
faked Gemini to prove the request shape. The browser suite (Playwright) lives in
`frontend/e2e/` and runs with `npm run test:e2e`: it boots Laravel on a throwaway SQLite file,
serves the built app, and fails on any console error, failed request or 5xx. Today it covers the
arena and the nav at six widths; the earlier System walkthrough (register, quests, workout, food,
calendar, coach) lived outside the repo and is still to be rebuilt there. Frontend unit tests
cover the API client, the chart and the arena simulation.

**Code conventions.** Models are thin and declare fillable fields with the PHP attribute
`#[Fillable([...])]`. Logic lives in `app/Support`. Numbers that might be tuned live in a class
of constants (`Progression`, `SkillCurve`, `DietRules`, `AchievementEngine`). Comments explain
intent. Pint formats PHP; Prettier and ESLint handle the frontend. Icons are inline SVG paths in
one component rather than an icon library, and charts are hand-drawn SVG. The app itself has
three runtime dependencies (Vue, Pinia, Vue Router); the arena adds three.js, which only loads
on its page.

---

## 7. Deliberately not there

- **A punishment mechanic.** Intended as penalty quests rather than XP loss; still undecided.
  Taking XP away from someone who had a bad week is how you get them to stop opening the app.
- **Deployment.** Still local. Needed before the Briefcase holds real finances and before
  anything multiplayer.
- **Per-user timezones**, a weekly report, JSON export, rest-day-aware streaks, and a PWA install
  — all queued for the wrap-up session.
- **The rest of the arena** (M2–M5: the hunter figure, real stats, the boss, rewards). See 5.13.

---

## 8. Where to change things

| To change… | Edit |
|---|---|
| XP per tier, the level curve, rank bands and titles | `app/Support/Progression.php` |
| How fast skills level | `SkillCurve::SCALE` |
| What gym and diet pay into skills | the constants at the top of `SkillService` |
| What counts as a good diet day | `DietRules::KCAL_MARGIN` |
| Achievements and their rules | `database/seeders/AchievementSeeder.php` |
| Physique stages and thresholds | `GymPlanner::STAGES` |
| The figure's anatomy | `PhysiqueFigure.vue` — named points, lean → buff pairs |
| Rank colours and glow | `frontend/src/lib/ranks.js` |
| Skill colours | `frontend/src/lib/skills.js` |
| The coach's personality and rules | the prompt in `QuestCoach::systemPrompt` |
| Coach provider, model and daily caps | `backend/.env` |
| Google sync window and push horizon | the constants at the top of `GoogleCalendarSync` |
| Briefcase file types and limits | the constants at the top of `BriefcaseItem` |
