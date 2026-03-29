# Reports System

## Overview
Admin can generate reports in three formats:
1. **Web UI** — Interactive tables with charts on the reports page
2. **PDF** — Downloadable, printable document (via jspdf + jspdf-autotable)
3. **Excel** — Downloadable .xlsx spreadsheet (via exceljs)

## Available Reports

### 1. Sales Report
**Purpose:** Track all sales activity

**Filters:**
- Date range (from — to)
- Member (dropdown)
- Product (dropdown)
- Status (Pending / Approved / Rejected / All)

**Columns:**
| Column | Description |
|---|---|
| Bill Code | MyBillBook bill code |
| Member | Who submitted the sale |
| Product(s) | Items sold |
| Quantity | Total items |
| Amount (₹) | Total sale amount |
| Customer | Customer name |
| Sale Date | Date of sale |
| Status | Pending / Approved / Rejected |
| Approved Date | When admin approved |

**Summary row:** Total sales count, total amount

---

### 2. Commission Report
**Purpose:** Track all commission payouts

**Filters:**
- Date range
- Beneficiary (who earned)
- Source member (whose sale generated it)
- Level (1-7)

**Columns:**
| Column | Description |
|---|---|
| Date | When commission was generated |
| Beneficiary | Who earned the commission |
| Source Member | Whose sale triggered it |
| Bill Code | Related sale |
| Sale Amount (₹) | Original sale amount |
| Level | Commission level (1-7) |
| Percentage | % applied |
| Commission (₹) | Amount earned |

**Summary:** Total commissions, breakdown by level

---

### 3. Member Report
**Purpose:** Overview of all members

**Filters:**
- Status (Active / Inactive / All)
- Join date range
- Sponsor

**Columns:**
| Column | Description |
|---|---|
| Name | Member name |
| Email | Contact |
| Phone | Contact |
| Sponsor | Who referred them |
| Depth | Level in tree |
| Direct Children | Count (max 3) |
| Total Downline | Recursive count |
| Total Sales | Number of approved sales |
| Total Sales Amount (₹) | Sum of approved sales |
| Total Earnings (₹) | Commission earnings |
| Status | Active / Inactive |
| Joined | Registration date |

**Summary:** Total members, active/inactive count, avg sales per member

---

### 4. Payout Report
**Purpose:** Track cash payments to members

**Filters:**
- Date range
- Member

**Columns:**
| Column | Description |
|---|---|
| Date | Payout date |
| Member | Who received payment |
| Amount (₹) | Cash paid |
| Pending Before | Balance before payout |
| Pending After | Balance after payout |
| Note | Admin's note |

**Summary:** Total paid out, total still pending across all members

---

### 5. Top Performers Report
**Purpose:** Rank members by performance

**Filters:**
- Date range
- Metric (Sales Volume / Team Size / Earnings)
- Top N (10, 25, 50, 100)

**Columns:**
| Column | Description |
|---|---|
| Rank | Position |
| Name | Member |
| Total Sales (₹) | Approved sales amount |
| Sales Count | Number of sales |
| Direct Referrals | People they recruited |
| Total Downline | Full team size |
| Total Earnings (₹) | Commission earnings |

---

### 6. Tree Overview Report
**Purpose:** Health of the MLM tree

**No filters — shows current snapshot**

**Metrics:**
- Total members
- Tree depth (deepest level)
- Average children per member
- Members with 0, 1, 2, 3 children (distribution)
- Most active branches
- Orphaned subtrees (sponsor ≠ placement issues)

## PDF Generation

### Library: jspdf + jspdf-autotable

### PDF Layout:
```
┌─────────────────────────────────────┐
│ ARTILLIGENCE TECHNOLOGY PVT LTD     │
│ Report: Sales Report                │
│ Date Range: 01 Mar 2026 - 28 Mar 26│
│ Generated: 28 Mar 2026, 14:30      │
├─────────────────────────────────────┤
│                                     │
│  [Table Data]                       │
│                                     │
├─────────────────────────────────────┤
│ Summary:                            │
│ Total Sales: 156  |  Amount: ₹X,XX │
├─────────────────────────────────────┤
│ Page 1 of 3                         │
└─────────────────────────────────────┘
```

### Features:
- Company header on each page
- Auto-pagination for long tables
- Summary section at the end
- Page numbers
- Generated timestamp

## Excel Generation

### Library: exceljs

### Excel Layout:
- Sheet 1: Report data (formatted table with filters)
- Sheet 2: Summary / charts data
- Header row styled (bold, colored background)
- Column widths auto-adjusted
- Currency columns formatted as ₹ with 2 decimal places
- Date columns formatted properly

## Report API Endpoints

```
GET /api/reports/sales?from=&to=&member=&product=&status=&format=json|pdf|xlsx
GET /api/reports/commissions?from=&to=&beneficiary=&source=&level=&format=json|pdf|xlsx
GET /api/reports/members?status=&from=&to=&sponsor=&format=json|pdf|xlsx
GET /api/reports/payouts?from=&to=&member=&format=json|pdf|xlsx
GET /api/reports/top-performers?from=&to=&metric=&top=&format=json|pdf|xlsx
GET /api/reports/tree-overview?format=json|pdf|xlsx
```

- `format=json` → used by web UI
- `format=pdf` → returns PDF file download
- `format=xlsx` → returns Excel file download
