# Member Lifecycle & Edge Cases

## Member States

```
REGISTRATION → ACTIVE → BLOCKED (by admin) → ACTIVE (unblocked)
                      → DEACTIVATED (voluntary exit)
```

| State | Can Login | Can Submit Sales | Earns Commission | Referral Link Works | Tree Position |
|---|---|---|---|---|---|
| Active | Yes | Yes | Yes | Yes | Occupied |
| Blocked | No | No | No (skipped) | No | Occupied (frozen) |
| Deactivated | No | No | No (skipped) | No | Occupied (frozen) |

## Blocking a Member

**Triggered by:** Admin action

**What happens:**
- `is_active` = false
- Member cannot log in (session invalidated)
- Member's referral link stops working (registration page shows "This link is no longer active")
- Member's position in tree is preserved — children are NOT affected
- Member is skipped during commission calculation (their level's commission is not generated, not passed up)
- Member's pending wallet balance is frozen (admin decides what to do with it)

**Reversible:** Yes, admin can unblock at any time

## Voluntary Deactivation

**Triggered by:** Member requests deactivation (or admin does it on behalf)

**Same behavior as blocked**, but with a different status for tracking purposes.

**Not reversible through UI** — admin must manually reactivate if needed.

## What Happens to Children When Parent is Blocked?

**Nothing changes.** The tree structure is permanent. Children continue to earn commissions normally. The blocked member's slot simply doesn't earn anymore.

```
        A
      / | \
     B  C  D
    /|
   E  G

If B is blocked:
- E and G are unaffected
- E and G continue earning commissions
- When E makes a sale:
  - B (Level 1) → SKIPPED (blocked)
  - A (Level 2) → earns Level 2 commission
```

## Registration Edge Cases

### 1. Referral Link of Blocked Member
- Show: "This referral link is no longer active. Please contact the person who shared it."
- Do NOT reveal why the member is blocked

### 2. Concurrent Registration (Race Condition)
Two people click the same referral link and register at the same time.

**Solution:** Use database transaction with row-level locking:
```sql
BEGIN;
-- Lock the parent row to prevent concurrent placement
SELECT * FROM users WHERE id = :parent_id FOR UPDATE;
-- Check available positions
-- Insert new member
COMMIT;
```

If two transactions try to place a member under the same parent at position 2:
- First transaction succeeds
- Second transaction waits for the lock, then re-checks available positions → gets position 3 (or spills over)

### 3. Sponsor's Subtree is Completely Full
Extremely unlikely with ternary tree (3^20 = 3.4 billion slots), but handled by BFS algorithm — it will eventually find an open slot.

### 4. Admin Account
- Admin is NOT part of the MLM tree
- Admin has no parent, no sponsor, no wallet, no referral code
- Admin cannot submit sales
- Admin is a separate entity that manages the system
- Created via seed script, not through registration

## First Member (Root Node)

The very first MLM member is special:
- Created by admin through the admin panel (not via referral link)
- Has no sponsor (sponsor_id = null)
- Has no parent (parent_id = null)
- Sits at depth 0
- This is the client's first sub-seller or the client themselves

**Admin panel:** "Create Root Member" button (visible only when no members exist)

## Password Management

### Member Changes Own Password
- Current password required
- New password: min 8 characters
- Confirm new password

### Admin Resets Member Password
- Admin goes to member detail page
- Clicks "Reset Password"
- System generates a temporary password
- Admin sees the temporary password once (to communicate to member offline/in-person)
- Member is forced to change password on next login

## Profile Updates
- Member can update: name, phone, preferred language
- Member CANNOT change: email (used as login ID), referral code
- Admin can update any member's details
