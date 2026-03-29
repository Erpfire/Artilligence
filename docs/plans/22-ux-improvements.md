# UX Improvements

## 1. Mobile-First Design

Indian market is 80%+ mobile. The member dashboard must be designed for phones first.

### Bottom Navigation Bar (Mobile)
```
┌─────────────────────────────────┐
│                                 │
│        Page Content             │
│                                 │
├─────────────────────────────────┤
│  🏠    📊    💰    👥    ≡     │
│ Home  Sales Wallet Team  More  │
└─────────────────────────────────┘
```

- Fixed at bottom on mobile screens (< 768px)
- Hidden on desktop (side nav used instead)
- "More" contains: Referral, Profile, Announcements, Notifications

### Touch Targets
- All buttons: minimum 44px × 44px
- Adequate spacing between interactive elements
- No hover-only interactions (mobile has no hover)

### Responsive Tables
On mobile, tables convert to **card layout**:

Desktop:
```
| Bill Code | Amount | Date   | Status   |
|-----------|--------|--------|----------|
| MB-001    | ₹8,000 | 28 Mar | Approved |
```

Mobile:
```
┌──────────────────────┐
│ MB-001               │
│ ₹8,000  •  28 Mar    │
│ ✅ Approved           │
└──────────────────────┘
```

### Pull-to-Refresh
- On sale list, wallet, notifications pages
- Native-feeling refresh on mobile

## 2. Onboarding Tutorial (First Login)

When a member logs in for the first time, show a step-by-step guided tour:

**Step 1:** "Welcome to Artilligence! 👋"
- Brief explanation of how the system works

**Step 2:** "This is your Dashboard"
- Highlight wallet summary, team count, referral link

**Step 3:** "Submit Sales"
- Show how to submit a sale with bill code

**Step 4:** "Build Your Team"
- Explain referral link and how to share it

**Step 5:** "Track Your Earnings"
- Show wallet page

**Implementation:** Use a lightweight tooltip/spotlight library (e.g., `driver.js` — zero external dependencies, runs entirely in browser)

**Skip option:** "Skip tutorial" button always visible
**Replay:** Available from profile page: "View tutorial again"

**Track:** `has_completed_onboarding` flag on user record

## 3. Dashboard Time Filters

Dashboard stats should be filterable:

```
[Today] [This Week] [This Month] [All Time]

┌──────────┐ ┌──────────┐ ┌──────────┐
│ Sales    │ │ Earned   │ │ Team     │
│ ₹24,000  │ │ ₹3,200   │ │ 12 new   │
│ 3 sales  │ │ from 8   │ │ members  │
│ this mon │ │ sales    │ │ this mon │
└──────────┘ └──────────┘ └──────────┘
```

## 4. Global Search (Admin)

Search bar in admin header that searches across:
- Members (name, email, phone)
- Sales (bill code)
- Products (name)

```
🔍 [Search members, sales, products...]
    ┌─────────────────────────────────┐
    │ Members                         │
    │   Rajesh Kumar (rajesh@...)     │
    │   Rajesh Singh (rsingh@...)     │
    │ Sales                           │
    │   MB-RAJ-001 (₹14,000)         │
    └─────────────────────────────────┘
```

**Implementation:** Single search endpoint that queries multiple tables. Debounced input (300ms).

## 5. Bulk Sale Approval

Admin can approve multiple sales at once:

```
☐ Select All
☑ MB-001  Rajesh  ₹14,000  28 Mar
☑ MB-002  Suresh  ₹8,000   27 Mar
☐ MB-003  Priya   ₹22,500  28 Mar  ⚠️ Flagged

[Approve Selected (2)]  [Reject Selected]
```

- Flagged sales shown with warning icon — admin should review individually
- Bulk approve creates one job that processes all sales sequentially
- Progress indicator: "Approving 2 of 15 sales..."

## 6. Quick Actions (Admin Dashboard)

Most common tasks accessible from dashboard:

```
Quick Actions
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Pending  │ │ Add      │ │ Post     │ │ Generate │
│ Sales    │ │ Product  │ │ Notice   │ │ Report   │
│ (7)      │ │          │ │          │ │          │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

## 7. Empty States

Every page should have a meaningful empty state (not just blank):

**No sales yet:**
```
┌─────────────────────────────┐
│      📋                     │
│  No sales yet               │
│  Submit your first sale     │
│  to start earning!          │
│                             │
│  [Submit a Sale →]          │
└─────────────────────────────┘
```

**No team members:**
```
┌─────────────────────────────┐
│      👥                     │
│  Your team is empty         │
│  Share your referral link   │
│  to start building!         │
│                             │
│  [Copy Referral Link]       │
└─────────────────────────────┘
```

## 8. Loading States

- Skeleton screens (not spinners) for page loads
- Shimmer animation on cards/tables while loading
- Optimistic updates where safe (e.g., mark notification as read)

## 9. Error Handling UX

- Toast notifications for success/error (top-right)
- Form validation: inline errors below each field (not just a banner at top)
- Network error: "Unable to connect. Please check your internet." with retry button
- Session expired: Redirect to login with message

## 10. Confirmation Dialogs

For destructive actions:
- Block member
- Return a sale
- Wallet adjustment
- Delete product

Show a modal with:
- What will happen (consequences listed)
- Required confirmation (reason field for some actions)
- Cancel + Confirm buttons (Confirm in red for destructive)

## 11. Data Formatting

- Amounts: ₹14,000.00 (Indian number format with commas: 1,00,000)
- Dates: 28 Mar 2026 (human readable, not ISO)
- Phone: Display with country code option
- Relative time: "2 minutes ago", "yesterday", then absolute date
