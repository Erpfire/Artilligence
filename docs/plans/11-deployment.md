# Deployment — Docker + Coolify

## Docker Setup

### Dockerfile (Multi-stage build)

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://artilligence:${DB_PASSWORD}@db:5432/artilligence
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=artilligence
      - POSTGRES_USER=artilligence
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U artilligence"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```

## Environment Variables

### `.env.example`
```env
# Database
DB_PASSWORD=your_secure_password_here
DATABASE_URL=postgresql://artilligence:your_secure_password_here@db:5432/artilligence

# NextAuth
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=generate_a_random_secret_here

# Admin Account (used by seed script)
ADMIN_EMAIL=admin@artilligence.com
ADMIN_PASSWORD=your_admin_password_here
```

## Coolify Deployment

### Setup Steps
1. Create a new project in Coolify
2. Connect GitHub repository (or use docker-compose)
3. Set deployment type to **Docker Compose**
4. Configure environment variables in Coolify dashboard
5. Set domain and SSL (handled by Coolify/Traefik)
6. Deploy

### Coolify Configuration Notes
- Build pack: Docker Compose
- Coolify handles SSL/TLS via Traefik
- Health check endpoint: `/api/health`
- Port: 3000

## Database Migrations

### Strategy
- Prisma migrations run automatically on container start (`prisma migrate deploy`)
- Seed script runs manually: `npx prisma db seed`
- Seed creates: admin account + default commission settings

### Backup
- Coolify can be configured with database backups
- Or manual: `docker exec <container> pg_dump -U artilligence artilligence > backup.sql`

## Health Check Endpoint

```typescript
// /api/health/route.ts
GET /api/health → { status: "ok", timestamp: "..." }
```

Used by:
- Docker health check
- Coolify monitoring
- Uptime checks
