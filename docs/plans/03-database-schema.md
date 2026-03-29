# Database Schema

## Entity Relationship

```
User (1) ──── (1) Wallet
User (1) ──── (N) Sale
User (1) ──── (N) Commission
User (1) ──── (N) WalletTransaction
User (1) ──── (N) Notification
User (1) ──── (3 max) User (children via parentId)
User (1) ──── (N) User (referrals via sponsorId)
Sale (1) ──── (N) Commission
Sale (1) ──── (N) SaleFlag
Sale (1) ──── (1) BillPhoto (file path)
Product (1) ── (N) Sale (via SaleItem)
Sale (1) ──── (N) SaleItem
```

## Tables

### users
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| email | VARCHAR(255) | Unique, login |
| password_hash | VARCHAR(255) | bcrypt |
| name | VARCHAR(255) | Full name |
| phone | VARCHAR(20) | Unique, contact number |
| role | ENUM | `ADMIN`, `MEMBER` |
| sponsor_id | UUID | FK → users.id (who referred them) |
| parent_id | UUID | FK → users.id (placement parent in tree) |
| position | INT | 1, 2, or 3 (which child slot under parent) |
| depth | INT | Level in tree (root = 0) |
| path | TEXT | Materialized path (e.g., `/uuid1/uuid2/uuid3`) |
| referral_code | VARCHAR(20) | Unique, for referral links |
| is_active | BOOLEAN | Default true, admin can block |
| status | ENUM | `ACTIVE`, `BLOCKED`, `DEACTIVATED` |
| preferred_language | ENUM | `en`, `hi` |
| has_completed_onboarding | BOOLEAN | Default false |
| registration_ip | VARCHAR(45) | IP at registration time |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indexes:**
- `sponsor_id` — find all direct referrals
- `parent_id` — find children in tree
- `referral_code` — lookup for referral links
- `email` — unique, login lookup

**Constraints:**
- Max 3 children per parent (enforced at application level + DB trigger)
- `position` must be 1, 2, or 3
- `position` must be unique within same `parent_id`

### products
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | VARCHAR(255) | e.g., "Exide Inverter Battery 150Ah" |
| name_hi | VARCHAR(255) | Hindi name |
| description | TEXT | Optional |
| description_hi | TEXT | Hindi description |
| price | DECIMAL(10,2) | MRP in INR |
| sku | VARCHAR(50) | Optional stock keeping unit |
| category | VARCHAR(100) | e.g., "Car", "Inverter", "Bike" |
| is_active | BOOLEAN | Soft delete |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### sales
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| member_id | UUID | FK → users.id (who made the sale) |
| bill_code | VARCHAR(100) | From MyBillBook, unique |
| total_amount | DECIMAL(10,2) | Total sale amount in INR |
| customer_name | VARCHAR(255) | End customer |
| customer_phone | VARCHAR(20) | End customer phone |
| sale_date | DATE | When the sale happened |
| bill_photo_path | VARCHAR(500) | File path to uploaded receipt photo |
| status | ENUM | `PENDING`, `APPROVED`, `REJECTED`, `RETURNED` |
| return_reason | TEXT | If admin marks as returned |
| returned_at | TIMESTAMP | |
| rejection_reason | TEXT | If admin rejects |
| approved_by | UUID | FK → users.id (admin) |
| approved_at | TIMESTAMP | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indexes:**
- `member_id` — find all sales by a member
- `bill_code` — unique, lookup
- `status` — filter pending/approved/rejected

### sale_items
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| sale_id | UUID | FK → sales.id |
| product_id | UUID | FK → products.id |
| quantity | INT | |
| unit_price | DECIMAL(10,2) | Price at time of sale |
| subtotal | DECIMAL(10,2) | quantity * unit_price |

### commissions
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| sale_id | UUID | FK → sales.id (which sale triggered this) |
| beneficiary_id | UUID | FK → users.id (who earns this commission) |
| source_member_id | UUID | FK → users.id (who made the sale) |
| level | INT | 1-7 (distance in tree) |
| percentage | DECIMAL(5,2) | Commission % applied |
| amount | DECIMAL(10,2) | Calculated commission in INR |
| type | ENUM | `EARNING`, `REVERSAL` |
| created_at | TIMESTAMP | |

**Indexes:**
- `sale_id` — find all commissions for a sale
- `beneficiary_id` — find all earnings for a member
- `source_member_id` — trace commissions from a sale

### commission_settings
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| level | INT | 1-7, unique |
| percentage | DECIMAL(5,2) | Commission % for this level |
| updated_at | TIMESTAMP | |

**Seed data:**
| level | percentage |
|---|---|
| 1 | 10.00 |
| 2 | 6.00 |
| 3 | 4.00 |
| 4 | 3.00 |
| 5 | 2.00 |
| 6 | 1.00 |
| 7 | 0.50 |

Admin can update these at any time. Changes apply to **future sales only** (existing commissions are not recalculated).

### wallets
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id, unique |
| total_earned | DECIMAL(12,2) | Lifetime earnings |
| pending | DECIMAL(12,2) | Approved but not yet paid |
| paid_out | DECIMAL(12,2) | Cash given by admin |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Invariant:** `total_earned = pending + paid_out`

### wallet_transactions
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| wallet_id | UUID | FK → wallets.id |
| type | ENUM | `COMMISSION`, `COMMISSION_REVERSAL`, `PAYOUT`, `ADJUSTMENT` |
| amount | DECIMAL(10,2) | Positive = credit, negative = debit |
| description | TEXT | e.g., "Commission from sale #MB-001 (Level 2)" |
| reference_id | UUID | Nullable, FK → commissions.id or sales.id |
| created_by | UUID | FK → users.id (admin for payouts/adjustments) |
| created_at | TIMESTAMP | |

**Indexes:**
- `wallet_id` — transaction history for a wallet
- `type` — filter by transaction type
- `created_at` — chronological ordering

## Tree Traversal

PostgreSQL recursive CTE for finding upline (for commission calculation):

```sql
WITH RECURSIVE upline AS (
  -- Start from the member who made the sale
  SELECT id, parent_id, depth, 0 AS level
  FROM users
  WHERE id = :member_id

  UNION ALL

  -- Walk up the tree
  SELECT u.id, u.parent_id, u.depth, up.level + 1
  FROM users u
  INNER JOIN upline up ON u.id = up.parent_id
  WHERE up.level < 7  -- Stop at 7 levels
)
SELECT * FROM upline WHERE level > 0;
```

### sale_flags
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| sale_id | UUID | FK → sales.id |
| flag_type | ENUM | `REPEAT_CUSTOMER`, `REPEAT_PHONE`, `HIGH_AMOUNT`, `RAPID_SALES`, `ROUND_NUMBERS`, `NEW_MEMBER_HIGH_SALE` |
| severity | ENUM | `LOW`, `MEDIUM`, `HIGH` |
| details | TEXT | Human-readable explanation |
| dismissed | BOOLEAN | Default false |
| dismissed_by | UUID | FK → users.id (nullable) |
| created_at | TIMESTAMP | |

### commission_rate_history
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| level | INT | Commission level |
| old_percentage | DECIMAL(5,2) | Previous rate |
| new_percentage | DECIMAL(5,2) | New rate |
| changed_by | UUID | FK → users.id (admin) |
| created_at | TIMESTAMP | |

### notifications
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id (recipient) |
| type | VARCHAR(50) | Notification type |
| title | VARCHAR(255) | English title |
| title_hi | VARCHAR(255) | Hindi title |
| message | TEXT | English message |
| message_hi | TEXT | Hindi message |
| link | VARCHAR(255) | Navigation URL (nullable) |
| is_read | BOOLEAN | Default false |
| created_at | TIMESTAMP | |

### announcements
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| title | VARCHAR(255) | English title |
| title_hi | VARCHAR(255) | Hindi title |
| content | TEXT | English content (markdown) |
| content_hi | TEXT | Hindi content |
| is_pinned | BOOLEAN | Default false |
| is_active | BOOLEAN | Default true |
| created_by | UUID | FK → users.id (admin) |
| published_at | TIMESTAMP | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### audit_logs
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| actor_id | UUID | FK → users.id |
| actor_role | ENUM | `ADMIN`, `SYSTEM` |
| action | VARCHAR(100) | Action identifier |
| entity_type | VARCHAR(50) | user, sale, commission, wallet, product, settings |
| entity_id | UUID | ID of affected record |
| old_value | JSONB | Previous state (nullable) |
| new_value | JSONB | New state (nullable) |
| ip_address | VARCHAR(45) | Request IP |
| description | TEXT | Human-readable summary |
| created_at | TIMESTAMP | |

### app_settings
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| key | VARCHAR(100) | Unique setting key |
| value | JSONB | Setting value |
| description | TEXT | Human-readable description |
| updated_at | TIMESTAMP | |

### jobs
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| type | VARCHAR(100) | Job type |
| payload | JSONB | Job data |
| status | ENUM | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| result | JSONB | Output (nullable) |
| error | TEXT | Error message (nullable) |
| attempts | INT | Default 0 |
| max_attempts | INT | Default 3 |
| created_by | UUID | FK → users.id |
| started_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

## Notes
- All monetary values use `DECIMAL(10,2)` or `DECIMAL(12,2)` — never float
- UUIDs for all primary keys
- Soft deletes via `is_active` flag (never hard delete members or products)
- Timestamps stored in UTC, displayed in IST (UTC+5:30)
- Phone numbers unique per user (one phone = one account)
- Indian number formatting: ₹1,00,000 (lakh system) via `Intl.NumberFormat('en-IN')`
