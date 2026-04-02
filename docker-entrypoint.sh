#!/bin/sh
set -e

echo "Running database sync..."
npx prisma db push --accept-data-loss 2>/dev/null || npx prisma migrate deploy
echo "Database sync complete."

exec "$@"
