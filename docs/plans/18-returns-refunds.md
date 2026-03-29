# Returns & Refund Handling

## Problem
A battery sale is approved → commissions are calculated and credited to upline wallets → customer returns the battery. The commissions need to be reversed.

## Sale Lifecycle (Updated)

```
PENDING → APPROVED → (commissions calculated)
PENDING → REJECTED

APPROVED → RETURNED → (commissions reversed)
```

New status: **RETURNED**

## Return Flow

### Step 1: Admin Initiates Return
- Go to approved sale in admin panel
- Click "Mark as Returned"
- Enter return reason (required)
- Confirm action

### Step 2: System Reverses Commissions
For each commission generated from this sale:

1. Create a **negative commission** entry:
   - Same `sale_id`, `beneficiary_id`, `level`
   - Amount is **negative** (e.g., -₹600)
   - Type: `REVERSAL`

2. Update wallet:
   - Deduct from `total_earned`
   - Deduct from `pending`
   - If `pending` goes negative (because cash was already paid out), the negative balance carries forward — admin deducts from next payout

3. Create wallet transaction:
   - Type: `COMMISSION_REVERSAL`
   - Amount: negative
   - Description: "Commission reversed — sale #MB-001 returned"

4. Create notification for each affected member:
   - "Commission of ₹600 reversed due to sale return"

### Step 3: Audit Log
- Log: `sale.returned` with sale details and return reason
- Log: `commission.reversed` for each reversed commission

## Updated commissions Table

Add a new column:

| Column | Type | Notes |
|---|---|---|
| type | ENUM | `EARNING` (normal) or `REVERSAL` (return) |

## Wallet Handling — Negative Pending

Scenario:
1. Member earns ₹1,000 commission → pending = ₹1,000
2. Admin pays ₹1,000 cash → pending = ₹0, paid_out = ₹1,000
3. Sale is returned → ₹1,000 reversed → pending = -₹1,000

**What happens:**
- Member's wallet shows pending as **-₹1,000**
- Next time member earns commission, it offsets the negative
- Admin can also make a manual adjustment
- Member dashboard shows: "You have a pending deduction of ₹1,000 due to a returned sale"

## Admin Return UI

On the approved sale detail page:

```
┌────────────────────────────────┐
│ Sale #MB-20260328-001          │
│ Status: ✅ Approved             │
│ ...                            │
│                                │
│ [Mark as Returned]             │
└────────────────────────────────┘
        │
        ▼
┌────────────────────────────────┐
│ Return Sale — Are you sure?    │
│                                │
│ This will:                     │
│ • Mark sale as returned        │
│ • Reverse all commissions (3)  │
│ • Deduct from upline wallets:  │
│   - Rajesh: -₹1,000           │
│   - Suresh: -₹600             │
│   - Amit:   -₹400             │
│                                │
│ Return Reason:                 │
│ [________________________]     │
│                                │
│ [Cancel]  [Confirm Return]     │
└────────────────────────────────┘
```

The confirmation dialog shows exactly what will happen — which members will be affected and by how much. Admin makes an informed decision.

## Partial Returns
For MVP: returns are **full sale returns only**. The entire sale is reversed.

Future enhancement: partial returns (specific items from a multi-item sale). This would require item-level commission tracking which adds significant complexity.

## Member View

In the member's sales list, returned sales show:

```
#MB-001  |  ₹10,000  |  28 Mar  |  🔴 Returned
         |           |          |  Reason: Customer returned battery
```

In wallet, the reversal shows:

```
28 Mar  -₹600  REVERSAL
  Commission reversed — sale #MB-001 returned
```
