# Performance & Scalability

## 1. Materialized Path for Tree Queries

### Problem
Recursive CTEs work well for small trees but slow down with 10,000+ members. Finding all ancestors or descendants requires traversing the tree recursively.

### Solution: Store Path
Add a `path` column to the `users` table:

| Member | parent_id | path |
|---|---|---|
| A (root) | null | `/A` |
| B | A | `/A/B` |
| E | B | `/A/B/E` |
| F | E | `/A/B/E/F` |

**Use UUIDs in path:** `/550e8400/.../f47ac10b/...`

### Fast Queries

**Find all ancestors of F (for commission):**
```sql
-- Extract all IDs from path
-- Path: /id1/id2/id3/id4
-- Ancestors: id1, id2, id3
SELECT * FROM users WHERE id = ANY(string_to_array(
  (SELECT path FROM users WHERE id = :member_id), '/'
));
```

**Find all descendants of A:**
```sql
SELECT * FROM users WHERE path LIKE '/A/%';
```

**Find depth/level:**
```sql
-- Count slashes in path = depth
SELECT array_length(string_to_array(path, '/'), 1) - 1 AS depth;
```

**Find distance between two members:**
```sql
-- Compare paths to find common ancestor and calculate distance
```

### Maintaining the Path
- On registration: new member's path = parent's path + '/' + new member's ID
- Path never changes (members don't move in the tree)
- This is an **append-only** operation — no updates needed

### Indexes
```sql
CREATE INDEX idx_users_path ON users USING btree (path);
-- For LIKE queries (descendants):
CREATE INDEX idx_users_path_pattern ON users USING btree (path text_pattern_ops);
```

### Keep Recursive CTE as Fallback
- Materialized path is the primary method
- Recursive CTE exists as verification/fallback
- Both should return same results (can add a health check)

## 2. Database Indexing Strategy

### Critical Indexes (beyond primary/foreign keys)
```sql
-- Users
CREATE INDEX idx_users_sponsor ON users(sponsor_id);
CREATE INDEX idx_users_parent_position ON users(parent_id, position);
CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_users_path ON users(path text_pattern_ops);

-- Sales
CREATE INDEX idx_sales_member_status ON sales(member_id, status);
CREATE INDEX idx_sales_status_created ON sales(status, created_at);
CREATE UNIQUE INDEX idx_sales_bill_code ON sales(bill_code);

-- Commissions
CREATE INDEX idx_commissions_beneficiary ON commissions(beneficiary_id, created_at);
CREATE INDEX idx_commissions_sale ON commissions(sale_id);

-- Wallet Transactions
CREATE INDEX idx_wallet_tx_wallet ON wallet_transactions(wallet_id, created_at);

-- Notifications
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at);

-- Audit Logs
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at);
```

## 3. Background Job Processing

### Problem
Some operations are slow and shouldn't block the HTTP request:
- Generating large reports (PDF/Excel with 10,000+ rows)
- Bulk sale approval (approving 50 sales = 50 × commission calculations)
- Notification fan-out (announcement → create notification for every member)
- Ghost member detection scan

### Solution: Simple Job Queue

No external service needed. Use a database-backed job queue.

### jobs Table
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| type | VARCHAR(100) | Job type |
| payload | JSONB | Job data |
| status | ENUM | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| result | JSONB | Output data (nullable) |
| error | TEXT | Error message if failed |
| attempts | INT | Retry count |
| max_attempts | INT | Default 3 |
| created_by | UUID | Who triggered this job |
| started_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

### Job Types
| Type | Trigger | Purpose |
|---|---|---|
| `report.generate` | Admin clicks "Download PDF/Excel" | Generate large report file |
| `sale.bulk_approve` | Admin bulk-approves sales | Process multiple approvals |
| `notification.fanout` | Admin publishes announcement | Create notification for all members |
| `cleanup.notifications` | Daily cron | Delete notifications older than 90 days |
| `scan.ghost_members` | Weekly cron | Detect inactive/suspicious members |

### Job Worker
- A simple worker process that polls the `jobs` table every 5 seconds
- Runs inside the same Next.js app (or as a separate process in the same container)
- Picks up `PENDING` jobs, sets to `PROCESSING`, executes, sets to `COMPLETED` or `FAILED`
- Uses `SELECT ... FOR UPDATE SKIP LOCKED` to prevent double-processing

### Report Download Flow
1. Admin clicks "Download Excel" for sales report
2. API creates a job: `{ type: "report.generate", payload: { report: "sales", format: "xlsx", filters: {...} } }`
3. API returns job ID immediately
4. UI shows: "Generating report... This may take a moment."
5. UI polls `GET /api/jobs/{id}` every 3 seconds
6. When job completes, `result` contains the file path
7. UI shows download link

## 4. Caching Strategy

### What to Cache (in-memory, per-request)
- Commission settings (rarely change)
- Product list (changes infrequently)
- App settings (rate limits, bill format, etc.)

### How
- Use Next.js `unstable_cache` or simple in-memory cache with TTL
- Invalidate on update (admin changes settings → clear cache)
- Cache TTL: 5 minutes for most things

### What NOT to Cache
- Wallet balances (must be real-time accurate)
- Notification counts (polling already handles this)
- Sale statuses (must reflect latest approval)

## 5. Pagination

All list endpoints must be paginated:
- Default page size: 20
- Max page size: 100
- Use cursor-based pagination for large tables (notifications, audit logs)
- Use offset pagination for smaller tables (members, products)

## 6. Database Connection Pooling

- Prisma handles connection pooling automatically
- Set `connection_limit` in DATABASE_URL based on expected load
- Default: 10 connections for small deployment
- Monitor with `pg_stat_activity`
