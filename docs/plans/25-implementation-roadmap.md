# Implementation Roadmap

## Rules

### Rule 1: Build → Test → Build → Test
Every implementation task is followed by an extensive Playwright testing task. No feature moves forward without thorough testing of the previous one.

### Rule 2: TDD for Core Business Logic
Core business logic modules are developed test-first using Vitest. Write failing unit tests → implement code to pass → then Playwright for end-to-end.

### Rule 3: Checkpoint After Every Test Task
After completing every Playwright testing task, STOP and ask yourself:

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners?**

If you cut corners — go back and test more before moving to the next build task. No exceptions. This checkpoint appears after every single Playwright task in the roadmap below.

### Rule 4: What Gets Tested How

| Area | Unit Tests (TDD) | Playwright (E2E) |
|---|---|---|
| Commission calculation | YES — write first | YES — verify in UI |
| BFS tree placement | YES — write first | YES — verify registration |
| Wallet operations | YES — write first | YES — verify in UI |
| Commission reversal | YES — write first | YES — verify return flow |
| Fraud detection flags | YES — write first | YES — verify admin sees flags |
| Rate limiting logic | YES — write first | YES — verify member blocked |
| Bill code validation | YES — write first | YES — verify form errors |
| UI pages/components | NO | YES |
| CRUD endpoints | NO | YES |
| Layouts/navigation | NO | YES |
| Forms/rendering | NO | YES |

Playwright testing covers:
- All happy paths
- All error/validation states
- Edge cases
- Empty states
- Responsive behavior (mobile + desktop)
- Cross-feature interactions where applicable

---

## Phase 0: TDD — Core Business Logic Test Suites

### Task 0A — Setup Vitest + Write Commission Engine Tests (TDD: RED)
- Install and configure Vitest
- Create test helper utilities (mock DB, test fixtures, factory functions for members/sales/wallets)

Write failing tests for `lib/commission.ts`:
```
calculateCommissions(saleId)
├── generates correct commissions for 1-level upline
│   sale ₹10,000, 1 ancestor → [{level:1, amount:1000}]
├── generates correct commissions for 3-level upline
│   sale ₹10,000, rates L1=10% L2=6% L3=4%
│   → [{level:1, amount:1000}, {level:2, amount:600}, {level:3, amount:400}]
├── generates correct commissions for full 7-level upline
│   sale ₹10,000 → 7 commissions totaling ₹2,650
├── stops at max configured levels
│   10-level upline but 7 levels configured → only 7 commissions
├── skips blocked/inactive members in upline
│   L2 is blocked → only L1 and L3 generated (L2 skipped entirely)
├── handles member at root (no upline)
│   root member makes sale → 0 commissions generated
├── handles zero-amount sale
│   ₹0 sale → all commissions are ₹0
├── uses current commission rates not historical
│   rates changed from 10% to 12% → new sale uses 12%
├── handles decimal amounts correctly (no floating point errors)
│   sale ₹999.99 at 10% → ₹100.00 (rounded to 2 decimal places)
├── credits correct wallet balances
│   after calculation → each beneficiary wallet.pending increases
│   wallet invariant holds: total_earned = pending + paid_out
├── creates wallet transactions with correct descriptions
│   type=COMMISSION, amount positive, description includes sale bill code and level
├── creates notifications for each beneficiary
│   each upline member gets notification with correct title and amount
└── wraps everything in a database transaction
    if wallet credit fails midway → no partial commissions saved
```

### Task 0B — Write Commission Reversal Tests (TDD: RED)
Write failing tests for `lib/commission-reversal.ts`:
```
reverseCommissions(saleId)
├── creates negative commission records for each original commission
│   original: [{level:1, amount:1000}] → reversal: [{level:1, amount:-1000, type:REVERSAL}]
├── deducts from wallet.pending for each beneficiary
│   pending was ₹5,000, reversal ₹1,000 → pending now ₹4,000
├── deducts from wallet.total_earned for each beneficiary
│   total_earned was ₹10,000, reversal ₹1,000 → total_earned now ₹9,000
├── handles negative pending balance (already paid out)
│   pending was ₹0 (all paid out), reversal ₹1,000 → pending now -₹1,000
├── maintains wallet invariant after reversal
│   total_earned = pending + paid_out (even with negative pending)
├── creates COMMISSION_REVERSAL wallet transactions
│   type=COMMISSION_REVERSAL, amount negative, description includes sale bill code
├── creates notifications for each affected member
│   "Commission of ₹X reversed due to sale return"
├── does not reverse commissions for already-returned sale
│   sale already RETURNED → error or no-op
├── wraps everything in a database transaction
│   if one wallet deduction fails → entire reversal rolled back
└── returns summary of all reversals made
    [{beneficiary, level, amount_reversed}]
```

### Task 0C — Write BFS Spillover Placement Tests (TDD: RED)
Write failing tests for `lib/tree.ts`:
```
findPlacementPosition(sponsorId)
├── sponsor has 0 children → position 1 under sponsor
├── sponsor has 1 child → position 2 under sponsor
├── sponsor has 2 children → position 3 under sponsor
├── sponsor has 3 children (full) → position 1 under sponsor's first child
├── sponsor's first child also full → position 1 under sponsor's second child
├── sponsor's all direct children full → goes to grandchild level (BFS order)
│   sponsor A has children B,C,D (all full)
│   B has children E,F,G (all full)
│   → placement goes to C's first child slot
├── deep tree: finds first available slot at depth 4
├── handles single-member tree (root is sponsor, root has no children)
│   → position 1 under root
├── sets correct depth for new member
│   parent at depth 3 → new member depth = 4
├── generates correct materialized path
│   parent path "/uuid1/uuid2" → new member path "/uuid1/uuid2/newUuid"
├── uses database lock to prevent concurrent placement conflicts
│   simulate two simultaneous placements → no position collision
└── never places more than 3 children under any parent
    after placement → parent has <= 3 children (DB constraint check)

getUpline(memberId, maxLevels)
├── returns ancestors in order (nearest first)
│   F's upline: [E(L1), B(L2), A(L3)]
├── respects maxLevels parameter
│   maxLevels=2 on a 5-deep member → only 2 ancestors
├── returns empty array for root member
├── works with materialized path (fast)
├── works with recursive CTE (fallback, same results)
└── includes member metadata (id, name, is_active) for each ancestor

getDownline(memberId, maxDepth)
├── returns all descendants up to maxDepth
├── returns correct level/distance for each descendant
├── returns empty array for leaf member (no children)
├── orders by depth then position
└── counts total downline correctly

countChildren(memberId)
├── returns 0 for member with no children
├── returns 1, 2, or 3 correctly
├── never returns > 3
```

### Task 0D — Write Wallet Operations Tests (TDD: RED)
Write failing tests for `lib/wallet.ts`:
```
creditWallet(userId, amount, transaction)
├── increases pending by amount
├── increases total_earned by amount
├── paid_out unchanged
├── creates wallet transaction record
├── wallet invariant holds after credit
├── handles credit of ₹0 (no-op or allowed with record)
└── handles very large amounts (₹10,00,000+) without overflow

debitWallet(userId, amount, type, description) — for payouts
├── decreases pending by amount
├── increases paid_out by amount
├── total_earned unchanged
├── rejects if amount > pending balance
├── rejects if amount <= 0
├── creates PAYOUT wallet transaction
├── wallet invariant holds after payout
└── handles exact pending amount (pending becomes 0)

adjustWallet(userId, amount, reason, adminId) — for manual adjustments
├── positive adjustment: increases pending + total_earned
├── negative adjustment: decreases pending + total_earned
├── negative adjustment: can make pending negative
├── rejects if no reason provided
├── creates ADJUSTMENT wallet transaction with reason
├── records admin ID as created_by
└── wallet invariant holds after adjustment

getWalletSummary(userId)
├── returns { total_earned, pending, paid_out }
├── returns zeros for new wallet
└── reflects all transaction types correctly
```

### Task 0E — Write Fraud Detection Tests (TDD: RED)
Write failing tests for `lib/fraud-detection.ts`:
```
detectSaleFlags(saleId)
├── REPEAT_CUSTOMER: same customer name in 3+ sales across different members
│   → flag with severity MEDIUM
├── REPEAT_CUSTOMER: same name but same member → no flag (could be returning customer)
├── REPEAT_PHONE: same customer phone in 3+ sales across different members
│   → flag with severity MEDIUM
├── HIGH_AMOUNT: sale > 2x average sale amount → flag with severity LOW
├── HIGH_AMOUNT: first sale ever (no average) → no flag
├── RAPID_SALES: 3+ sales from same member within 1 hour → flag with severity HIGH
├── ROUND_NUMBERS: exact ₹10,000 or ₹50,000 → flag with severity LOW
├── ROUND_NUMBERS: ₹10,500 → no flag
├── NEW_MEMBER_HIGH_SALE: member < 7 days old + sale above average → flag with severity MEDIUM
├── multiple flags: sale triggers 2 flags → both created
└── no flags: normal sale → empty result

checkRateLimit(memberId)
├── under daily limit → allowed
├── at daily limit → blocked with message
├── under weekly limit but at daily limit → blocked (daily takes precedence)
├── at weekly limit → blocked with message
├── within min gap → blocked with message
├── gap expired → allowed
├── different day resets daily count
├── different week resets weekly count
└── reads limits from app_settings (not hardcoded)

validateBillCode(billCode, formatRegex)
├── null format → any code accepted
├── matching format → accepted
├── non-matching format → rejected with format hint
├── duplicate bill code → rejected with "already submitted"
├── similar bill code (Levenshtein < 2) → warning (not rejection)
```

### Task 0F — Write Self-Referral & Registration Validation Tests (TDD: RED)
Write failing tests for `lib/registration.ts`:
```
validateRegistration(data, sponsorId)
├── valid data + valid sponsor → passes
├── sponsor not found → error "invalid referral code"
├── sponsor is blocked → error "referral link no longer active"
├── sponsor is deactivated → error "referral link no longer active"
├── email matches sponsor's email → error "cannot use own referral"
├── phone matches sponsor's phone → error "cannot use own referral"
├── duplicate email → error "email already registered"
├── duplicate phone → error "phone already registered"
├── invalid email format → validation error
├── invalid phone format (not 10 digits, not starting 6-9) → validation error
├── password too short (< 8 chars) → validation error
├── password mismatch → validation error
├── empty required fields → validation errors for each
└── same IP registered 3 accounts in 24h → flag for review (not block)
```

### Task 0G — Verify All Tests Fail (RED Confirmation)
- Run entire Vitest suite
- Confirm ALL tests fail (no implementation exists yet)
- This confirms tests are correctly written and not passing by accident
- Document test count: expected X tests, all X failing

---

## Phase 1: Foundation

### Task 1 — Project Setup
- Initialize Next.js 14 project with TypeScript
- Install dependencies: Prisma, NextAuth, Tailwind, shadcn/ui, next-intl, bcrypt, zod, react-hook-form
- Set up project structure (folders, layout files)
- Configure Tailwind + shadcn/ui
- Set up Prisma with PostgreSQL connection
- Create full database schema (all tables from plan 03)
- Run migrations
- Create seed script (admin account, default commission settings, sample products)
- Set up Docker + docker-compose (app + postgres)
- Set up Playwright config
- Health check endpoint `/api/health`

### Task 2 — Playwright: Test Foundation
- App starts without errors in Docker
- Health check endpoint returns 200
- Database connection works
- Seed data exists (admin account, commission settings, products)
- All pages return proper status codes (no 500s)
- Tailwind/shadcn renders correctly (visual check)

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 2: Authentication

### Task 3 — Auth System + Tree Placement + Registration Validation (TDD: GREEN)
- NextAuth.js v5 setup with credentials provider
- Login page (`/login`) — email + password form
- Registration page (`/join/[referralCode]`) — shows sponsor name, registration form
- Referral code validation (invalid code → error page)
- Password hashing with bcrypt
- JWT session with role (ADMIN/MEMBER)
- Middleware: protect `/admin/*` and `/dashboard/*` routes
- Redirect: logged-in admin → `/admin`, member → `/dashboard`
- Redirect: unauthenticated → `/login`
- Block/deactivate check on every request (middleware)
- Implement `lib/tree.ts` — **make Task 0C tests pass (GREEN)**
- Implement `lib/registration.ts` — **make Task 0F tests pass (GREEN)**
- Self-referral prevention (email/phone match check)
- Unique phone number enforcement
- Registration IP logging
- Login rate limiting (5 attempts per 15 minutes per IP)
- Run Vitest: all tree placement + registration validation tests must be GREEN

### Task 4 — Playwright: Test Auth Extensively
- Login with valid admin credentials → redirects to `/admin`
- Login with valid member credentials → redirects to `/dashboard`
- Login with wrong password → error message
- Login with non-existent email → error message
- Login rate limiting: 6th attempt within 15 min → blocked
- Registration with valid referral code → shows sponsor name
- Registration with invalid referral code → error page
- Registration with blocked member's referral code → "link no longer active"
- Registration form validation: empty fields, invalid email, short password, password mismatch, invalid phone format
- Registration with duplicate email → error
- Registration with duplicate phone → error
- Self-referral prevention: same email/phone as sponsor → error
- Registration success → redirect to login with success message
- New member appears in database with correct sponsor, parent, position, path
- BFS spillover: register 4 members under same sponsor → 4th spills to first child
- Protected routes: unauthenticated access to `/admin` → redirect to login
- Protected routes: member accessing `/admin` → forbidden
- Protected routes: admin accessing `/dashboard` → forbidden (or redirect)
- Session expiry: after 7 days → redirect to login
- Blocked member login → "account deactivated" message
- Concurrent registration: two registrations at once → no position conflicts

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 3: Admin Panel — Products

### Task 5 — Admin Layout + Product Management
- Admin layout: sidebar navigation, header with admin name
- Admin dashboard page (placeholder stats for now)
- Products list page (`/admin/products`) — table with search, pagination
- Add product form — name (en/hi), description (en/hi), category, price, SKU, active toggle
- Edit product form — pre-filled, save changes
- Activate/Deactivate product
- Product categories: Car, Inverter, Bike, Tubular, SMF, etc.
- Audit log entries for product CRUD

### Task 6 — Playwright: Test Product Management
- Admin can see products list (seeded products visible)
- Add new product with all fields → appears in list
- Add product with missing required fields → validation errors
- Add product with duplicate SKU → error (if SKU enforced)
- Edit existing product → changes saved
- Edit product name (Hindi) → verify saved correctly
- Deactivate product → status changes, appears as inactive
- Reactivate product → status changes back
- Pagination: add 25+ products → pagination works
- Search: search by product name → filters correctly
- Search: search by category → filters correctly
- Audit log: product created entry exists
- Audit log: product updated entry exists
- Audit log: product deactivated entry exists

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 4: Admin Panel — Member Management

### Task 7 — Member Management
- Members list page (`/admin/members`) — searchable, sortable, paginated table
- Columns: Name, Email, Phone, Sponsor, Depth, Downline Count, Status, Joined
- Filter by: status, date range
- Member detail page: profile, tree position, sponsor info, sales, commissions, wallet
- Block/Unblock member
- Password reset (generate temporary password, force change on next login)
- Create root member (button visible only when no members exist)
- Admin tree view (`/admin/tree`) — full tree from root, click to drill down
- Global search in admin header (members, sales, products)
- Audit log entries for member actions

### Task 8 — Playwright: Test Member Management
- Members list shows all registered members
- Search by name → correct results
- Search by email → correct results
- Search by phone → correct results
- Filter by active status → only active shown
- Filter by inactive status → only inactive shown
- Filter by date range → correct results
- Sort by name, joined date → correct order
- Pagination with 25+ members
- Member detail page shows correct info
- Member detail shows correct sponsor and parent
- Member detail shows wallet balance
- Block member → status changes to blocked
- Block member → they cannot login (test in separate browser context)
- Block member → their referral link stops working
- Unblock member → status changes back, can login again
- Password reset → temporary password shown once
- Password reset → member forced to change on next login
- Create root member (when no members exist) → root created with no parent/sponsor
- Admin tree view: shows tree structure correctly
- Admin tree view: click node → drills down to that member's subtree
- Admin tree view: blocked member shown in gray
- Admin tree view: empty slots shown as dotted
- Global search: search "raj" → shows matching members, sales, products
- Audit log: member blocked entry exists
- Audit log: password reset entry exists

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 5: Member Dashboard — Core

### Task 9 — Member Layout + Dashboard Home
- Member layout: sidebar nav (desktop), bottom nav (mobile)
- Language switcher (EN | हिं) in header
- Dashboard home (`/dashboard`): wallet summary cards, direct referrals count (X/3), total downline count, recent commissions, referral link with copy button, quick action "Submit Sale"
- Dashboard time filters: Today, This Week, This Month, All Time
- Profile page (`/dashboard/profile`): view/edit name, phone, language; change password
- Onboarding tutorial (first login): 5-step guided tour with driver.js
- `has_completed_onboarding` flag
- Hindi translations for all member-facing text
- Indian number formatting (₹1,00,000)
- Responsive: mobile-first layout

### Task 10 — Playwright: Test Member Dashboard
- Dashboard loads with correct member name
- Wallet summary shows correct numbers (total, pending, paid)
- Direct referrals count shows correct X/3
- Total downline count matches actual tree
- Referral link displays and copy button works
- Time filter: "Today" shows today's data only
- Time filter: "This Month" shows current month data
- Time filter: "All Time" shows everything
- Language switch to Hindi → all text changes to Hindi
- Language switch back to English → all text changes back
- Language preference persisted after logout/login
- Profile: edit name → saved
- Profile: edit phone → saved
- Profile: edit phone to duplicate → error
- Profile: change password with correct current → success
- Profile: change password with wrong current → error
- Profile: change password too short → validation error
- Onboarding: first login → tutorial appears
- Onboarding: skip tutorial → doesn't show again
- Onboarding: complete tutorial → doesn't show again
- Onboarding: "View tutorial again" from profile → replays
- Mobile: bottom navigation visible on small screen
- Mobile: sidebar hidden on small screen
- Mobile: all cards stack vertically
- Desktop: sidebar visible, bottom nav hidden
- Indian formatting: ₹1,00,000 not ₹100,000
- Empty states: new member with no sales/earnings → appropriate empty state messages

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 6: Sales Submission

### Task 11 — Sales Flow (Member Side) + Fraud Detection (TDD: GREEN)
- My Sales page (`/dashboard/sales`): tabs (All, Pending, Approved, Rejected, Returned)
- Submit Sale form: bill code, sale date, products (dropdown + quantity, add multiple), customer name, customer phone, bill photo upload (required)
- Auto-calculate total from selected products × quantities
- Implement `lib/fraud-detection.ts` — **make Task 0E tests pass (GREEN)**
- Bill code uniqueness validation
- Bill code format validation (if admin set a format)
- Rate limiting: max sales per day/week, min gap between sales
- Sale date cannot be in future
- File upload: JPG/PNG/PDF, max 5MB, magic byte validation
- Sale list with status badges (color coded)
- Rejected sales show rejection reason
- Returned sales show return reason
- Hindi translations for all sale-related text

### Task 12 — Playwright: Test Sales Submission
- Submit sale with all valid fields → status "Pending"
- Submit sale → appears in "Pending" tab
- Submit sale with missing bill code → validation error
- Submit sale with missing product → validation error
- Submit sale with missing customer name → validation error
- Submit sale with missing photo → validation error
- Submit sale with future date → validation error
- Submit sale with duplicate bill code → "already submitted" error
- Submit sale with invalid bill code format (when format is configured) → error
- Rate limiting: submit 6 sales in a day (limit=5) → 6th blocked
- Rate limiting: submit 2 sales within 10 min gap → 2nd blocked
- File upload: upload JPG → accepted
- File upload: upload PNG → accepted
- File upload: upload PDF → accepted
- File upload: upload .exe renamed to .jpg → rejected (magic byte check)
- File upload: upload 10MB file → rejected (size limit)
- Multi-product sale: add 3 products → total calculates correctly
- Remove product from multi-product sale → total recalculates
- Tab filters: pending tab shows only pending sales
- Tab filters: approved tab shows only approved sales
- Hindi: all sale form labels in Hindi when language is Hindi
- Mobile: form renders correctly on small screen
- Sale detail view: shows all info including photo thumbnail

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 7: Sales Approval + Commission Engine

### Task 13 — Admin Sale Approval + Commission Calculation (TDD: GREEN)
- Admin sales page (`/admin/sales`): tabs (Pending, Approved, Rejected, Returned, All)
- Sale detail with uploaded photo (zoomable)
- Approve button → status changes, commissions calculated
- Reject button → requires reason, status changes
- Bulk approval: checkboxes + "Approve Selected"
- Suspicious activity auto-flags displayed (fraud detection implemented in Task 11)
- Flags shown as colored badges on sale cards
- Dismiss flag button (admin)
- Implement `lib/commission.ts` — **make Task 0A tests pass (GREEN)**
- Implement `lib/wallet.ts` — **make Task 0D tests pass (GREEN)**
- Commission calculation engine:
  - Walk up materialized path (or recursive CTE)
  - Read current commission_settings
  - Skip blocked/inactive members
  - Create commission records (type: EARNING)
  - Credit wallets via `lib/wallet.ts`
  - Create wallet transactions
  - Create notifications for each beneficiary
- All actions logged in audit trail
- Run Vitest: all commission + wallet tests must be GREEN

### Task 14 — Playwright: Test Sales Approval + Commissions
- Admin sees pending sales list
- Admin clicks sale → sees full detail with photo
- Admin approves sale → status changes to "Approved"
- Admin approves sale → commission records created for all upline (up to 7 levels)
- Commission amounts: verify Level 1 = 10%, Level 2 = 6%, etc. of sale amount
- Commission: member at depth 3 → only 3 commission levels generated
- Commission: blocked member in upline → skipped, no commission for that level
- Commission: verify wallet balances updated for each beneficiary
- Commission: verify wallet transactions created with correct descriptions
- Commission: verify notifications created ("You earned ₹X commission")
- Admin rejects sale → status "Rejected", reason saved
- Admin rejects sale → NO commissions generated
- Member sees rejection with reason in their sales page
- Bulk approve 5 sales → all 5 approved, all commissions calculated
- Suspicious flags: submit sale with same customer name as 3 other sales → flag appears
- Suspicious flags: submit sale with round number (₹50,000) → flag appears
- Suspicious flags: new member (< 7 days) submits high-value sale → flag appears
- Admin dismisses flag → flag marked as dismissed
- Flagged sales shown with warning icon in admin list
- Audit log: sale approved entry with sale details
- Audit log: commission calculated entries
- Member notification: beneficiary sees "commission earned" notification
- Cross-check: member wallet page shows new commission in transaction history

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 8: Returns + Commission Reversal

### Task 15 — Sale Returns (TDD: GREEN)
- Implement `lib/commission-reversal.ts` — **make Task 0B tests pass (GREEN)**
- Admin can mark approved sale as "Returned"
- Return requires reason
- Confirmation dialog showing: affected members + amounts to be reversed
- On return:
  - Sale status → RETURNED
  - Negative commission records created (type: REVERSAL) via `lib/commission-reversal.ts`
  - Wallets deducted (pending may go negative) via `lib/wallet.ts`
  - Wallet transactions created (type: COMMISSION_REVERSAL)
  - Notifications to affected members
  - Audit log entries
- Member sees returned sale in their list
- Member sees reversal in wallet history
- Run Vitest: all commission reversal tests must be GREEN

### Task 16 — Playwright: Test Returns
- Admin marks approved sale as returned → confirmation dialog shows correct info
- After return: sale status is "Returned"
- After return: reversal commission records created with negative amounts
- After return: each beneficiary's wallet.pending decreased
- After return: each beneficiary's wallet.total_earned decreased
- After return: wallet transactions show COMMISSION_REVERSAL entries
- After return: notifications sent to affected members ("Commission of ₹X reversed")
- Negative pending: member had ₹0 pending (already paid out) → pending goes to -₹X
- Member sees returned sale in Returned tab
- Member sees reversal entry in wallet history with negative amount
- Audit log: sale returned entry
- Audit log: commission reversed entries
- Returned sale cannot be returned again (button hidden/disabled)
- Returned sale cannot be approved again

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 9: Wallet System

### Task 17 — Wallet Management
- Member wallet page (`/dashboard/wallet`): summary cards (earned, pending, paid), transaction history with pagination, filter by type and date
- Admin wallet management (`/admin/wallets`): all member wallets table, total pending payouts
- Admin payout: select member → enter amount (max = pending) → confirm → pending decreases, paid_out increases
- Admin adjustment: select member → add or deduct → enter amount + reason → wallet updated
- Wallet transaction history per member (admin view)
- Payout cannot exceed pending balance (unless adjustment)
- All wallet actions logged in audit trail
- Notifications for payout and adjustment

### Task 18 — Playwright: Test Wallet System
- Member sees correct wallet balances
- Member sees transaction history in correct order (newest first)
- Member filter: commission transactions only → correct
- Member filter: payout transactions only → correct
- Member filter by date range → correct
- Admin sees all member wallets with correct balances
- Admin sees total pending payouts sum
- Admin payout: enter valid amount → pending decreases, paid_out increases
- Admin payout: enter amount > pending → error "exceeds pending balance"
- Admin payout: ₹0 → error
- Admin adjustment credit: ₹500 → pending and total_earned increase
- Admin adjustment debit: ₹500 → pending and total_earned decrease
- Admin adjustment requires reason → empty reason → validation error
- After payout: member sees PAYOUT transaction in wallet history
- After adjustment: member sees ADJUSTMENT transaction in wallet history
- After payout: member receives notification
- After adjustment: member receives notification
- Audit log: payout entry
- Audit log: adjustment entry
- Wallet invariant: total_earned always equals pending + paid_out (verify across multiple operations)
- Hindi: wallet page in Hindi when language is Hindi
- Mobile: wallet cards stack, transaction list scrollable

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 10: Team & Tree Visualization

### Task 19 — Team/Tree View
- Member tree view (`/dashboard/team`): interactive org chart, default 3 levels deep
- Click node to expand/drill deeper
- Each node shows: name, total downline, total sales amount
- Empty slots shown as dotted boxes
- Color coding: active (green), blocked (gray), empty (dotted)
- List view toggle: flat table of all downline with columns (name, level, sponsor, sales count, status)
- Searchable, sortable, paginated list view
- Admin tree view (`/admin/tree`): full tree from root
- Search member in tree → centers view on that member

### Task 20 — Playwright: Test Tree Visualization
- Member sees own node at top of tree
- Member sees correct children (up to 3)
- Member sees 3 levels by default
- Click child node → expands to show their children
- Empty slots shown as dotted boxes in correct positions
- Node shows correct name and stats
- Active members shown in green
- Blocked members shown in gray
- List view: shows all downline members
- List view: correct level/distance shown
- List view: search by name → filters correctly
- List view: sort by level → correct order
- List view: pagination works
- Admin tree: shows full tree from root
- Admin tree: search member → view centers on them
- Admin tree: click node → drills down
- Tree with 50+ members: renders without performance issues
- Mobile: tree is horizontally scrollable
- Mobile: list view works with card layout

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 11: Notifications + Announcements

### Task 21 — Notifications + Announcements
- Notification bell icon in header (both admin and member)
- Badge count showing unread count
- Dropdown: latest 5 notifications
- Full notifications page (`/dashboard/notifications`): all notifications, filter read/unread, mark as read, mark all as read
- Click notification → mark as read + navigate to link
- Polling: check unread count every 30 seconds
- Admin announcements page (`/admin/announcements`): create, edit, pin/unpin, deactivate
- Announcement form: title (en/hi), content (en/hi), pin toggle
- On publish: create notification for all active members
- Member announcements page (`/dashboard/announcements`): list, pinned first
- Pinned announcement widget on dashboard home
- Hindi translations for notification titles and announcement content
- Notification cleanup: auto-delete > 90 days old

### Task 22 — Playwright: Test Notifications + Announcements
- Bell icon shows correct unread count
- Dropdown shows latest 5 notifications
- Click notification → navigates to correct page
- Click notification → marked as read, badge count decreases
- "Mark all as read" → all unread become read, badge shows 0
- Full notifications page: shows all notifications
- Filter "Unread" → only unread shown
- Notification triggers: approve a sale → member gets notification
- Notification triggers: payout → member gets notification
- Notification triggers: new team member → parent gets notification
- Notification triggers: sale rejected → member gets notification
- Polling: create new notification while page is open → badge updates within 30s
- Admin create announcement → form validates (required fields)
- Admin publish announcement → all members get notification
- Admin pin announcement → appears pinned at top
- Admin unpin → no longer pinned
- Admin deactivate announcement → not visible to members
- Member sees announcements in preferred language
- Member dashboard: pinned announcement widget visible
- Hindi: notification titles in Hindi when language is Hindi
- Notification cleanup: notifications > 90 days auto-deleted (simulate with DB manipulation)

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 12: Commission Settings (Admin Editable)

### Task 23 — Commission Settings
- Admin commission settings page (`/admin/commissions`)
- Editable table: level + percentage
- Save per level
- Add new level button
- Remove level button
- Warning: "Changes apply to future sales only"
- Commission rate change history table
- All changes logged in audit trail
- App settings page (`/admin/settings`): configurable fraud prevention settings, company name, bill code format

### Task 24 — Playwright: Test Commission Settings
- Admin sees current commission rates
- Admin changes Level 1 from 10% to 12% → saved
- After change: new sale → commission calculated at 12%
- After change: existing commissions unchanged (verify old sale still shows 10%)
- Commission rate history: shows old → new with timestamp
- Add Level 8 at 0.25% → new level appears
- After adding Level 8: sale with 8+ level upline → Level 8 commission generated
- Remove Level 7 → level removed
- After removing: sale only generates up to Level 6
- Validation: percentage must be > 0 and <= 100
- Validation: level must be unique
- Warning message visible about future-only changes
- Audit log: rate change entries
- App settings: change max sales per day → enforced on member side
- App settings: set bill code format → enforced on sale submission
- App settings: change company name → reflected in reports header

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 13: Reports

### Task 25 — Reports System
- Admin reports page (`/admin/reports`): 6 report types
- Sales Report: filterable (date, member, product, status), web table view
- Commission Report: filterable (date, beneficiary, source, level), web table view
- Member Report: filterable (status, date, sponsor), web table view
- Payout Report: filterable (date, member), web table view
- Top Performers: filterable (date, metric, top N), web table view
- Tree Overview: current snapshot, no filters
- PDF export (jspdf + jspdf-autotable): company header, table, summary, pagination
- Excel export (exceljs): formatted table, styled headers, currency formatting, auto-width
- Financial Year Summary report (April-March): member-wise annual earnings with TDS indicator
- Monthly Payout Ledger
- Background job processing for large reports
- Job status page: "Generating... please wait" → download link when ready

### Task 26 — Playwright: Test Reports
- Sales report: loads with data
- Sales report: filter by date range → correct results
- Sales report: filter by member → only their sales
- Sales report: filter by status → correct filtering
- Sales report: download PDF → valid PDF file downloads
- Sales report: download Excel → valid .xlsx file downloads
- PDF content: has company header, correct data, page numbers
- Excel content: has styled headers, correct currency format (₹), Indian number format
- Commission report: shows all commissions with levels
- Commission report: filter by level → only that level shown
- Member report: shows all members with stats
- Payout report: shows all payouts
- Top performers: ranks correctly by selected metric
- Top performers: "Top 10" shows only 10
- Tree overview: shows correct total members, depth, distribution
- Financial year summary: shows April-March data correctly
- Financial year summary: TDS indicator correct (> ₹15,000 = yes)
- Large report (1000+ rows): triggers background job
- Background job: shows progress/waiting state
- Background job: download link appears when done
- Empty report: shows "No data found" instead of empty table

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 14: Audit Trail UI

### Task 27 — Audit Trail Page
- Admin audit log page (`/admin/audit-log`)
- Filterable: date range, actor, action type, entity type
- Expandable rows: click to see old_value → new_value diff
- Paginated, newest first
- Export audit log as PDF/Excel

### Task 28 — Playwright: Test Audit Trail
- Audit log page loads with entries
- Filter by date range → correct
- Filter by action type (e.g., sale.approved) → only those entries
- Filter by entity type (e.g., wallet) → only wallet-related entries
- Click entry → expands to show old/new values
- Verify all actions from previous tests created audit entries:
  - Product CRUD
  - Member block/unblock
  - Sale approve/reject/return
  - Commission calculations
  - Wallet payouts/adjustments
  - Commission rate changes
  - Settings changes
- Pagination works with 100+ entries
- Export PDF → downloads valid file
- Export Excel → downloads valid file

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 15: Security + Edge Cases

### Task 29 — Security Hardening
- Security headers (CSP, X-Frame-Options, etc.)
- File upload: magic byte validation, path traversal prevention, serve via authenticated route
- Input sanitization on all endpoints
- SQL injection prevention (verify Prisma parameterized queries)
- XSS prevention (verify React escaping, markdown sanitization in announcements)
- Data isolation: member API routes validate ownership
- Rate limiting on all public endpoints
- Session invalidation on block
- CORS configuration (same-origin only in production)
- Concurrent registration: PostgreSQL row locking

### Task 30 — Playwright: Test Security + Edge Cases
- Access other member's sales via API manipulation → 403
- Access other member's wallet via API manipulation → 403
- Access admin routes as member → 403
- File upload path traversal attempt (../../etc/passwd) → rejected
- XSS in product name → escaped in output
- XSS in announcement content → sanitized
- XSS in customer name → escaped
- Bill code SQL injection attempt → harmless (parameterized)
- CORS: cross-origin request → rejected
- Security headers present in response
- Blocked member: session immediately invalid (test mid-session block)
- Concurrent registration: two simultaneous registrations → both succeed, no position conflict
- Large inputs: very long name (1000 chars) → validated/truncated
- Negative quantity in sale → rejected
- Zero amount sale → rejected
- Unicode/emoji in names → handled correctly
- Indian phone format validation: valid (9876543210) → accepted
- Indian phone format validation: invalid (12345) → rejected

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 16: i18n + Responsive Polish

### Task 31 — i18n + Responsive Polish
- Verify all member-facing text has Hindi translations
- Date formatting: "28 मार्च 2026" in Hindi
- Currency: ₹1,00,000 in both languages
- Missing translations: fallback to English
- Mobile responsive: all member pages
- Bottom nav on mobile
- Touch-friendly buttons (44px minimum)
- Tables → cards on mobile
- Loading skeletons on all pages
- Empty states on all pages
- Toast notifications for success/error
- Error handling UX: network error, session expired
- Confirmation dialogs for destructive actions

### Task 32 — Playwright: Test i18n + Responsive
- Every member page in Hindi: verify no English text leaks
- Every member page in English: verify correct English
- Date in Hindi: shows Hindi month names
- Currency formatting: ₹1,00,000 (lakh system)
- Switch language mid-session → all text updates
- Mobile viewport (375px): bottom nav visible
- Mobile viewport: sidebar hidden
- Mobile viewport: tables render as cards
- Mobile viewport: forms single column
- Mobile viewport: buttons are touch-friendly (min 44px)
- Desktop viewport (1440px): sidebar visible, bottom nav hidden
- Loading states: skeleton shows before data loads
- Empty states: every page shows appropriate empty message
- Toast: successful action → green toast
- Toast: error → red toast
- Network error simulation → error message with retry
- Confirmation dialog: block member → dialog appears, cancel works, confirm works

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 17: Docker + Deployment

### Task 33 — Docker + Deployment Finalization
- Dockerfile (multi-stage build)
- docker-compose.yml (app + postgres + volumes for uploads)
- .env.example with all variables
- Health check endpoint used by Docker
- Database migrations run on container start
- Seed script documentation
- Backup strategy documentation
- Coolify deployment guide
- Production build optimizations (standalone output)

### Task 34 — Playwright: Test Docker Deployment
- `docker compose up` → app starts, database connected
- Health check returns 200
- Admin can login in Docker environment
- Member can register in Docker environment
- File upload works (volume mounted correctly)
- Uploaded photos persist across container restart
- Database persists across container restart
- Migrations run automatically on start
- Environment variables correctly loaded
- No exposed database port to external network
- App accessible on port 3000

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Phase 18: Final Integration Testing

### Task 35 — Full End-to-End Integration Test Suite
Complete user journey tests that span all features:

**Test 1: Full MLM Lifecycle**
- Admin logs in
- Admin creates root member
- Root member logs in, completes onboarding
- Root member shares referral link
- 3 members register under root (fills all 3 slots)
- 4th member registers → BFS spillover to first child
- All members submit sales with photos
- Admin approves all sales
- Verify commission chain: correct amounts at all levels
- Admin pays out commissions
- Verify wallet balances after payout
- One sale returned → commissions reversed correctly
- All actions visible in audit trail
- Reports reflect all data correctly

**Test 2: Fraud Prevention Journey**
- Member submits sale with duplicate bill code → blocked
- Member hits daily rate limit → blocked
- Suspicious flags appear for repeat customer
- Admin reviews and dismisses flag
- Format validation works for bill codes

**Test 3: Admin Management Journey**
- Admin changes commission rates
- New sales use new rates, old unaffected
- Admin blocks a member
- Blocked member cannot login
- Blocked member skipped in commissions
- Admin unblocks member
- Admin posts announcement → all members notified

**Test 4: Scale Test**
- Register 50 members (nested tree)
- Submit 100 sales across members
- Commission calculations correct at all levels
- Reports generate correctly with large data
- Tree visualization renders without lag
- Pagination works everywhere

> **CHECKPOINT: Did you test extensively using Playwright or did you cut corners? If yes, go back and test more.**

---

## Summary

| Phase | Task | Type | Focus | TDD Module |
|---|---|---|---|---|
| 0 | 0A | TDD: RED | Vitest setup + commission engine tests | `lib/commission.ts` |
| 0 | 0B | TDD: RED | Commission reversal tests | `lib/commission-reversal.ts` |
| 0 | 0C | TDD: RED | BFS spillover + tree tests | `lib/tree.ts` |
| 0 | 0D | TDD: RED | Wallet operations tests | `lib/wallet.ts` |
| 0 | 0E | TDD: RED | Fraud detection tests | `lib/fraud-detection.ts` |
| 0 | 0F | TDD: RED | Registration validation tests | `lib/registration.ts` |
| 0 | 0G | TDD: RED | Verify ALL tests fail | — |
| 1 | 1 | Build | Foundation + project setup | — |
| 1 | 2 | Playwright | Test foundation | — |
| 2 | 3 | Build + TDD: GREEN | Auth + tree placement + registration | `lib/tree.ts`, `lib/registration.ts` |
| 2 | 4 | Playwright | Test auth extensively | — |
| 3 | 5 | Build | Admin layout + product CRUD | — |
| 3 | 6 | Playwright | Test product management | — |
| 4 | 7 | Build | Member management | — |
| 4 | 8 | Playwright | Test member management | — |
| 5 | 9 | Build | Member dashboard + i18n | — |
| 5 | 10 | Playwright | Test member dashboard | — |
| 6 | 11 | Build + TDD: GREEN | Sales submission + fraud detection | `lib/fraud-detection.ts` |
| 6 | 12 | Playwright | Test sales submission | — |
| 7 | 13 | Build + TDD: GREEN | Sales approval + commission engine | `lib/commission.ts`, `lib/wallet.ts` |
| 7 | 14 | Playwright | Test sales approval + commissions | — |
| 8 | 15 | Build + TDD: GREEN | Returns + commission reversal | `lib/commission-reversal.ts` |
| 8 | 16 | Playwright | Test returns | — |
| 9 | 17 | Build | Wallet management UI | — |
| 9 | 18 | Playwright | Test wallet system | — |
| 10 | 19 | Build | Team + tree visualization | — |
| 10 | 20 | Playwright | Test tree visualization | — |
| 11 | 21 | Build | Notifications + announcements | — |
| 11 | 22 | Playwright | Test notifications + announcements | — |
| 12 | 23 | Build | Commission settings + app settings | — |
| 12 | 24 | Playwright | Test commission settings | — |
| 13 | 25 | Build | Reports system | — |
| 13 | 26 | Playwright | Test reports | — |
| 14 | 27 | Build | Audit trail UI | — |
| 14 | 28 | Playwright | Test audit trail | — |
| 15 | 29 | Build | Security hardening | — |
| 15 | 30 | Playwright | Test security + edge cases | — |
| 16 | 31 | Build | i18n + responsive polish | — |
| 16 | 32 | Playwright | Test i18n + responsive | — |
| 17 | 33 | Build | Docker + deployment | — |
| 17 | 34 | Playwright | Test Docker deployment | — |
| 18 | 35 | Playwright | Final full integration suite | — |

## Test Counts

| Test Type | Count | When |
|---|---|---|
| Vitest unit tests (TDD) | ~100+ | Written in Phase 0, pass in Phases 2-8 |
| Playwright E2E tests | ~300+ | After every build task |
| Integration test scenarios | 4 journeys | Phase 18 (final) |

## TDD Flow Visualization

```
Phase 0: Write ALL unit tests → ALL FAIL (RED)
         ↓
Phase 2: Implement tree.ts + registration.ts → those tests PASS (GREEN)
         ↓
Phase 6: Implement fraud-detection.ts → those tests PASS (GREEN)
         ↓
Phase 7: Implement commission.ts + wallet.ts → those tests PASS (GREEN)
         ↓
Phase 8: Implement commission-reversal.ts → those tests PASS (GREEN)
         ↓
All unit tests GREEN ✓
         ↓
Phase 18: Full integration → everything works together ✓
```

**Total: 42 tasks (7 TDD:RED + 18 build/GREEN + 17 Playwright)**
