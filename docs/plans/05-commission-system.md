# Commission System

## Commission Table (Default)

| Level | Distance from Seller | Percentage |
|---|---|---|
| 1 | Direct parent | 10.00% |
| 2 | Grandparent | 6.00% |
| 3 | Great-grandparent | 4.00% |
| 4 | 4th ancestor | 3.00% |
| 5 | 5th ancestor | 2.00% |
| 6 | 6th ancestor | 1.00% |
| 7 | 7th ancestor | 0.50% |

**Total commission payout per sale: 26.50% of sale amount**

### Admin Can Change
- Admin can update commission percentages for any level at any time
- Changes stored in `commission_settings` table
- Changes apply to **future sales only**
- Existing commissions are **never recalculated**
- Admin can also add or remove levels (e.g., reduce to 5 levels or expand to 10)

## Commission Calculation Flow

### Trigger
Commissions are calculated **only when admin approves a sale**.

### Algorithm
```
function calculateCommissions(saleId):
    sale = getSale(saleId)
    member = getMember(sale.member_id)
    settings = getCommissionSettings()  // Current percentages

    // Walk up the tree from the member's placement parent
    upline = getUpline(member.id, maxLevel = settings.maxLevel)

    for ancestor in upline:
        if not ancestor.is_active:
            continue  // Skip blocked members, don't pass commission up

        level = ancestor.level  // 1 = direct parent, 2 = grandparent, etc.
        percentage = settings[level].percentage

        commissionAmount = sale.total_amount * (percentage / 100)

        // Create commission record
        createCommission({
            sale_id: saleId,
            beneficiary_id: ancestor.id,
            source_member_id: member.id,
            level: level,
            percentage: percentage,
            amount: commissionAmount
        })

        // Credit wallet
        creditWallet(ancestor.id, commissionAmount, {
            type: 'COMMISSION',
            description: "Level {level} commission from {member.name}'s sale #{sale.bill_code}",
            reference_id: commission.id
        })
```

### Example Calculation

Sale: Member F sells ₹10,000 worth of batteries

```
Tree:
        A (Level 7 from F)
      / | \
     B  C  D
    /|
   E  G
  /
 F  ← Makes the sale
```

| Beneficiary | Level | % | Commission |
|---|---|---|---|
| E (parent) | 1 | 10.00% | ₹1,000.00 |
| B (grandparent) | 2 | 6.00% | ₹600.00 |
| A (great-grandparent) | 3 | 4.00% | ₹400.00 |

(Only 3 levels exist above F in this example, so only 3 commissions are generated)

**Total payout: ₹2,000.00 (20% of sale)**

## Edge Cases

### 1. Blocked/Inactive Member in Upline
If a member in the upline is blocked (`is_active = false`):
- **Skip them** — they don't earn commission
- The commission for that level is **not passed up** to the next person
- This is the simplest and most common approach
- Example: If Level 2 member is blocked, Level 2 commission is simply not generated

### 2. Tree Has Fewer Than 7 Levels Above Seller
- Only generate commissions for levels that exist
- If member is at depth 3, only 3 levels of commission are possible

### 3. Sale Gets Rejected After Approval
- This shouldn't happen in normal flow (approve is final)
- If needed in future: reverse all commissions and wallet credits for that sale

### 4. Zero-Amount Commission
- If a commission calculates to ₹0.00 (e.g., very small sale), still create the record for tracking
- Wallet credit of ₹0 is fine

### 5. Admin Changes Commission Mid-Operation
- Commission settings are read once at the time of sale approval
- No race condition: sale approval is a single transaction

## Commission Reports

### For Admin
- Total commissions paid (by date range)
- Commission breakdown by level
- Top earners
- Commission per sale details

### For Members
- My total earnings (lifetime, this month, this week)
- Earnings by level breakdown
- Commission history (which sales generated how much)
