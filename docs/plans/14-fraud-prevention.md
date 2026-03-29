# Fraud Prevention

## Overview
Since sales happen offline and bill codes are entered manually, fraud prevention is critical. These measures work entirely within the app — no external services needed.

## 1. Bill Photo Upload (Required)

When submitting a sale, member **must upload a photo** of the MyBillBook receipt/bill.

**Implementation:**
- File upload field in sale submission form (required)
- Accepted formats: JPG, PNG, PDF
- Max file size: 5MB
- Stored on server filesystem (not database) in `/uploads/bills/{sale_id}/`
- Admin sees the photo when reviewing the sale
- Photo can be zoomed/expanded in admin review

**Storage structure:**
```
/uploads/
└── bills/
    ├── {sale_id_1}/
    │   └── receipt.jpg
    └── {sale_id_2}/
        └── receipt.png
```

**Docker volume mount:** This directory must be persisted via Docker volume so uploads survive container restarts.

```yaml
# docker-compose.yml addition
volumes:
  - uploads:/app/uploads
```

## 2. Bill Code Format Validation

Admin can configure an expected bill code format (regex pattern).

**Examples:**
- `INV-\d{4}` matches `INV-0001`, `INV-9999`
- `MB-\d{8}-\d{3}` matches `MB-20260328-001`
- If no format is set, any string is accepted

**Stored in:** `app_settings` table

**Validation:** Client-side (instant feedback) + server-side (enforced)

## 3. Rate Limiting on Sales

Prevent members from flooding the system with fake entries.

**Rules (configurable by admin):**
| Rule | Default | Purpose |
|---|---|---|
| Max sales per day per member | 5 | Prevent bulk fake entries |
| Max sales per week per member | 20 | Weekly sanity check |
| Min gap between sales (minutes) | 10 | Prevent rapid-fire submissions |

**Stored in:** `app_settings` table

**Behavior:** If limit hit, show message: "You've reached the maximum sales submissions for today. Please try again tomorrow."

## 4. Suspicious Activity Auto-Flags

System automatically flags sales for extra admin attention:

| Flag | Condition | Severity |
|---|---|---|
| `REPEAT_CUSTOMER` | Same customer name appears in 3+ sales across different members | Medium |
| `REPEAT_PHONE` | Same customer phone in 3+ sales across different members | Medium |
| `HIGH_AMOUNT` | Sale amount exceeds 2x the average sale amount | Low |
| `RAPID_SALES` | 3+ sales submitted within 1 hour | High |
| `ROUND_NUMBERS` | Sale amount is suspiciously round (e.g., ₹50,000 exactly) | Low |
| `NEW_MEMBER_HIGH_SALE` | Member joined < 7 days ago and submits high-value sale | Medium |

**Implementation:**
- Flags are stored in a `sale_flags` table
- Admin sees flags as colored badges on the sale review page
- Flags don't block submission — they just alert admin
- Admin can dismiss flags after review

### sale_flags table
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| sale_id | UUID | FK → sales.id |
| flag_type | ENUM | One of the types above |
| severity | ENUM | `LOW`, `MEDIUM`, `HIGH` |
| details | TEXT | Human-readable explanation |
| dismissed | BOOLEAN | Admin dismissed this flag |
| dismissed_by | UUID | FK → users.id |
| created_at | TIMESTAMP | |

## 5. Self-Referral Prevention

A member cannot create an account using their own referral link.

**Checks:**
- Email must not match sponsor's email
- Phone must not match sponsor's phone
- Same device/IP heuristic (store IP on registration, flag if same IP creates multiple accounts within 24 hours)

## 6. Duplicate Detection

- **Unique bill code** — enforced at DB level. If someone enters a bill code that already exists, show: "This bill code has already been submitted."
- **Similar bill codes** — warn if a bill code is very similar to an existing one (Levenshtein distance < 2). E.g., "Did you mean MB-0001? A sale with that code already exists."

## 7. Ghost Member Detection

Monthly automated report for admin:

**"Inactive Members" report shows:**
- Members who haven't submitted any sale in 90+ days
- Members with 0 sales ever (joined but never active)
- Members with suspiciously identical registration details (same IP, similar names)

**Admin can:**
- View these members
- Send announcement reminder
- Deactivate if confirmed fake

## 8. Unique Phone Number Enforcement

- One phone number = one account
- Phone number validated at registration (Indian format: 10 digits, starts with 6-9)
- Cannot change phone to one already used by another account
- Prevents same person from creating multiple accounts
