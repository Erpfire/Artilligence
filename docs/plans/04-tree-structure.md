# Tree Structure — Ternary MLM Tree

## Rules
1. Each member can have **maximum 3 direct children** (positions 1, 2, 3)
2. New members are placed using **BFS spillover**
3. **Sponsor** (referrer) and **placement parent** are tracked separately
4. Tree depth is **unlimited**
5. Commissions are calculated up to **7 levels**

## Sponsor vs Placement Parent

These are two different relationships:

- **Sponsor (`sponsor_id`)**: The person whose referral link was used to sign up. This is the "business" relationship — who recruited whom. A sponsor can have **unlimited** referrals.

- **Placement Parent (`parent_id`)**: The position in the binary/ternary tree. This determines commission flow. A placement parent can have **max 3** children.

### Example
```
Member A refers Members B, C, D, E, F

Sponsor relationships:
A → B, C, D, E, F  (A is sponsor of all 5)

Tree placement (BFS spillover):
        A
      / | \
     B  C  D      ← A's 3 slots filled
    /
   E              ← E spills over to B's first slot
  ... F goes to B's second slot, etc.
```

## BFS Spillover Algorithm

When a new member joins:

```
function findPlacementPosition(sponsorId):
    queue = [sponsorId]  // Start from sponsor

    while queue is not empty:
        current = queue.dequeue()
        children = getChildren(current)  // Ordered by position 1, 2, 3

        if children.length < 3:
            // Found an open slot
            position = children.length + 1
            return { parentId: current, position: position }

        // All 3 slots full, add children to queue (left to right)
        for child in children:
            queue.enqueue(child.id)

    // Should never reach here in practice
    throw Error("No placement found")
```

### Key Behaviors
- Starts searching from the **sponsor's node** (not the root)
- Fills left-to-right (position 1 → 2 → 3)
- If sponsor's slots are full, checks sponsor's children (level by level)
- This keeps the subtree under each sponsor balanced
- New member is always placed in the **shallowest available slot** under their sponsor

### Why start from sponsor (not root)?
- If we started from root, all spillover would fill the left side of the tree
- Starting from sponsor ensures each sponsor's subtree grows proportionally
- Members benefit from their own recruiting efforts

## Tree Operations Needed

### 1. Get Children
```sql
SELECT * FROM users WHERE parent_id = :userId ORDER BY position;
```

### 2. Get Upline (for commissions)
```sql
WITH RECURSIVE upline AS (
  SELECT id, parent_id, depth, 0 AS level FROM users WHERE id = :userId
  UNION ALL
  SELECT u.id, u.parent_id, u.depth, up.level + 1
  FROM users u JOIN upline up ON u.id = up.parent_id
  WHERE up.level < 7
)
SELECT * FROM upline WHERE level > 0 ORDER BY level;
```

### 3. Get Downline (for tree visualization)
```sql
WITH RECURSIVE downline AS (
  SELECT id, parent_id, name, depth, position, 0 AS level
  FROM users WHERE id = :userId
  UNION ALL
  SELECT u.id, u.parent_id, u.name, u.depth, u.position, d.level + 1
  FROM users u JOIN downline d ON u.parent_id = d.id
  WHERE d.level < :maxDepth  -- Limit depth for performance
)
SELECT * FROM downline ORDER BY depth, position;
```

### 4. Get Referrals (by sponsor)
```sql
SELECT * FROM users WHERE sponsor_id = :userId ORDER BY created_at;
```

### 5. Count Total Downline
```sql
WITH RECURSIVE downline AS (
  SELECT id FROM users WHERE parent_id = :userId
  UNION ALL
  SELECT u.id FROM users u JOIN downline d ON u.parent_id = d.id
)
SELECT COUNT(*) FROM downline;
```

## Edge Cases

1. **First member (root)**: Admin creates the root member manually. This member has no parent and no sponsor. They are the top of the tree.

2. **Sponsor has full subtree**: In theory, if a sponsor's entire subtree down to very deep levels is full, the BFS will take long. In practice with a ternary tree, this is extremely unlikely (3^10 = 59,049 slots at 10 levels).

3. **Blocked member**: If a member is blocked (`is_active = false`), their position in the tree remains. Their children are not affected. They just can't log in or earn commissions.

4. **Placement position conflicts**: Enforced by unique constraint on `(parent_id, position)`.

## Tree Visualization

The member dashboard will show an interactive tree view:
- Default: Show 3 levels deep from the member
- Click to expand/drill down
- Each node shows: Name, total downline count, total sales
- Color coding: Active (green), Inactive (gray), Empty slot (dotted border)
- Mobile responsive: Horizontal scroll or vertical list view on small screens
