# Audit Trail

## Why
This app handles commissions (money). Every admin action must be logged for:
- Accountability — who did what
- Dispute resolution — "my commission was wrong" → check the log
- Trust — members can see their own commission calculation transparency

## audit_logs Table

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| actor_id | UUID | FK → users.id (who performed the action) |
| actor_role | ENUM | `ADMIN`, `SYSTEM` |
| action | VARCHAR(100) | Action identifier |
| entity_type | VARCHAR(50) | What was affected (user, sale, commission, wallet, product, settings) |
| entity_id | UUID | ID of the affected record |
| old_value | JSONB | Previous state (nullable) |
| new_value | JSONB | New state (nullable) |
| ip_address | VARCHAR(45) | Request IP |
| description | TEXT | Human-readable summary |
| created_at | TIMESTAMP | |

**Index:** `actor_id`, `entity_type + entity_id`, `action`, `created_at`

## Actions Logged

### Member Management
| Action | Description | old_value / new_value |
|---|---|---|
| `member.blocked` | Admin blocked a member | `{ is_active: true }` → `{ is_active: false }` |
| `member.unblocked` | Admin unblocked a member | `{ is_active: false }` → `{ is_active: true }` |
| `member.password_reset` | Admin reset member's password | — |
| `member.registered` | New member registered | `{ sponsor_id, parent_id, position }` |

### Sale Management
| Action | Description |
|---|---|
| `sale.submitted` | Member submitted a new sale |
| `sale.approved` | Admin approved a sale |
| `sale.rejected` | Admin rejected a sale (includes reason) |
| `sale.returned` | Admin marked sale as returned |
| `sale.bulk_approved` | Admin approved multiple sales at once |

### Commission
| Action | Description |
|---|---|
| `commission.calculated` | System calculated commissions for a sale |
| `commission.reversed` | System reversed commissions (sale returned) |
| `commission.rate_changed` | Admin changed commission rate for a level |
| `commission.level_added` | Admin added a new commission level |
| `commission.level_removed` | Admin removed a commission level |

### Wallet
| Action | Description |
|---|---|
| `wallet.payout` | Admin marked payout as paid |
| `wallet.adjustment_credit` | Admin manually added to wallet |
| `wallet.adjustment_debit` | Admin manually deducted from wallet |

### Product
| Action | Description |
|---|---|
| `product.created` | Admin added a new product |
| `product.updated` | Admin edited a product |
| `product.deactivated` | Admin deactivated a product |
| `product.activated` | Admin reactivated a product |

### Settings
| Action | Description |
|---|---|
| `settings.updated` | Admin changed app settings (rate limits, bill format, etc.) |

## Admin Audit Log Page (`/admin/audit-log`)

**Filters:**
- Date range
- Actor (which admin — future-proofing for multi-admin)
- Action type
- Entity type
- Specific entity ID

**Columns:**
| Timestamp | Actor | Action | Entity | Description | Details |
|---|---|---|---|---|---|
| 28 Mar 14:30 | Admin | sale.approved | Sale #MB-001 | Approved sale for Rajesh | [View] |
| 28 Mar 14:25 | Admin | commission.rate_changed | Level 3 | 4% → 5% | [View] |
| 28 Mar 10:00 | System | commission.calculated | Sale #MB-001 | 3 commissions totaling ₹2,000 | [View] |

**[View] shows:** Full old_value → new_value JSON diff

## Commission Calculation Transparency (Member-Facing)

When a member clicks on a commission entry in their wallet, they can see:

```
Commission Details
─────────────────
Sale: #MB-20260328-001
Sold by: Rajesh Kumar (your Level 2 downline)
Sale Amount: ₹10,000
Your Level: 2
Commission Rate: 6%
Your Commission: ₹600

Calculation: ₹10,000 × 6% = ₹600
```

This prevents disputes — the member can see exactly how each commission was calculated.

## Retention
- Audit logs are **never deleted**
- They grow over time but are append-only (cheap storage)
- Admin can export audit logs in the reports section (PDF/Excel)
