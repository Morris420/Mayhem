# AI quest coach

The Coach page reads your Mayhem data and suggests quests. It needs a key from an AI
provider. Google's Gemini has a free tier, so that is the default.

## The quick way (Gemini, free)

1. Go to <https://aistudio.google.com/apikey> and sign in with a Google account.
2. Press **Create API key**. Copy it.
3. Open `backend/.env` and fill in:

   ```
   COACH_PROVIDER=gemini
   GEMINI_API_KEY=your-key-here
   GEMINI_MODEL=gemini-3.1-flash-lite
   ```

4. Restart the backend (`php artisan serve`). The Coach page stops showing the setup card.

No credit card is needed for the free tier. Google does not publish a fixed free-tier table
any more: the limits that apply to your own key are shown in AI Studio under
[Rate limits](https://aistudio.google.com/rate-limit). They are counted per Google *project*,
not per person using Mayhem, so everyone on your server shares one allowance. The app's own
daily caps (below) are what keep that allowance from being eaten in one afternoon.

Free-tier keys let Google use what you send to improve their models. For a diary-like app
that matters: see "Privacy" below.

### Which model

- `gemini-3.1-flash-lite` (default): cheapest and fastest, plenty for quest suggestions.
- `gemini-3.5-flash`: noticeably better at reading between the lines of your history, but it
  uses up a free allowance faster.

Change `GEMINI_MODEL` and restart; nothing else has to change.

## Another provider

Anything that speaks the OpenAI chat format works: OpenRouter, Groq, Together, OpenAI itself,
or a model running on your own machine through Ollama or LM Studio.

```
COACH_PROVIDER=openai
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=meta-llama/llama-4-scout
```

For a local Ollama: `OPENAI_BASE_URL=http://localhost:11434/v1`, `OPENAI_API_KEY=ollama`,
`OPENAI_MODEL=llama3.1`. Nothing leaves your machine then, and there are no limits at all,
but a small local model writes duller quests.

To add a provider in code, write a class that implements `App\Support\Coach\CoachProvider`
(two small methods plus `json()`) and add it to the `match` in `AppServiceProvider::register`.
Everything else — the prompt, the data, the quest rules — stays as it is.

## Limits

Per person, per day, set in `backend/.env`:

```
COACH_DAILY_MESSAGES=25   # messages, including the daily briefing
COACH_DAILY_QUESTS=10     # suggestions you can accept
```

The daily briefing is written on your first visit of the day and then cached, so opening the
page ten times costs one call. With ten people on a server, 25 messages each is the worst case
of 250 calls a day; in practice it is far lower.

## What the coach can see

Everything in Mayhem except Google Calendar: your "about me" profile, level and rank, all nine
skills, your quest library with how often and how recently you did each one, the next 7 days,
21 days of completion history, gym exercises with best and latest lifts, nutrition goals and
your last 10 logged days, achievements, and the **names** of Briefcase files.

It never sees what is inside a Briefcase file, and it never sees your Google Calendar events:
those are other people's meetings and holidays, and they only muddy the suggestions.

## What it can and cannot do

It can only talk and propose. Every quest it suggests sits in a card until you press **Accept**,
and only then is a real quest created. Everything it sends back is checked by the server
first: unknown tiers, unknown skills, dates in the past and quests you already have are
dropped before you ever see them.

## Privacy

What you send to a hosted provider leaves your machine. On Google's free tier that content can
also be used to improve their models (paid tiers are excluded). The profile text and your
quest history are personal, so:

- keep anything you would not want read out of the profile text, or
- use a paid key, or
- run a local model through Ollama, where nothing leaves the machine.

## Troubleshooting

| What you see | What it means |
| --- | --- |
| "The coach is not set up yet" | No key in `backend/.env`, or the backend was not restarted. |
| "Gemini refused the API key" | The key is wrong, or it belongs to a project without the Gemini API enabled. |
| "Gemini's free limit for today is used up" | The free allowance is spent. It resets on Google's clock (midnight Pacific). |
| "That is your 25 coach messages for today" | Mayhem's own cap, not Google's. Raise `COACH_DAILY_MESSAGES`. |
| "The coach is still thinking about your last message" | Two requests at once. Wait a second and try again. |
