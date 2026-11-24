# Google Calendar setup (about 10 minutes, once)

Mayhem talks to Google as *you*, through your own free Google Cloud project. Nothing is shared with anyone else.

1. Go to <https://console.cloud.google.com/> and create a project (name it "Mayhem").
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
3. **APIs & Services → OAuth consent screen** (may be called *Google Auth Platform*):
   - User type: **External**. App name: Mayhem. Support/developer email: your own.
   - Leave publishing status on **Testing**.
   - **Audience / Test users → Add users** → add the Google account whose calendar you want to sync.
   - Scopes: add `https://www.googleapis.com/auth/calendar`.
4. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs**: `http://localhost:8000/api/google/callback` (exactly this).
5. Copy the **Client ID** and **Client secret** into `backend/.env`:

   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

6. Run `php artisan migrate`, restart `php artisan serve`, open the **Calendar** page and press **Connect Google Calendar**.

Notes
- Google shows a "Google hasn't verified this app" warning because your project is in testing mode. Choose *Continue*: it is your own app.
- In testing mode Google expires the connection after 7 days. Press Connect again if Mayhem says it needs reconnecting. (Publishing the app to "In production" removes the limit; for a personal app you can do that without review.)
- Mayhem writes quests to a **separate calendar called "Mayhem"**. Your other calendars are only read.
- If the redirect address is different on your machine (another port), set `GOOGLE_REDIRECT_URI` to match the one in the Google console.
