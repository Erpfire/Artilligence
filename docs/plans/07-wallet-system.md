# Wallet System

## Overview
Every member has a wallet. The wallet **tracks** money — it does not process actual payments. Real money moves offline (cash from admin).

## Wallet Fields

| Field | Description |
|---|---|
| **Total Earned** | Lifetime commission earnings |
| **Pending** | Earned but not yet paid out (admin hasn't given cash yet) |
| **Paid Out** | Amount admin has already paid in cash |

**Invariant:** `Total Earned = Pending + Paid Out`

## Wallet Transactions

Every change to a wallet is logged as a transaction:

### Transaction Types

| Type | Direction | Triggered By | Description |
|---|---|---|---|
| `COMMISSION` | Credit (+) | System (on sale approval) | Commission earned from downline sale |
| `PAYOUT` | Debit (-) | Admin | Admin paid cash, reducing pending balance |
| `ADJUSTMENT` | Credit/Debit | Admin | Manual correction (add or deduct) |

### Commission Credit
- Happens automatically when admin approves a sale
- Amount = calculated commission for this member
- `pending` increases by commission amount
- `total_earned` increases by commission amount

### Payout
- Admin marks a specific amount as "paid" for a member
- `pending` decreases by payout amount
- `paid_out` increases by payout amount
- `total_earned` stays the same
- Cannot payout more than `pending` balance

### Adjustment
- Admin manually adds or deducts from wallet
- Used for corrections, bonuses, penalties
- Affects both `pending` and `total_earned`
- Admin must provide a reason/description

## Wallet UI (Member View)

```
┌─────────────────────────────────────┐
│  My Wallet                           │
├─────────────────────────────────────┤
│                                      │
│  ┌──────────┐ ┌────────┐ ┌────────┐ │
│  │ Total    │ │Pending │ │Paid    │ │
│  │ Earned   │ │        │ │Out     │ │
│  │ ₹45,600  │ │₹12,400 │ │₹33,200│ │
│  └──────────┘ └────────┘ └────────┘ │
│                                      │
│  Transaction History                 │
│  ┌──────────────────────────────────┐│
│  │ 28 Mar  +₹1,000  COMMISSION     ││
│  │   L1 from Rajesh's sale #MB01   ││
│  │ 27 Mar  -₹5,000  PAYOUT         ││
│  │   Cash payment by admin          ││
│  │ 25 Mar  +₹600    COMMISSION     ││
│  │   L2 from Suresh's sale #MB02   ││
│  │ ...                              ││
│  └──────────────────────────────────┘│
└─────────────────────────────────────┘
```

## Wallet Management (Admin View)

### Member Wallet Overview
```
┌───────────────────────────────────────────────────────────┐
│  Member Wallets                                            │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│ Member   │ Earned   │ Pending  │ Paid Out │ Actions        │
├──────────┼──────────┼──────────┼──────────┼────────────────┤
│ Rajesh K │ ₹45,600  │ ₹12,400  │ ₹33,200  │ [Pay] [Adjust] │
│ Suresh P │ ₹22,300  │ ₹8,100   │ ₹14,200  │ [Pay] [Adjust] │
│ Priya S  │ ₹15,800  │ ₹15,800  │ ₹0       │ [Pay] [Adjust] │
└──────────┴──────────┴──────────┴──────────┴────────────────┘
│ Total Pending Payouts: ₹36,300                             │
└────────────────────────────────────────────────────────────┘
```

### Pay Dialog
```
┌────────────────────────────┐
│ Pay Out — Rajesh Kumar      │
├────────────────────────────┤
│ Pending Balance: ₹12,400   │
│                             │
│ Amount: [₹________]        │
│ Note:   [________________] │
│                             │
│ [Cancel]  [Confirm Payout]  │
└────────────────────────────┘
```

### Adjust Dialog
```
┌────────────────────────────┐
│ Adjust — Rajesh Kumar       │
├────────────────────────────┤
│ Type: (•) Add  ( ) Deduct  │
│                             │
│ Amount: [₹________]        │
│ Reason: [________________] │
│                             │
│ [Cancel]  [Apply]           │
└────────────────────────────┘
```

## Wallet Creation
- A wallet is automatically created when a member registers
- Initial balances: all ₹0
- Admin does not have a wallet (admin is not part of the MLM tree)
