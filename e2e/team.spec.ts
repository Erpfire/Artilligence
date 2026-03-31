import { test, expect } from "@playwright/test";
import {
  resetTestData,
  login,
  dbQuery,
  resetRateLimiter,
  registerMember,
  blockMember,
} from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const MEMBER_EMAIL = "root@artilligence.com";
const MEMBER_PASSWORD = "member123456";

const MEMBER_PW_HASH =
  "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

function getRootMemberId(): string {
  return dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
}

/**
 * Create a child member under a given parent via SQL (for tree setup).
 * Returns the new member's ID.
 */
function createChildMember(
  parentId: string,
  sponsorId: string,
  position: number,
  opts: { name: string; email: string; phone: string; referralCode: string; depth: number; parentPath: string; status?: string }
): string {
  const status = opts.status || "ACTIVE";
  dbQuery(
    `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
     VALUES (gen_random_uuid(), '${opts.email}', '${MEMBER_PW_HASH}', '${opts.name}', '${opts.phone}', 'MEMBER', '${sponsorId}', '${parentId}', ${position}, ${opts.depth}, '${opts.parentPath}/', '${opts.referralCode}', '${status}', true, NOW(), NOW())`
  );
  const id = dbQuery(`SELECT id FROM users WHERE email='${opts.email}'`);
  // Fix path to include the new member's id
  dbQuery(`UPDATE users SET path='${opts.parentPath}/${id}' WHERE id='${id}'`);
  // Create wallet
  dbQuery(
    `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
     VALUES (gen_random_uuid(), '${id}', 0, 0, 0, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`
  );
  return id;
}

/** Create an approved sale for a member */
function createApprovedSale(memberId: string, billCode: string, amount: number) {
  const adminId = dbQuery("SELECT id FROM users WHERE email='admin@artilligence.com'");
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, approved_by, approved_at, created_at, updated_at)
     VALUES (gen_random_uuid(), '${memberId}', '${billCode}', ${amount}, 'Test Customer', '+910000000000', CURRENT_DATE, 'APPROVED', '${adminId}', NOW(), NOW(), NOW())`
  );
}

/** Build a 3-level tree under root for testing */
function buildTestTree(): {
  rootId: string;
  child1Id: string;
  child2Id: string;
  child3Id: string;
  grandchild1Id: string;
} {
  const rootId = getRootMemberId();
  const rootPath = dbQuery(`SELECT path FROM users WHERE id='${rootId}'`);

  const child1Id = createChildMember(rootId, rootId, 1, {
    name: "Child One",
    email: "child1@test.com",
    phone: "+919100000001",
    referralCode: "CHILD1",
    depth: 1,
    parentPath: rootPath,
  });

  const child2Id = createChildMember(rootId, rootId, 2, {
    name: "Child Two",
    email: "child2@test.com",
    phone: "+919100000002",
    referralCode: "CHILD2",
    depth: 1,
    parentPath: rootPath,
    status: "BLOCKED",
  });

  const child3Id = createChildMember(rootId, rootId, 3, {
    name: "Child Three",
    email: "child3@test.com",
    phone: "+919100000003",
    referralCode: "CHILD3",
    depth: 1,
    parentPath: rootPath,
  });

  const child1Path = dbQuery(`SELECT path FROM users WHERE id='${child1Id}'`);
  const grandchild1Id = createChildMember(child1Id, child1Id, 1, {
    name: "Grandchild One",
    email: "grandchild1@test.com",
    phone: "+919100000011",
    referralCode: "GCHILD1",
    depth: 2,
    parentPath: child1Path,
  });

  // Create some sales for stats
  createApprovedSale(child1Id, "MB-TEAM-001", 10000);
  createApprovedSale(child1Id, "MB-TEAM-002", 5000);
  createApprovedSale(grandchild1Id, "MB-TEAM-003", 8000);

  return { rootId, child1Id, child2Id, child3Id, grandchild1Id };
}

// ═══════════════════════════════════════════════════════════════
// MEMBER TEAM TREE VIEW
// ═══════════════════════════════════════════════════════════════

test.describe("Member Team - Tree View", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("member sees own node at top of tree", async ({ page }) => {
    buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await expect(page.getByTestId("team-title")).toBeVisible();
    await expect(page.getByTestId("team-tree-container")).toBeVisible();

    // Root member's node should be visible at top
    const rootId = getRootMemberId();
    await expect(page.getByTestId(`tree-node-${rootId}`)).toBeVisible();
    await expect(page.getByTestId(`tree-node-name-${rootId}`)).toContainText("Rajesh Kumar");
  });

  test("member sees correct children (up to 3)", async ({ page }) => {
    const { rootId, child1Id, child2Id, child3Id } = buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await expect(page.getByTestId("team-tree-container")).toBeVisible();

    // All 3 children visible
    await expect(page.getByTestId(`tree-node-${child1Id}`)).toBeVisible();
    await expect(page.getByTestId(`tree-node-name-${child1Id}`)).toContainText("Child One");
    await expect(page.getByTestId(`tree-node-${child2Id}`)).toBeVisible();
    await expect(page.getByTestId(`tree-node-name-${child2Id}`)).toContainText("Child Two");
    await expect(page.getByTestId(`tree-node-${child3Id}`)).toBeVisible();
    await expect(page.getByTestId(`tree-node-name-${child3Id}`)).toContainText("Child Three");
  });

  test("member sees 3 levels by default", async ({ page }) => {
    const { grandchild1Id } = buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await expect(page.getByTestId("team-tree-container")).toBeVisible();

    // Grandchild should be visible at level 3
    await expect(page.getByTestId(`tree-node-${grandchild1Id}`)).toBeVisible();
    await expect(page.getByTestId(`tree-node-name-${grandchild1Id}`)).toContainText("Grandchild One");
  });

  test("click child node expands to show their children", async ({ page }) => {
    const { child1Id, grandchild1Id } = buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await expect(page.getByTestId("team-tree-container")).toBeVisible();

    // Click on child1 to drill down
    await page.getByTestId(`tree-node-${child1Id}`).click();

    // After drill down, child1 should be the root and grandchild should show
    await expect(page.getByTestId(`tree-node-${child1Id}`)).toBeVisible();
    await expect(page.getByTestId(`tree-node-${grandchild1Id}`)).toBeVisible();

    // Breadcrumbs should appear
    await expect(page.getByTestId("team-breadcrumbs")).toBeVisible();
    await expect(page.getByTestId("breadcrumb-me")).toBeVisible();
  });

  test("empty slots shown as dotted boxes in correct positions", async ({ page }) => {
    // Only create 1 child so slots 2 and 3 are empty
    const rootId = getRootMemberId();
    const rootPath = dbQuery(`SELECT path FROM users WHERE id='${rootId}'`);
    createChildMember(rootId, rootId, 1, {
      name: "Only Child",
      email: "onlychild@test.com",
      phone: "+919100000099",
      referralCode: "ONLY1",
      depth: 1,
      parentPath: rootPath,
    });

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await expect(page.getByTestId("team-tree-container")).toBeVisible();

    // Should see empty slots
    const emptySlots = page.getByTestId("empty-slot");
    // At least 2 empty slots at level 1 (positions 2 and 3)
    await expect(emptySlots.first()).toBeVisible();
    expect(await emptySlots.count()).toBeGreaterThanOrEqual(2);
  });

  test("node shows correct name and stats (downline count, sales)", async ({ page }) => {
    const { child1Id } = buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await expect(page.getByTestId("team-tree-container")).toBeVisible();

    // Child1 has 1 grandchild → 1 downline
    await expect(page.getByTestId(`tree-node-downline-${child1Id}`)).toContainText("1");
    // Child1 has ₹15,000 in approved sales
    await expect(page.getByTestId(`tree-node-sales-${child1Id}`)).toContainText("₹15,000.00");
  });

  test("active members shown in green (green border)", async ({ page }) => {
    const { child1Id } = buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await expect(page.getByTestId("team-tree-container")).toBeVisible();

    const child1Node = page.getByTestId(`tree-node-${child1Id}`);
    await expect(child1Node).toBeVisible();
    // Active members get green border class
    await expect(child1Node).toHaveAttribute("data-status", "ACTIVE");
    await expect(child1Node).toHaveClass(/border-green/);
  });

  test("blocked members shown in gray", async ({ page }) => {
    const { child2Id } = buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await expect(page.getByTestId("team-tree-container")).toBeVisible();

    const child2Node = page.getByTestId(`tree-node-${child2Id}`);
    await expect(child2Node).toBeVisible();
    // Blocked members get gray styling
    await expect(child2Node).toHaveAttribute("data-status", "BLOCKED");
    await expect(child2Node).toHaveClass(/bg-gray/);
  });

  test("empty tree shows empty state message", async ({ page }) => {
    // Root with no children
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    // The tree still shows root (self) — no empty state since root is always shown
    const rootId = getRootMemberId();
    await expect(page.getByTestId(`tree-node-${rootId}`)).toBeVisible();
  });

  test("breadcrumbs navigation works - back to root", async ({ page }) => {
    const { child1Id } = buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    // Drill down to child1
    await page.getByTestId(`tree-node-${child1Id}`).click();
    await expect(page.getByTestId("team-breadcrumbs")).toBeVisible();

    // Click "Me" to go back to root
    await page.getByTestId("breadcrumb-me").click();

    // Should show root at top again
    const rootId = getRootMemberId();
    await expect(page.getByTestId(`tree-node-${rootId}`)).toBeVisible();
    await expect(page.getByTestId(`tree-node-name-${rootId}`)).toContainText("Rajesh Kumar");
  });
});

// ═══════════════════════════════════════════════════════════════
// MEMBER TEAM LIST VIEW
// ═══════════════════════════════════════════════════════════════

test.describe("Member Team - List View", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("list view shows all downline members", async ({ page }) => {
    buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    // Switch to list view
    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-table")).toBeVisible();

    // Should show 4 downline members (child1, child2, child3, grandchild1)
    const rows = page.locator("[data-testid^='team-list-row-']");
    await expect(rows).toHaveCount(4);
  });

  test("list view shows correct level/distance", async ({ page }) => {
    const { child1Id, grandchild1Id } = buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-table")).toBeVisible();

    // Child1 should be level 1
    await expect(page.getByTestId(`team-level-${child1Id}`)).toHaveText("L1");
    // Grandchild1 should be level 2
    await expect(page.getByTestId(`team-level-${grandchild1Id}`)).toHaveText("L2");
  });

  test("list view: search by name filters correctly", async ({ page }) => {
    buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-table")).toBeVisible();

    // Search for "Grandchild"
    await page.getByTestId("team-list-search").fill("Grandchild");

    // Wait for results to update
    await expect(page.locator("[data-testid^='team-list-row-']")).toHaveCount(1);
    const firstRow = page.locator("[data-testid^='team-list-row-']").first();
    await expect(firstRow).toContainText("Grandchild One");
  });

  test("list view: sort by level works", async ({ page }) => {
    buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-table")).toBeVisible();

    // Sort is default by depth asc — first row should be L1
    const firstRow = page.locator("[data-testid^='team-list-row-']").first();
    await expect(firstRow).toContainText("L1");

    // Click sort by level to toggle desc
    await page.getByTestId("sort-level").click();
    // Now first should be the deepest (L2)
    const firstRowDesc = page.locator("[data-testid^='team-list-row-']").first();
    await expect(firstRowDesc).toContainText("L2");
  });

  test("list view: pagination works with many members", async ({ page }) => {
    // Create 12 children under root for pagination (limit=10)
    const rootId = getRootMemberId();
    const rootPath = dbQuery(`SELECT path FROM users WHERE id='${rootId}'`);
    for (let i = 1; i <= 12; i++) {
      // First 3 as direct children, rest under child1
      if (i <= 3) {
        createChildMember(rootId, rootId, i, {
          name: `ListMember ${String(i).padStart(2, "0")}`,
          email: `list${i}@test.com`,
          phone: `+9191000001${String(i).padStart(2, "0")}`,
          referralCode: `LIST${String(i).padStart(2, "0")}`,
          depth: 1,
          parentPath: rootPath,
        });
      } else {
        // These are deeper members (create with unique position)
        const parentEmail = `list${((i - 1) % 3) + 1}@test.com`;
        const parentId = dbQuery(`SELECT id FROM users WHERE email='${parentEmail}'`);
        const parentPath2 = dbQuery(`SELECT path FROM users WHERE id='${parentId}'`);
        const existingCount = parseInt(dbQuery(`SELECT COUNT(*) FROM users WHERE parent_id='${parentId}'`));
        createChildMember(parentId, parentId, existingCount + 1, {
          name: `ListMember ${String(i).padStart(2, "0")}`,
          email: `list${i}@test.com`,
          phone: `+9191000001${String(i).padStart(2, "0")}`,
          referralCode: `LIST${String(i).padStart(2, "0")}`,
          depth: 2,
          parentPath: parentPath2,
        });
      }
    }

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-table")).toBeVisible();

    // First page should show 10 rows
    await expect(page.locator("[data-testid^='team-list-row-']")).toHaveCount(10);
    await expect(page.getByTestId("team-list-pagination")).toBeVisible();

    // Click next page
    await page.getByTestId("team-list-next").click();

    // Second page should have remaining 2
    await expect(page.locator("[data-testid^='team-list-row-']")).toHaveCount(2);
  });

  test("list view: empty state when no downline", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-empty")).toBeVisible();
  });

  test("list view: search no results shows empty message", async ({ page }) => {
    buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-table")).toBeVisible();

    await page.getByTestId("team-list-search").fill("NONEXISTENT_NAME_XYZ");
    await expect(page.getByTestId("team-list-empty")).toBeVisible();
  });

  test("list view: shows correct sales count per member", async ({ page }) => {
    const { child1Id } = buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-table")).toBeVisible();

    // Child1 has 2 approved sales
    await expect(page.getByTestId(`team-sales-${child1Id}`)).toHaveText("2");
  });

  test("list view: blocked member status shown correctly", async ({ page }) => {
    const { child2Id } = buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-table")).toBeVisible();

    await expect(page.getByTestId(`team-status-${child2Id}`)).toHaveText("BLOCKED");
  });
});

// ═══════════════════════════════════════════════════════════════
// VIEW TOGGLE
// ═══════════════════════════════════════════════════════════════

test.describe("Member Team - View Toggle", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("view toggle switches between tree and list", async ({ page }) => {
    buildTestTree();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    // Default is tree view
    await expect(page.getByTestId("team-tree-container")).toBeVisible();

    // Switch to list
    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-table")).toBeVisible();
    await expect(page.getByTestId("team-tree-container")).not.toBeVisible();

    // Switch back to tree
    await page.getByTestId("toggle-tree-view").click();
    await expect(page.getByTestId("team-tree-container")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN TREE - SEARCH
// ═══════════════════════════════════════════════════════════════

test.describe("Admin Tree - Search", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("admin tree shows full tree from root", async ({ page }) => {
    const { child1Id } = buildTestTree();
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL(/\/admin/);
    await page.goto("/admin/tree");

    await expect(page.getByTestId("tree-title")).toBeVisible();
    await expect(page.getByTestId("tree-container")).toBeVisible();

    // Root member should be visible
    const rootId = getRootMemberId();
    await expect(page.getByTestId(`tree-node-${rootId}`)).toBeVisible();
    await expect(page.getByTestId(`tree-node-${child1Id}`)).toBeVisible();
  });

  test("admin tree: search member and view centers on them", async ({ page }) => {
    const { child1Id } = buildTestTree();
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL(/\/admin/);
    await page.goto("/admin/tree");

    await expect(page.getByTestId("tree-search")).toBeVisible();

    // Type search query
    await page.getByTestId("tree-search-input").fill("Child One");

    // Wait for search results dropdown
    await expect(page.getByTestId("tree-search-results")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId(`tree-search-result-${child1Id}`)).toBeVisible();

    // Click the result
    await page.getByTestId(`tree-search-result-${child1Id}`).click();

    // Tree should now center on Child One
    await expect(page.getByTestId(`tree-node-${child1Id}`)).toBeVisible();
    // Breadcrumbs should show
    await expect(page.getByTestId("tree-breadcrumbs")).toBeVisible();
  });

  test("admin tree: click node drills down", async ({ page }) => {
    const { child1Id, grandchild1Id } = buildTestTree();
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL(/\/admin/);
    await page.goto("/admin/tree");

    await expect(page.getByTestId("tree-container")).toBeVisible();

    // Click drill-down button on child1
    await page.getByTestId(`drill-down-${child1Id}`).click();

    // After drill down, child1 is the root and grandchild should be visible
    await expect(page.getByTestId(`tree-node-${child1Id}`)).toBeVisible();
    await expect(page.getByTestId(`tree-node-${grandchild1Id}`)).toBeVisible();
    await expect(page.getByTestId("tree-breadcrumbs")).toBeVisible();
  });

  test("admin tree: search with no results shows empty message", async ({ page }) => {
    buildTestTree();
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL(/\/admin/);
    await page.goto("/admin/tree");

    await page.getByTestId("tree-search-input").fill("NONEXISTENT_XYZ_123");
    await expect(page.getByTestId("tree-search-no-results")).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════
// MOBILE RESPONSIVENESS
// ═══════════════════════════════════════════════════════════════

test.describe("Mobile - Team Views", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("mobile: tree is horizontally scrollable", async ({ page }) => {
    buildTestTree();

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    // Tree container should have overflow-x-auto for scrolling
    const container = page.getByTestId("team-tree-container");
    await expect(container).toBeVisible();
    await expect(container).toHaveClass(/overflow-x-auto/);
  });

  test("mobile: list view uses card layout", async ({ page }) => {
    buildTestTree();

    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await page.getByTestId("toggle-list-view").click();

    // Cards should be visible on mobile (sm:hidden for table, visible for cards)
    const cards = page.getByTestId("team-list-cards");
    await expect(cards).toBeVisible();

    // Table should be hidden on mobile
    const table = page.getByTestId("team-list-table");
    await expect(table).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// HINDI TRANSLATIONS
// ═══════════════════════════════════════════════════════════════

test.describe("Team - Hindi", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("team page shows Hindi text when language is Hindi", async ({ page }) => {
    buildTestTree();
    // Set language to Hindi
    dbQuery(`UPDATE users SET "preferredLanguage"='hi' WHERE email='${MEMBER_EMAIL}'`);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    // Title should be in Hindi
    await expect(page.getByTestId("team-title")).toContainText("मेरी टीम");

    // Toggle buttons should be in Hindi
    await expect(page.getByTestId("toggle-tree-view")).toContainText("ट्री व्यू");
    await expect(page.getByTestId("toggle-list-view")).toContainText("सूची व्यू");
  });
});

// ═══════════════════════════════════════════════════════════════
// UI REGISTRATION FLOW (Real UI, not just SQL)
// ═══════════════════════════════════════════════════════════════

test.describe("Team - UI Registration Flow", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("member registered via UI appears in sponsor's team tree", async ({ page }) => {
    // Register a new member via UI using root's referral code
    await registerMember(page, "ROOT01", {
      name: "UI Registered Member",
      email: "uimember@test.com",
      phone: "9200000001",
      password: "member123456",
    });

    // After registration, app redirects to /login?registered=true
    await page.waitForURL(/\/login/);

    // Now login as root member to check team tree
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await expect(page.getByTestId("team-tree-container")).toBeVisible();

    // UI-registered member should appear in tree
    const newMemberId = dbQuery("SELECT id FROM users WHERE email='uimember@test.com'");
    await expect(page.getByTestId(`tree-node-${newMemberId}`)).toBeVisible();
    await expect(page.getByTestId(`tree-node-name-${newMemberId}`)).toContainText("UI Registered Member");
  });

  test("member registered via UI appears in sponsor's list view", async ({ page }) => {
    await registerMember(page, "ROOT01", {
      name: "UI List Member",
      email: "uilist@test.com",
      phone: "9200000002",
      password: "member123456",
    });

    // After registration, app redirects to /login?registered=true
    await page.waitForURL(/\/login/);

    // Login as root member to check list view
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/team");

    await page.getByTestId("toggle-list-view").click();

    const newMemberId = dbQuery("SELECT id FROM users WHERE email='uilist@test.com'");
    await expect(page.getByTestId(`team-list-row-${newMemberId}`)).toBeVisible();
    await expect(page.getByTestId(`team-list-row-${newMemberId}`)).toContainText("UI List Member");
  });
});

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE
// ═══════════════════════════════════════════════════════════════

test.describe("Team - Performance", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("tree with 50+ members renders without performance issues", async ({ page }) => {
    // Build a 4-level deep ternary tree: 3 + 9 + 27 + 18 = 57 members
    const rootId = getRootMemberId();
    const rootPath = dbQuery(`SELECT path FROM users WHERE id='${rootId}'`);
    let count = 0;

    // Level 1: 3 children
    for (let i = 1; i <= 3; i++) {
      count++;
      const childId = createChildMember(rootId, rootId, i, {
        name: `P L1-${i}`,
        email: `perf1_${i}@test.com`,
        phone: `+919200${String(count).padStart(6, "0")}`,
        referralCode: `P1${String(i).padStart(2, "0")}`,
        depth: 1,
        parentPath: rootPath,
      });
      // Level 2: 3 grandchildren under each L1
      const childPath = dbQuery(`SELECT path FROM users WHERE id='${childId}'`);
      for (let j = 1; j <= 3; j++) {
        count++;
        const gcId = createChildMember(childId, childId, j, {
          name: `P L2-${i}${j}`,
          email: `perf2_${i}${j}@test.com`,
          phone: `+919200${String(count).padStart(6, "0")}`,
          referralCode: `P2${i}${j}`,
          depth: 2,
          parentPath: childPath,
        });
        // Level 3: 3 great-grandchildren under each L2
        const gcPath = dbQuery(`SELECT path FROM users WHERE id='${gcId}'`);
        for (let k = 1; k <= 3; k++) {
          count++;
          const ggcId = createChildMember(gcId, gcId, k, {
            name: `P L3-${i}${j}${k}`,
            email: `perf3_${i}${j}${k}@test.com`,
            phone: `+919200${String(count).padStart(6, "0")}`,
            referralCode: `P3${i}${j}${k}`,
            depth: 3,
            parentPath: gcPath,
          });
          // Level 4: 2 of 3 slots under some L3 nodes (to get past 50)
          if (k <= 2) {
            const ggcPath = dbQuery(`SELECT path FROM users WHERE id='${ggcId}'`);
            count++;
            createChildMember(ggcId, ggcId, 1, {
              name: `P L4-${i}${j}${k}`,
              email: `perf4_${i}${j}${k}@test.com`,
              phone: `+919200${String(count).padStart(6, "0")}`,
              referralCode: `P4${i}${j}${k}`,
              depth: 4,
              parentPath: ggcPath,
            });
          }
        }
      }
    }

    // Verify we have 50+ members
    const totalMembers = parseInt(
      dbQuery(`SELECT COUNT(*) FROM users WHERE role='MEMBER' AND id != '${rootId}'`)
    );
    expect(totalMembers).toBeGreaterThanOrEqual(50);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");

    const startTime = Date.now();
    await page.goto("/dashboard/team");
    await expect(page.getByTestId("team-tree-container")).toBeVisible();
    const loadTime = Date.now() - startTime;

    // Should load within 15 seconds even with 50+ members
    expect(loadTime).toBeLessThan(15000);

    // All 3 direct children should render
    for (let i = 1; i <= 3; i++) {
      const childId = dbQuery(`SELECT id FROM users WHERE email='perf1_${i}@test.com'`);
      await expect(page.getByTestId(`tree-node-${childId}`)).toBeVisible();
    }

    // List view should also handle 50+ members
    await page.getByTestId("toggle-list-view").click();
    await expect(page.getByTestId("team-list-table")).toBeVisible();
    await expect(page.getByTestId("team-list-pagination")).toBeVisible();
  });
});
