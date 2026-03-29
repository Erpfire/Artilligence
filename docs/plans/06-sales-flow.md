# Sales Flow

## Overview
Sales happen **offline**. The app only tracks and manages commission calculation.

```
[Offline Sale] → [MyBillBook Bill] → [Member Logs in App] → [Admin Approves] → [Commissions Calculated]
```

## Step-by-Step Flow

### Step 1: Offline Sale
- Member sells Exide batteries to a customer (in-person, phone, etc.)
- This happens entirely outside the app

### Step 2: MyBillBook Bill
- The client (admin/distributor) creates a bill in MyBillBook
- A bill code is generated (e.g., `MB-20260328-001`)
- This happens in the MyBillBook app (no API, no integration)

### Step 3: Member Submits Sale in App
Member fills out a form:

| Field | Type | Required | Notes |
|---|---|---|---|
| Bill Code | Text input | Yes | From MyBillBook, must be unique |
| Product(s) | Dropdown + quantity | Yes | Select from product catalog |
| Sale Date | Date picker | Yes | When the sale happened |
| Customer Name | Text input | Yes | End customer |
| Customer Phone | Text input | Yes | End customer contact |

**Auto-calculated:**
- Total amount = sum of (product price * quantity) for each item
- Member ID = logged-in user

**Validations:**
- Bill code must be unique (no duplicate entries)
- At least one product must be added
- Sale date cannot be in the future
- All required fields must be filled

### Step 4: Admin Reviews
Admin sees pending sales in their dashboard:
- List of all pending sales with member name, bill code, amount, date
- Can click to see full details
- Two actions: **Approve** or **Reject**

**On Reject:**
- Admin must provide a rejection reason
- Sale status → `REJECTED`
- Member sees rejection with reason in their sales history
- No commissions generated
- Member can submit a corrected sale if needed

**On Approve:**
- Sale status → `APPROVED`
- `approved_by` = admin user ID
- `approved_at` = current timestamp
- Commissions are calculated immediately (see commission system)
- Wallet credits happen in the same transaction

### Step 5: Post-Approval
- Member sees sale as "Approved" in their history
- Upline members see new commission credits in their wallets
- Admin can see the sale in approved sales report

## Sale Statuses

```
PENDING → APPROVED → (commissions calculated, final)
PENDING → REJECTED → (member can resubmit new sale)
```

No other transitions. Once approved, a sale cannot be unapproved.

## Sale Form UI (Member Side)

```
┌─────────────────────────────────────┐
│  Submit New Sale                     │
├─────────────────────────────────────┤
│                                      │
│  Bill Code: [________________]       │
│                                      │
│  Sale Date: [____ / __ / ____]       │
│                                      │
│  Products:                           │
│  ┌─────────────────────────────────┐ │
│  │ Product:  [Dropdown ▾]         │ │
│  │ Quantity: [___]                 │ │
│  │ Price:    ₹8,000 (auto)        │ │
│  │                    [+ Add More] │ │
│  └─────────────────────────────────┘ │
│                                      │
│  Customer Name:  [________________]  │
│  Customer Phone: [________________]  │
│                                      │
│  Total: ₹8,000                       │
│                                      │
│  [Submit Sale]                       │
└─────────────────────────────────────┘
```

## Sale Review UI (Admin Side)

```
┌──────────────────────────────────────────────────────┐
│  Pending Sales (3)                                    │
├──────┬──────────┬─────────────┬────────┬─────────────┤
│ Bill │ Member   │ Amount      │ Date   │ Action      │
├──────┼──────────┼─────────────┼────────┼─────────────┤
│ MB01 │ Rajesh K │ ₹14,000     │ 28 Mar │ [✓] [✗]    │
│ MB02 │ Suresh P │ ₹8,000      │ 27 Mar │ [✓] [✗]    │
│ MB03 │ Priya S  │ ₹22,500     │ 28 Mar │ [✓] [✗]    │
└──────┴──────────┴─────────────┴────────┴─────────────┘
```
