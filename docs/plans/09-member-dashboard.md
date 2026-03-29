# Member Dashboard

## Access
- Authenticated members only
- English + Hindi (member can switch language)
- URL: `/dashboard/*`

## Pages

### 1. Dashboard Home (`/dashboard`)
Quick overview:
- Welcome message with name
- My wallet summary (earned, pending, paid)
- My direct referrals count (X / 3 slots filled)
- My total downline count
- Recent commissions earned
- My referral link (copy button)
- Quick action: Submit new sale

### 2. My Sales (`/dashboard/sales`)

**Tabs:**
- All Sales
- Pending
- Approved
- Rejected

**List View:**
- Bill code, products, amount, date, status
- Status badges: Pending (yellow), Approved (green), Rejected (red)
- Rejected sales show rejection reason
- [+ Submit New Sale] button

**Submit Sale Form:**
```
Bill Code:      [________________]
Sale Date:      [__ / __ / ____]

Products:
┌────────────────────────────────────┐
│ Product: [Dropdown ▾]              │
│ Quantity: [__]                     │
│ Price: ₹8,000 (auto-filled)       │
│                       [Remove]     │
├────────────────────────────────────┤
│ Product: [Dropdown ▾]              │
│ Quantity: [__]                     │
│ Price: ₹14,000 (auto-filled)      │
│                       [Remove]     │
└────────────────────────────────────┘
[+ Add Product]

Customer Name:  [________________]
Customer Phone: [________________]

Total: ₹22,000

[Submit Sale]
```

### 3. My Wallet (`/dashboard/wallet`)

**Summary Cards:**
- Total Earned: ₹XX,XXX
- Pending: ₹XX,XXX
- Paid Out: ₹XX,XXX

**Transaction History:**
- Paginated, newest first
- Each entry: Date, Type (Commission/Payout/Adjustment), Amount, Description
- Filter by type and date range

### 4. My Team / Tree (`/dashboard/team`)

**Two Views:**

**a) Tree View (Visual)**
- Interactive organizational chart
- Shows member's own position at the top
- Default: 3 levels deep
- Click to expand deeper
- Each node shows: Name, total sales, total downline
- Empty slots shown as dotted boxes
- Color coding: Active (green), Inactive (gray), Empty (dotted)

```
            ┌──────────┐
            │   You     │
            │ ₹1.2L     │
            └────┬──────┘
        ┌────────┼────────┐
   ┌────┴───┐┌───┴───┐┌───┴────┐
   │ Rajesh ││ Suresh││ ┌····┐ │
   │ ₹45K   ││ ₹22K  ││ │Open│ │
   └────┬───┘└───┬───┘└─┘····┘─┘
   ┌────┼────┐
┌──┴─┐┌─┴──┐┌┴───┐
│Amit││Neha ││Open│
│₹8K ││₹12K││    │
└────┘└────┘└────┘
```

**b) List View (Table)**
- Flat list of all downline members
- Columns: Name, Level (distance), Sponsor, Sales Count, Total Sales Amount, Status
- Sortable, searchable, paginated
- Useful for large teams where tree view becomes hard to navigate

### 5. My Referral (`/dashboard/referral`)

- My unique referral link: `https://artilligence.com/join/ABC123`
- Copy to clipboard button
- Share via WhatsApp button (important for Indian market)
- QR code for the referral link
- My referral stats:
  - Total people joined via my link
  - Direct referrals (sponsor relationship)
  - Tree placements under me

### 6. My Profile (`/dashboard/profile`)

- View/edit: Name, Phone, Email
- Change password
- Switch language (English / Hindi)
- Account info: Member since, Referral code, Sponsor name

## Language Switching

- Toggle in the top navigation bar: `EN | हिं`
- Preference saved in user profile
- Applied to all member-facing pages
- Product names show in selected language
- Admin panel is always English regardless of this setting

## Responsive Design

All member pages must work on mobile:
- Tree view: Horizontal scroll or simplified vertical list
- Forms: Single column layout
- Tables: Horizontal scroll or card layout on mobile
- Bottom navigation bar on mobile (Dashboard, Sales, Wallet, Team, More)
