#!/bin/sh
set -e

echo "Ensuring uploads directory exists..."
mkdir -p /app/uploads/bills
echo "Uploads directory ready."

echo "Running database sync..."
npx prisma db push --accept-data-loss 2>/dev/null || npx prisma migrate deploy
echo "Database sync complete."

exec "$@"
