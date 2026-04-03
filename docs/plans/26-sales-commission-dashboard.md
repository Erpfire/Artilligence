# 26 — Sales & Commission Dashboard

## Goal

Build UI pages so that:
1. Admin can see total sales done across the network
2. Admin can see per-member commission breakdown (paid vs pending)
3. Members can see their own commission (received vs yet to receive)
4. Members can see a potential earnings table (if their tree is fully filled)

---

## Existing Backend APIs

These APIs already exist and will be used by the new UI pages:

- `GET /api/admin/sales` — all sales with filtering/pagination
- `GET /api/admin/wallets` — all member wallets (totalEarned, pending, paidOut)
- `POST /api/admin/wallets/[id]/payout` — process payout for a member
- `GET /api/dashboard/wallet` — member's own wallet + transaction history
- `GET /api/admin/commissions` — current commission rate settings

If any summary/aggregate endpoint is missing (e.g. total sales sum), it will be added.

---

## Feature 1: Admin — Total Sales Overview

**Page**: `/admin/sales` (enhance existing or new summary section)

**What admin sees:**
- Total sales amount (sum of all APPROVED sales)
- Total number of sales (APPROVED)
- Optionally: sales count by status (PENDING / APPROVED / REJECTED / RETURNED)
- Date range filter (today, this week, this month, custom)

**API needed:**
- May need a new `GET /api/admin/sales/summary` endpoint returning aggregated totals, or enhance the existing `/api/admin/sales` response to include summary stats.

---

## Feature 2: Admin — Commission Tracker (Per-Member)

**Page**: `/admin/commissions/tracker` or section within `/admin/wallets`

**What admin sees:**
A table of all members with columns:
| Member Name | Phone | Total Earned | Pending (to pay) | Already Paid | Action |
|-------------|-------|-------------|-------------------|-------------|--------|
| Ramesh K    | 98xxx | ₹12,500     | ₹4,200            | ₹8,300      | Pay    |

- **Total Earned** = lifetime commission earned
- **Pending** = approved commission not yet paid out
- **Already Paid** = amount admin has already paid
- **Pay button** → opens payout dialog (amount input, confirm)
- Search by member name/phone
- Sort by pending amount (descending) to see who needs to be paid first
- Filter: only show members with pending > 0

**API used:** `GET /api/admin/wallets` (already returns totalEarned, pending, paidOut per member)

---

## Feature 3: Member — My Commission View

**Page**: `/dashboard/wallet` (enhance existing or new section)

**What member sees:**

### Summary Cards
- **Total Earned**: ₹X (lifetime)
- **Received**: ₹Y (already paid by admin)
- **Yet to Receive**: ₹Z (pending payout)

### Transaction History Table
| Date | Description | Type | Amount |
|------|------------|------|--------|
| 2026-04-01 | Commission from Ramesh's sale | COMMISSION | +₹500 |
| 2026-03-28 | Payout received | PAYOUT | -₹2,000 |

- Filter by type (COMMISSION, PAYOUT, REVERSAL, ADJUSTMENT)
- Date range filter
- Pagination

**API used:** `GET /api/dashboard/wallet` (already returns summary + transactions)

---

## Feature 4: Member — Potential Earnings Table

**Page**: Section within `/dashboard` or `/dashboard/wallet`

**Purpose:** Motivational table showing what a member can earn if their ternary tree is fully filled at each level, based on current commission rates.

### What member sees

**Table: "Your Earning Potential"**

Assumes a product sale of ₹30,000:

| Level | Commission % | Earning |
|-------|-------------|---------|
| 1     | 10.00%      | ₹3,000  |
| 2     | 6.00%       | ₹1,800  |
| 3     | 4.00%       | ₹1,200  |
| 4     | 3.00%       | ₹900    |
| 5     | 2.00%       | ₹600    |
| 6     | 1.00%       | ₹300    |
| 7     | 0.50%       | ₹150    |
| 8     | 0.25%       | ₹75     |
| 9     | 0.10%       | ₹30     |
| 10    | 0.05%       | ₹15     |
| 11    | 0.04%       | ₹12     |
| 12    | 0.03%       | ₹9      |
| 13    | 0.02%       | ₹6      |
| 14    | 0.005%      | ₹1.50   |
| 15    | 0.001%      | ₹0.30   |

**Total commission: 26.996%** (under 27% cap)

- Three columns only: Level, Commission %, Earning amount
- Commission rates are read from `commission_settings` table (dynamic)
- Sale amount is fixed at ₹30,000 (Exide battery product price)

**API needed:**
- Can use existing `GET /api/admin/commissions` to fetch rates, compute earnings client-side (₹30,000 × percentage)

---

## Implementation Order

1. **Feature 4** — Potential Earnings Table (standalone, no new backend needed if computed client-side)
2. **Feature 3** — Member Commission View (mostly uses existing `/api/dashboard/wallet`)
3. **Feature 1** — Admin Total Sales (may need summary endpoint)
4. **Feature 2** — Admin Commission Tracker (uses existing `/api/admin/wallets`, add payout UI)

---

## Notes

- All amounts in INR (₹)
- Commission levels extended from 7 to 15 — commission engine and `commission_settings` table need to support up to 15 levels
- Total commission across all 15 levels must not exceed 27%
- Seed data needs to be updated with all 15 levels and their percentages
- Commission is calculated when admin **approves** a sale (not on submission)
- Commission walks up the **parent chain** (placement tree), not the sponsor chain
- Blocked/deactivated members are skipped in commission chain
- Reversals happen when a sale is marked as RETURNED
- `wallet.totalEarned = wallet.pending + wallet.paidOut` (invariant)
