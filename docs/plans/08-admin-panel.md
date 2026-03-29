# Admin Panel

## Access
- Single admin account
- English-only interface
- Separate layout from member dashboard
- URL: `/admin/*`

## Pages

### 1. Admin Dashboard (`/admin`)
Overview with key metrics:
- Total members (active / inactive)
- Total sales (approved / pending / rejected)
- Total commissions paid out
- Total pending payouts
- Recent activity feed
- Charts: Sales trend, member growth, commission distribution

### 2. Member Management (`/admin/members`)

**List View:**
- Searchable, sortable, paginated table
- Columns: Name, Email, Phone, Sponsor, Depth, Downline Count, Status, Joined Date
- Filter by: Status (active/inactive), date range
- Actions: View details, Block/Unblock

**Member Detail View:**
- Profile info
- Position in tree (parent, children)
- Sponsor info
- Sales history
- Commission earnings
- Wallet balance
- Tree view from this member's perspective
- Block/Unblock toggle

### 3. Product Management (`/admin/products`)

**List View:**
- All products with name, category, price, status
- Actions: Edit, Activate/Deactivate

**Add/Edit Product Form:**
| Field | Notes |
|---|---|
| Product Name (English) | Required |
| Product Name (Hindi) | Required |
| Description (English) | Optional |
| Description (Hindi) | Optional |
| Category | Dropdown: Car, Inverter, Bike, Tubular, SMF, etc. |
| Price (₹) | MRP |
| SKU | Optional |
| Active | Toggle |

### 4. Sales Management (`/admin/sales`)

**Tabs:**
- Pending (action needed)
- Approved
- Rejected
- All

**Each sale shows:**
- Bill code, member name, products, amount, customer info, date
- Approve / Reject buttons (for pending)
- Rejection requires a reason

### 5. Commission Settings (`/admin/commissions`)

**Editable table:**
| Level | Percentage | Action |
|---|---|---|
| 1 | [10.00] | Save |
| 2 | [6.00] | Save |
| 3 | [4.00] | Save |
| ... | ... | ... |
| 7 | [0.50] | Save |

- [+ Add Level] button
- [Remove] button per level
- Changes apply to future sales only
- Show warning: "Changes will only affect future sales. Existing commissions will not be recalculated."

### 6. Wallet Management (`/admin/wallets`)

- See all member wallets
- Pay out pending amounts
- Make manual adjustments
- View transaction history per member
- Bulk payout option (future enhancement)

### 7. Reports (`/admin/reports`)

**Available Reports:**
| Report | Description |
|---|---|
| Sales Report | All sales with filters (date, member, status, product) |
| Commission Report | All commissions with filters (date, member, level) |
| Member Report | Member list with stats |
| Payout Report | All payouts (completed + pending) |
| Top Performers | Members ranked by sales volume or team size |
| Tree Overview | Full tree statistics |

**Export Options:**
- View on web (tables with charts)
- Download as **PDF**
- Download as **Excel (.xlsx)**

**Filters common to all reports:**
- Date range (from — to)
- Specific member
- Product category

### 8. Tree View (`/admin/tree`)

- Full tree visualization starting from root
- Click any node to drill down
- Search for a specific member to center the view
- Stats per node: direct children, total downline, total sales, total earnings
