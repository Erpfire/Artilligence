# App Settings (Admin Configurable)

## Overview
Centralized settings that admin can change from the UI without touching code.

## app_settings Table

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| key | VARCHAR(100) | Unique setting key |
| value | JSONB | Setting value |
| description | TEXT | Human-readable description |
| updated_at | TIMESTAMP | |

## Settings

### Fraud Prevention
| Key | Default | Description |
|---|---|---|
| `max_sales_per_day` | `5` | Max sale submissions per member per day |
| `max_sales_per_week` | `20` | Max sale submissions per member per week |
| `min_sale_gap_minutes` | `10` | Minimum minutes between two sale submissions |
| `bill_code_format` | `null` | Regex pattern for bill code validation (null = any) |
| `ghost_member_inactive_days` | `90` | Days of inactivity before flagging as ghost |

### Business
| Key | Default | Description |
|---|---|---|
| `company_name` | `"Artilligence Technology Pvt Ltd"` | Company name on reports |
| `currency_symbol` | `"₹"` | Currency symbol |
| `currency_code` | `"INR"` | ISO currency code |

### Notifications
| Key | Default | Description |
|---|---|---|
| `notification_retention_days` | `90` | Auto-delete notifications older than this |
| `notification_poll_interval_seconds` | `30` | Client-side poll interval |

## Admin Settings Page (`/admin/settings`)

```
┌─────────────────────────────────────────────┐
│ App Settings                                 │
├─────────────────────────────────────────────┤
│                                              │
│ Fraud Prevention                             │
│ ─────────────────                            │
│ Max sales per day:     [5___]                │
│ Max sales per week:    [20__]                │
│ Min gap (minutes):     [10__]                │
│ Bill code format:      [________] (regex)    │
│ Inactive days (ghost): [90__]                │
│                                              │
│ Company                                      │
│ ─────────────────                            │
│ Company name:    [Artilligence Technology...] │
│                                              │
│ [Save Changes]                               │
└─────────────────────────────────────────────┘
```

All changes logged in audit trail.
