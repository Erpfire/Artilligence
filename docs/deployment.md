# Deployment Guide

## Quick Start (Docker Compose)

```bash
# 1. Copy and edit environment variables
cp .env.example .env
# Edit .env — change NEXTAUTH_SECRET, ADMIN_PASSWORD, POSTGRES_PASSWORD

# 2. Build and start
docker compose up -d --build

# 3. Seed the database (first time only)
docker compose --profile seed run --rm seed
```

The app will be available at `http://localhost:3000` (or the APP_PORT you set).

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | — | Random secret for session encryption |
| `NEXTAUTH_URL` | Yes | — | Public URL of the app |
| `APP_PORT` | No | 3000 | Host port to expose the app |
| `POSTGRES_USER` | No | artilligence | Database user |
| `POSTGRES_PASSWORD` | No | artilligence_dev | Database password |
| `POSTGRES_DB` | No | artilligence | Database name |
| `ADMIN_EMAIL` | No | admin@artilligence.com | Admin email for seed |
| `ADMIN_PASSWORD` | No | admin123456 | Admin password for seed |
| `ROOT_PASSWORD` | No | member123456 | Root member password for seed |

## Database Migrations

Migrations run automatically on container start via `prisma migrate deploy`. No manual steps needed.

To check migration status:
```bash
docker compose exec app npx prisma migrate status
```

## Seed Script

The seed script (`prisma/seed.ts`) creates:
- Admin account (configurable via `ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- Root member account (`root@artilligence.com`)
- 7-level commission settings (10%, 6%, 4%, 3%, 2%, 1%, 0.5%)
- 7 sample Exide battery products
- Default app settings (sale limits, bill code format)

Run seed:
```bash
docker compose --profile seed run --rm seed
```

The seed is idempotent (uses upserts) — safe to run multiple times.

## Backup Strategy

### Database Backup

```bash
# Manual backup
docker compose exec db pg_dump -U artilligence artilligence > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
cat backup.sql | docker compose exec -T db psql -U artilligence artilligence
```

### Automated Daily Backups (cron)

Add to host crontab (`crontab -e`):
```
0 2 * * * cd /path/to/artilligence && docker compose exec -T db pg_dump -U artilligence artilligence | gzip > /backups/artilligence_$(date +\%Y\%m\%d).sql.gz
```

### Upload Files Backup

Uploaded bill photos are stored in the `uploads` Docker volume. Back up with:
```bash
docker run --rm -v artilligence_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .
```

### Retention

Keep at least 7 daily backups and 4 weekly backups. Rotate old backups:
```bash
find /backups -name "artilligence_*.sql.gz" -mtime +30 -delete
```

## Production Checklist

- [ ] Change `NEXTAUTH_SECRET` to a strong random value (`openssl rand -base64 32`)
- [ ] Change `POSTGRES_PASSWORD` to a strong password
- [ ] Change `ADMIN_PASSWORD` to a strong password
- [ ] Set `NEXTAUTH_URL` to the actual public URL
- [ ] Set up automated database backups
- [ ] Configure reverse proxy (Nginx/Caddy) with SSL
- [ ] Set up monitoring for the `/api/health` endpoint

## Health Check

The app exposes `GET /api/health` which returns:
- `200` with `{"status":"healthy","database":"connected"}` when everything is working
- `503` with `{"status":"unhealthy","database":"disconnected"}` when the database is unreachable

Docker uses this endpoint for container health monitoring.

## Coolify Deployment

1. **Create new project** in Coolify dashboard
2. **Add resource** → Docker Compose
3. **Connect repository** — point to the Git repo
4. **Set environment variables** in Coolify:
   - `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL` — set to the domain Coolify assigns (e.g. `https://artilligence.yourdomain.com`)
   - `POSTGRES_PASSWORD` — strong password
   - `ADMIN_PASSWORD` — strong admin password
5. **Deploy** — Coolify will build and start the containers
6. **After first deploy**, seed the database:
   ```bash
   # SSH into server or use Coolify terminal
   docker compose --profile seed run --rm seed
   ```
7. **Set up domain** — configure DNS A record pointing to your Coolify server
8. **Enable SSL** — Coolify handles Let's Encrypt automatically

### Coolify-specific notes:
- Coolify uses Traefik as reverse proxy — SSL is automatic
- The `uploads` volume persists across deploys
- The `pgdata` volume persists across deploys
- Database port is NOT exposed externally (only accessible within Docker network)
- Redeployments automatically run migrations via the entrypoint script

## Local Development (without Docker)

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

## Local Development (with Docker)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

This mounts the source code, exposes the DB on port 5434, and runs the dev server with hot reload.
