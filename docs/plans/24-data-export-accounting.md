# Data Export & Accounting

## Overview
The client's accountant will need financial data. In India, MLM commissions have tax implications.

## Tax Relevance (India)

### TDS (Tax Deducted at Source)
- Under Indian tax law, if a person earns commission income above ₹15,000 in a financial year, TDS may apply
- The distributor (client) may be required to deduct TDS before paying commission
- The app should help track this — even if TDS calculation is done outside the app

### What the Accountant Needs
1. **Member-wise annual earnings** — how much each member earned in a financial year (April to March)
2. **Monthly payout summary** — total payouts per month
3. **Member PAN details** — for TDS filing (future: add PAN field to member profile)

## Accounting Reports (Admin)

### Financial Year Summary (`/admin/reports/financial`)

**Financial Year selector:** 2025-26, 2026-27, etc. (April to March)

| Member | Total Earned | Total Paid Out | Pending | TDS Applicable? |
|---|---|---|---|---|
| Rajesh Kumar | ₹1,45,000 | ₹1,20,000 | ₹25,000 | Yes (> ₹15,000) |
| Suresh Patel | ₹8,500 | ₹8,500 | ₹0 | No |
| Priya Sharma | ₹32,000 | ₹25,000 | ₹7,000 | Yes |

**Export:** Excel (primary — accountants love Excel) and PDF

### Monthly Payout Ledger

| Month | Total Commissions Generated | Total Payouts | Net Pending |
|---|---|---|---|
| March 2026 | ₹2,45,000 | ₹1,80,000 | ₹65,000 |
| February 2026 | ₹1,98,000 | ₹1,95,000 | ₹3,000 |

### Commission Ledger (Detailed)

Every commission transaction in chronological order:
| Date | Sale Bill | Seller | Beneficiary | Level | % | Amount |
|---|---|---|---|---|---|---|
| 28 Mar | MB-001 | Rajesh | Suresh | 1 | 10% | ₹1,000 |
| 28 Mar | MB-001 | Rajesh | Amit | 2 | 6% | ₹600 |

This is the raw data an accountant or auditor would need.

## Member Profile — Financial Fields (Future Enhancement)

For TDS compliance, consider adding:
| Field | Notes |
|---|---|
| PAN Number | For TDS filing |
| Bank Account Number | For reference (payments still offline) |
| Bank IFSC Code | For reference |
| Address | Legal requirement for TDS certificates |

**Not for MVP** — but the schema should be extendable. Add these fields when the client's accountant specifically asks for them.

## Indian Number Formatting

Use Indian numbering system throughout:
- ₹1,000 (one thousand)
- ₹10,000 (ten thousand)
- ₹1,00,000 (one lakh)
- ₹10,00,000 (ten lakh)
- ₹1,00,00,000 (one crore)

**Implementation:** `Intl.NumberFormat('en-IN')` handles this automatically.
