# Mayhem — Setup Log

## Stack
- Backend: Laravel (API-only), MySQL via XAMPP
- Frontend: Vue 3 + Vite + Pinia + Vue Router, Tailwind CSS v4
- Auth (planned): Laravel Sanctum, SPA cookie-based

##[today's date]
- Scaffolded Laravel in `backend/`, Vue in `frontend/`
- Installed Sanctum (`composer require laravel/sanctum` + `php artisan install:api`)
- Connected XAMPP MySQL, ran first migration (users, sessions, sanctum tables)
- Set up Tailwind v4 in Vue via `@tailwindcss/vite`
- Published + configured `config/cors.php`:
  - `allowed_origins` → `http://localhost:5173`
  - `supports_credentials` → `true`
- Added to `backend/.env`:
  - `SANCTUM_STATEFUL_DOMAINS=localhost:5173`
  - `SESSION_DOMAIN=localhost`
- Known issue: `frontend/.npmrc` has `legacy-peer-deps=true` (oxlint/eslint-plugin-oxlint version conflict in the Vue scaffold — safe to ignore)


## Next session
- Build Sanctum SPA login/register endpoints
- Connect Vue login form to the API