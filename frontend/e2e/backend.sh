#!/usr/bin/env sh
# Boots the Laravel API for the browser suite against a throwaway SQLite file, so
# the tests never touch your real (MySQL) database. Started by playwright.config.js.
set -e
cd "$(dirname "$0")/../../backend"

# Real environment variables win over backend/.env, so these override your local
# settings for this process only. APP_KEY still comes from .env.
export APP_ENV=local
export APP_DEBUG=true
export DB_CONNECTION=sqlite
export DB_DATABASE="$PWD/database/e2e.sqlite"
export SESSION_DRIVER=file
export SESSION_DOMAIN=null
export CACHE_STORE=file
export QUEUE_CONNECTION=sync
export SANCTUM_STATEFUL_DOMAINS=localhost:4173

rm -f "$DB_DATABASE"
touch "$DB_DATABASE"
php artisan migrate:fresh --seed --force --no-interaction > /dev/null

# PHP's built-in server directly, not `artisan serve`: artisan serve drops most
# environment variables before starting the child, which would undo the above.
# It must start inside public/, where its router looks for index.php. The access
# log goes to a file so it does not drown the test output.
cd public
exec php -S 127.0.0.1:8000 ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php \
  2> ../storage/logs/e2e-server.log
