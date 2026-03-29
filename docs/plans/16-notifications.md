# In-App Notifications

## Overview
Fully in-app notification system. No external services (no email, no SMS, no WhatsApp). Members see notifications inside the app via a bell icon.

## notifications Table

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id (recipient) |
| type | VARCHAR(50) | Notification type |
| title | VARCHAR(255) | Short title |
| title_hi | VARCHAR(255) | Hindi title |
| message | TEXT | Detailed message |
| message_hi | TEXT | Hindi message |
| link | VARCHAR(255) | URL to navigate to when clicked (nullable) |
| is_read | BOOLEAN | Default false |
| created_at | TIMESTAMP | |

**Index:** `user_id + is_read + created_at` (unread notifications for a user, newest first)

## Notification Types & Triggers

### For Members

| Type | Trigger | Title | Link |
|---|---|---|---|
| `sale.approved` | Admin approves member's sale | "Your sale #MB-001 has been approved" | `/dashboard/sales` |
| `sale.rejected` | Admin rejects member's sale | "Your sale #MB-001 was rejected" | `/dashboard/sales` |
| `commission.earned` | Commission credited to wallet | "You earned ₹600 commission" | `/dashboard/wallet` |
| `team.new_member` | Someone joins under you in tree | "Priya Sharma joined your team" | `/dashboard/team` |
| `wallet.payout` | Admin marks payout as paid | "₹5,000 payout processed" | `/dashboard/wallet` |
| `wallet.adjustment` | Admin adjusts wallet | "Wallet adjusted: +₹500" | `/dashboard/wallet` |
| `announcement` | Admin posts announcement | Announcement title | `/dashboard/announcements` |
| `sale.returned` | Admin marks a sale as returned | "Your sale #MB-001 has been returned" | `/dashboard/sales` |
| `commission.reversed` | Commission reversed due to return | "Commission of ₹600 reversed" | `/dashboard/wallet` |

### For Admin

| Type | Trigger | Title | Link |
|---|---|---|---|
| `sale.submitted` | Member submits new sale | "New sale submitted by Rajesh" | `/admin/sales` |
| `member.registered` | New member joins | "New member: Priya Sharma" | `/admin/members` |
| `flag.suspicious` | Suspicious activity detected | "Suspicious sale flagged" | `/admin/sales` |

## UI — Notification Bell

**Location:** Top-right of navigation bar (both admin and member)

```
┌─────────────────────────────────────────────┐
│  Logo    Dashboard  Sales  Wallet  Team  🔔3 │
└─────────────────────────────────────────────┘
                                            │
                                            ▼
                              ┌──────────────────────┐
                              │ Notifications         │
                              ├──────────────────────┤
                              │ 🟢 Sale #MB-001      │
                              │    approved           │
                              │    2 min ago          │
                              ├──────────────────────┤
                              │ 🟢 You earned ₹600   │
                              │    commission         │
                              │    5 min ago          │
                              ├──────────────────────┤
                              │ ⚪ New team member    │
                              │    Priya joined       │
                              │    1 hour ago         │
                              ├──────────────────────┤
                              │ [Mark all as read]    │
                              │ [View all →]          │
                              └──────────────────────┘
```

- **Badge count** on bell icon shows unread count
- **Dropdown** shows latest 5 notifications
- **"View all"** goes to full notifications page
- **Click notification** → marks as read + navigates to link
- **🟢** = unread, **⚪** = read

## Full Notifications Page (`/dashboard/notifications`)

- Paginated list of all notifications
- Filter: All / Unread
- Mark individual or all as read
- Sorted newest first

## Polling vs Real-Time

**Phase 1 (MVP):** Poll every 30 seconds
- Simple: `GET /api/notifications/unread-count` every 30s
- Update bell badge
- Fetch full list when dropdown opens

**Phase 2 (future):** Server-Sent Events (SSE)
- Real-time push without WebSockets complexity
- Still no external service needed
- Next.js supports SSE via route handlers

## Notification Preferences (Future)

Members could toggle which notifications they want:
- Sale updates: ON/OFF
- Commission alerts: ON/OFF
- Team updates: ON/OFF

For MVP, all notifications are on. Keep it simple.

## Cleanup

- Notifications older than 90 days are auto-deleted (cron job or on-read cleanup)
- Prevents unbounded table growth
