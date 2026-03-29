# Flaky Playwright Test Issue

## Problem Summary

The full Playwright E2E suite has **192 tests**. When run individually or in small batches, **all 192 pass**. When run together as a full suite (`npx playwright test`), **2-7 tests fail intermittently** — different tests each run.

## Project Setup

### Tech Stack
- **Framework:** Next.js 14 (App Router) with TypeScript
- **Database:** PostgreSQL via Prisma 6 ORM
- **Auth:** NextAuth v4 with credentials provider
- **Tests:** Playwright (E2E), Vitest (unit)
- **Everything runs in Docker** via `docker-compose.yml`

### Docker Containers
- **App container** (`artilligence-app-1`): Next.js dev server on port 3000 (mapped to host port 3005)
- **DB container** (`artilligence-db-1`): PostgreSQL on port 5432 (mapped to host port 5434)
- Database name: `artilligence`, user: `artilligence`

### How to Start
```bash
docker compose up -d --build    # Build and start both containers
docker compose logs app --tail 5  # Check app is ready ("Ready in Xms")
```

### How Tests Connect to DB
Tests do NOT use Prisma. They run SQL directly via Docker exec:
```bash
docker compose exec -T db psql -U artilligence -d artilligence -t -A -c "SELECT ..."
```
This is wrapped in the `dbQuery()` function in `e2e/helpers.ts`.

### How Tests Connect to App
Tests hit the app via browser at `http://localhost:3005` (set in `playwright.config.ts` as `baseURL`).

### Seed Data (always present)
- Admin user: `admin@artilligence.com` / password `admin123456`
- Root member: `root@artilligence.com` / password `member123456`
- 7 products (Exide batteries)
- Commission settings (L1=10%, L2=6%, L3=4%, L4=3%, L5=2%, L6=1%, L7=0.5%)
- App settings (daily_sale_limit, weekly_sale_limit, min_sale_gap_minutes, bill_code_format)

### Test Cleanup Flow
Each test's `beforeEach` calls:
1. `cleanSalesData()` — deletes sales + related records (some specs have this)
2. `resetTestData()` — deletes ALL test data, keeps only admin + root member, resets wallets to 0
3. `await resetRateLimiter()` — POSTs to `/api/dev/reset` to clear the login rate limiter

## Current Config

- `playwright.config.ts`: `retries: 1`, `workers: 1`, `timeout: 30000`, chromium only
- Tests run from the HOST machine (not inside Docker), browser hits `http://localhost:3005`
- Playwright is installed locally (not in Docker)

## The Two Root Causes

### 1. Login Rate Limiter Module Instance Mismatch

**File:** `src/lib/rate-limit.ts`

The login rate limiter uses an in-memory `Map` (5 attempts per 15 min window). Tests call `POST /api/dev/reset` (which calls `resetAll()`) to clear it between tests.

**Problem:** Next.js dev server HMR (Hot Module Replacement) can create different module instances. The `Map` that `checkRateLimit()` reads from may be a different instance than the one `resetAll()` clears. So the rate limiter thinks there have been 5+ login attempts even though `resetAll()` was called.

**Current fix (partial):** Using `globalThis.__rate_limit_attempts__` to store the Map so it survives HMR. This helped but doesn't fully eliminate the issue — some tests still get stuck on the login page.

**Symptom:** Test times out at `page.waitForURL("**/admin**")` after calling `login()`. Screenshot shows empty login form. The login was rejected by rate limiting, the page stayed on `/login`.

**How the rate limiter works:**
1. `src/lib/auth.ts` line 22: `checkRateLimit(\`login:${ip}\`)` — checks before each login
2. `src/lib/rate-limit.ts`: `MAX_ATTEMPTS = 5`, `WINDOW_MS = 15 min`
3. `src/app/api/dev/reset/route.ts`: calls `resetAll()` to clear the Map
4. `e2e/helpers.ts`: `resetRateLimiter()` POSTs to `/api/dev/reset`

**The E2E test for rate limiting (`e2e/auth.spec.ts` line 62):**
There IS a test that verifies rate limiting works (6th login attempt gets blocked). Any fix must not break this test.

### 2. "No Sales Found" on Tab Navigation

**File:** `e2e/returns.spec.ts` (and occasionally `e2e/approval.spec.ts`, `e2e/sales.spec.ts`)

Tests insert sales data via direct SQL (`dbQuery`), then navigate to the admin sales page and click a tab (Approved/Returned/Pending). Sometimes the page shows "No sales found" even though the data exists in the DB.

**Problem:** The browser's `fetch()` call to `/api/admin/sales?status=APPROVED` returns empty results. The data IS in the database (verified via direct Prisma query in the container). This only happens when running the full suite (192 tests over 10+ min), not when running tests individually.

**Current fix (partial):** `goToApprovedSalesTab()` helper in `e2e/returns.spec.ts` retries up to 3 times with fresh `page.goto()` navigation. This helps but doesn't fully eliminate the issue.

**Symptom:** Test sees "No sales found" on the Approved/Returned tab. The `data-testid="sales-table"` never appears; `data-testid="sales-empty"` shows instead.

**How the admin sales page works:**
1. `src/app/admin/sales/page.tsx` — client component, fetches `/api/admin/sales?page=1&limit=20&status=APPROVED`
2. `src/app/api/admin/sales/route.ts` — server route, queries Prisma for sales
3. The page has tabs: Pending, Approved, Rejected, Returned, All
4. Clicking a tab triggers a re-fetch with the new status filter
5. If no sales match, it shows `data-testid="sales-empty"` with "No sales found"

**Files involved:**
- `e2e/returns.spec.ts` — the `goToApprovedSalesTab()` helper (around line 170)
- `e2e/helpers.ts` — `dbQuery()`, `resetTestData()`
- `src/app/api/admin/sales/route.ts` — the API that returns sales list
- `src/app/admin/sales/page.tsx` — the client component that fetches and renders

## What Has Been Tried

1. **TRUNCATE CASCADE** — didn't help, caused other issues with table dependencies
2. **ON_ERROR_STOP=1 in psql** — too strict, caused dbQuery to throw on benign empty results
3. **page.reload() in retry loop** — caused "element detached from DOM" errors (React re-render destroys old DOM nodes)
4. **Multiple page.goto() retries** — helps reduce failures but doesn't fully fix
5. **globalThis for rate limiter Map** — helps but doesn't fully fix
6. **Disabling rate limit in dev** — breaks the rate limit E2E test in auth.spec.ts
7. **Adding `2>&1` to dbQuery** — now detects SQL errors that were previously silently swallowed
8. **Reset root member data in resetTestData** — prevents profile test contamination (name/phone changes)
9. **Retry logic in resetRateLimiter()** — retries POST up to 3 times

## Test Commands

```bash
# Start the app (must be running before tests):
docker compose up -d --build

# All tests pass individually:
npx playwright test e2e/returns.spec.ts          # 17/17 pass
npx playwright test e2e/approval.spec.ts         # 22/22 pass
npx playwright test e2e/auth.spec.ts             # 29/29 pass
npx playwright test e2e/dashboard.spec.ts        # 38/38 pass
npx playwright test e2e/members.spec.ts          # 42/42 pass
npx playwright test e2e/products.spec.ts         # 21/21 pass
npx playwright test e2e/sales.spec.ts            # 23/23 pass

# Full suite has 2-7 intermittent failures:
npx playwright test                               # 185-191 pass, 1-7 fail

# Vitest (unit tests) always passes:
npx vitest run                                    # 113/113 pass

# Run a single test by name:
npx playwright test -g "admin sees pending sales list"

# Run with visible browser:
npx playwright test --headed -g "test name"
```

## Key Files to Look At

- `e2e/helpers.ts` — `dbQuery()`, `resetTestData()`, `resetRateLimiter()`, `login()`
- `e2e/returns.spec.ts` — `goToApprovedSalesTab()`, `cleanSalesData()`, `setupTreeForReturns()`
- `e2e/approval.spec.ts` — `cleanSalesData()`, `insertPendingSale()`
- `src/lib/rate-limit.ts` — the rate limiter with globalThis fix
- `src/lib/auth.ts` — where `checkRateLimit` is called (line 22)
- `src/app/api/dev/reset/route.ts` — the rate limiter reset endpoint
- `playwright.config.ts` — test configuration

## Ideal Outcome

All 192 tests should pass consistently when running `npx playwright test` (with `retries: 1` is acceptable). The fix should not change feature behavior — only test infrastructure.

## Rules

- Do NOT change any feature code behavior
- Do NOT delete or skip any tests
- The rate limit E2E test (`e2e/auth.spec.ts` "rate limiting: 6th attempt within 15 min → blocked") MUST still pass
- All 113 Vitest unit tests must still pass (`npx vitest run`)
- Run `npx playwright test` at least twice to verify consistency
