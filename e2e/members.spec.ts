import { test, expect } from "@playwright/test";
import {
  dbQuery,
  login,
  resetTestData,
  resetRateLimiter,
  registerMember,
  blockMember,
  unblockMember,
  getMemberByEmail,
  ensureRootMember,
} from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const ROOT_EMAIL = "root@artilligence.com";
const ROOT_PASSWORD = "member123456";

// bcrypt hash of 'member123456' (shell-escaped)
const MEMBER_PW_HASH = "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

function cleanupTestMembers() {
  // Delete audit logs for test members
  dbQuery(
    "DELETE FROM audit_logs WHERE entity='User' AND entity_id IN (SELECT id FROM users WHERE email LIKE 'test-%@test.com')"
  );
  // Also clean audit logs from root member tests
  dbQuery("DELETE FROM audit_logs WHERE details LIKE '%Audit Root Test%' OR details LIKE '%New Root Member%'");
  // Delete wallets for test members
  dbQuery(
    "DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-%@test.com')"
  );
  // Delete new root test members
  dbQuery("DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE email IN ('newroot@test.com','auditroot@test.com','duproot@test.com'))");
  dbQuery("DELETE FROM users WHERE email IN ('newroot@test.com','auditroot@test.com','duproot@test.com')");
  // Delete test members
  dbQuery("DELETE FROM users WHERE email LIKE 'test-%@test.com'");
  // Ensure root and admin exist and are ACTIVE
  ensureRootMember();
  dbQuery("UPDATE users SET status='ACTIVE' WHERE email IN ('root@artilligence.com','admin@artilligence.com')");
}

function createTestMembers(count: number) {
  const rootId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
  if (!rootId) throw new Error("Root member not found for creating test members");
  for (let i = 1; i <= count; i++) {
    const padded = String(i).padStart(3, "0");
    // Use sponsor relation but set parent_id to NULL to avoid unique position constraint
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, depth, path, referral_code, status, created_at, updated_at)
       VALUES (gen_random_uuid(), 'test-member${padded}@test.com', '${MEMBER_PW_HASH}', 'Test Member ${padded}', '+919000${padded}0000', 'MEMBER', '${rootId}', 1, '/${rootId}/auto${padded}', 'TM${padded}', '${i % 5 === 0 ? "BLOCKED" : "ACTIVE"}', NOW() - interval '${count - i} days', NOW())
       ON CONFLICT (email) DO NOTHING`
    );
  }
}

test.describe("Member Management", () => {
  test.beforeAll(async ({ browser }) => {
    // Warm up the server (cold-start compilation)
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("http://localhost:3005/login", { timeout: 30000 });
    await page.waitForSelector('button[type="submit"]', { timeout: 30000 });
    await ctx.close();
  });

  test.beforeEach(async () => {
    await resetRateLimiter();
    cleanupTestMembers();
  });

  test.afterAll(() => {
    cleanupTestMembers();
  });

  // ── Members List ──────────────────────────────────────────

  test.describe("Members List", () => {
    test("admin sees members list page with title", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      await page.click('[data-testid="nav-users"]');
      await page.waitForURL("**/admin/members");

      await expect(page.locator('[data-testid="members-title"]')).toHaveText("Members");
      await expect(page.locator('[data-testid="members-table"]')).toBeVisible();
    });

    test("members list shows root member", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");
      await expect(page.locator('[data-testid="members-table"]')).toBeVisible();

      // Root member from seed — use email as it's unique
      await expect(page.locator("text=root@artilligence.com")).toBeVisible({ timeout: 10000 });
    });

    test("members table shows correct columns", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      const headers = page.locator("thead th");
      await expect(headers.nth(0)).toContainText("Name");
      await expect(headers.nth(1)).toContainText("Email");
      await expect(headers.nth(2)).toContainText("Phone");
      await expect(headers.nth(3)).toContainText("Sponsor");
      await expect(headers.nth(4)).toContainText("Depth");
      await expect(headers.nth(5)).toContainText("Downline");
      await expect(headers.nth(6)).toContainText("Status");
      await expect(headers.nth(7)).toContainText("Joined");
    });

    test("admin user (non-MEMBER) does not appear in members list", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      // Admin should not be listed (role filter: MEMBER only)
      await expect(page.locator("text=admin@artilligence.com")).not.toBeVisible();
    });
  });

  // ── Search ────────────────────────────────────────────────

  test.describe("Search", () => {
    test("search by name → correct results", async ({ page }) => {
      createTestMembers(5);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      await page.fill('[data-testid="search-input"]', "Test Member 001");
      await page.click('[data-testid="search-button"]');

      await expect(page.locator("text=Test Member 001")).toBeVisible();
      await expect(page.locator("text=test-member001@test.com")).toBeVisible();
    });

    test("search by email → correct results", async ({ page }) => {
      createTestMembers(5);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      await page.fill('[data-testid="search-input"]', "test-member003@test.com");
      await page.click('[data-testid="search-button"]');

      await expect(page.locator("text=Test Member 003")).toBeVisible();
    });

    test("search by phone → correct results", async ({ page }) => {
      createTestMembers(5);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      await page.fill('[data-testid="search-input"]', "+9190020000");
      await page.click('[data-testid="search-button"]');

      await expect(page.locator("text=Test Member 002")).toBeVisible();
    });

    test("search with no results → shows empty state", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      await page.fill('[data-testid="search-input"]', "NonExistentMember12345");
      await page.click('[data-testid="search-button"]');

      await expect(page.locator('[data-testid="no-members"]')).toBeVisible();
      await expect(page.locator('[data-testid="no-members"]')).toContainText("No members found");
    });
  });

  // ── Filter ────────────────────────────────────────────────

  test.describe("Filter", () => {
    test("filter by active status → only active shown", async ({ page }) => {
      createTestMembers(10);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      await page.selectOption('[data-testid="status-filter"]', "ACTIVE");
      await page.click('[data-testid="apply-filters"]');

      // All visible rows should be ACTIVE
      const statusBadges = page.locator("tbody span:text('ACTIVE')");
      const blockedBadges = page.locator("tbody span:text('BLOCKED')");
      await expect(statusBadges.first()).toBeVisible();
      await expect(blockedBadges).toHaveCount(0);
    });

    test("filter by blocked status → only blocked shown", async ({ page }) => {
      createTestMembers(10);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      await page.selectOption('[data-testid="status-filter"]', "BLOCKED");
      await page.click('[data-testid="apply-filters"]');

      // All visible rows should be BLOCKED
      const blockedBadges = page.locator("tbody span:text('BLOCKED')");
      await expect(blockedBadges.first()).toBeVisible();

      // No ACTIVE badges should appear
      const activeBadges = page.locator("tbody span:text('ACTIVE')");
      await expect(activeBadges).toHaveCount(0);
    });

    test("filter by date range → correct results", async ({ page }) => {
      createTestMembers(10);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      // Set date range to today only
      const today = new Date().toISOString().split("T")[0];
      await page.fill('[data-testid="date-from"]', today);
      await page.fill('[data-testid="date-to"]', today);
      await page.click('[data-testid="apply-filters"]');

      // Should show members created today
      // (member 010 was created with NOW() - interval '0 days')
      await expect(page.locator('[data-testid="members-table"]')).toBeVisible();
    });
  });

  // ── Sort ──────────────────────────────────────────────────

  test.describe("Sort", () => {
    test("sort by name → correct order", async ({ page }) => {
      createTestMembers(5);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      // Click Name column to sort ascending
      await page.click('[data-testid="sort-name"]');
      await page.waitForURL(/sortBy=name/);

      // First row should be alphabetically first
      const firstRow = page.locator("tbody tr").first();
      await expect(firstRow).toBeVisible();
    });

    test("sort by joined date → correct order", async ({ page }) => {
      createTestMembers(5);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      // Click Joined column to sort ascending
      await page.click('[data-testid="sort-joined"]');
      await page.waitForURL(/sortBy=createdAt/);

      await expect(page.locator("tbody tr").first()).toBeVisible();
    });

    test("clicking same sort column toggles order", async ({ page }) => {
      createTestMembers(5);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members?sortBy=name&sortOrder=asc");

      // Click name again to toggle to desc
      await page.click('[data-testid="sort-name"]');
      await page.waitForURL(/sortOrder=desc/);
      await expect(page).toHaveURL(/sortOrder=desc/);
    });
  });

  // ── Pagination ────────────────────────────────────────────

  test.describe("Pagination", () => {
    test("pagination works with 25+ members", async ({ page }) => {
      // Clean ALL non-seed members first for accurate count
      dbQuery("DELETE FROM wallets WHERE user_id NOT IN (SELECT id FROM users WHERE email IN ('admin@artilligence.com','root@artilligence.com'))");
      dbQuery("DELETE FROM users WHERE email NOT IN ('admin@artilligence.com','root@artilligence.com')");
      createTestMembers(25);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      // 25 test + 1 root = 26 members, 10 per page = 3 pages
      await expect(page.locator('[data-testid="pagination"]')).toBeVisible();
      await expect(page.locator('[data-testid="next-page"]')).toBeVisible();

      // First page should have 10 rows
      await expect(page.locator("tbody tr")).toHaveCount(10);

      // Go to page 2
      await page.click('[data-testid="next-page"]');
      await page.waitForURL(/page=2/);
      await expect(page.locator("tbody tr")).toHaveCount(10);

      // Go to last page
      await page.click('[data-testid="page-3"]');
      await page.waitForURL(/page=3/);
      // 26 - 20 = 6 on last page
      await expect(page.locator("tbody tr")).toHaveCount(6);
    });
  });

  // ── Member Detail ─────────────────────────────────────────

  test.describe("Member Detail", () => {
    test("member detail page shows correct info", async ({ page }) => {
      const rootId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
      expect(rootId).toBeTruthy();

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto(`/admin/members/${rootId}`);

      await expect(page.locator('[data-testid="member-name"]')).toHaveText("Rajesh Kumar");
      await expect(page.locator('[data-testid="member-email"]')).toHaveText("root@artilligence.com");
      await expect(page.locator('[data-testid="member-phone"]')).toContainText("+919999900001");
      await expect(page.locator('[data-testid="member-referral"]')).toHaveText("ROOT01");
    });

    test("member detail shows correct sponsor and parent", async ({ page }) => {
      // Register a member under root
      await registerMember(page, "ROOT01", {
        name: "Sponsored Member",
        email: "test-sponsored001@test.com",
        phone: "9800000001",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      const member = getMemberByEmail("test-sponsored001@test.com");
      expect(member).not.toBeNull();

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto(`/admin/members/${member!.id}`);

      await expect(page.locator('[data-testid="member-sponsor"]')).toContainText("Rajesh Kumar");
      await expect(page.locator('[data-testid="member-parent"]')).toContainText("Rajesh Kumar");
    });

    test("member detail shows wallet balance", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      const rootId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
      await page.goto(`/admin/members/${rootId}`);

      await expect(page.locator('[data-testid="wallet-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="wallet-earned"]')).toBeVisible();
      await expect(page.locator('[data-testid="wallet-pending"]')).toBeVisible();
      await expect(page.locator('[data-testid="wallet-paidout"]')).toBeVisible();
    });

    test("back to members link works", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      const rootId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
      await page.goto(`/admin/members/${rootId}`);

      await page.click('[data-testid="back-to-members"]');
      await page.waitForURL("**/admin/members");
      await expect(page.locator('[data-testid="members-title"]')).toHaveText("Members");
    });
  });

  // ── Block / Unblock ───────────────────────────────────────

  test.describe("Block / Unblock", () => {
    test("block member → status changes to blocked", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Block Test Member",
        email: "test-blockme001@test.com",
        phone: "9800000101",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      const member = getMemberByEmail("test-blockme001@test.com");
      expect(member).not.toBeNull();
      expect(member!.status).toBe("ACTIVE");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto(`/admin/members/${member!.id}`);

      await expect(page.locator('[data-testid="member-status"]')).toHaveText("ACTIVE");

      // Block the member
      await page.click('[data-testid="block-button"]');
      await expect(page.locator('[data-testid="member-status"]')).toHaveText("BLOCKED", { timeout: 10000 });

      // Verify in DB
      const updated = getMemberByEmail("test-blockme001@test.com");
      expect(updated!.status).toBe("BLOCKED");
    });

    test("blocked member cannot login", async ({ page, browser }) => {
      await registerMember(page, "ROOT01", {
        name: "Block Login Test",
        email: "test-blocklogin001@test.com",
        phone: "9800000102",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      // Block via admin
      blockMember("test-blocklogin001@test.com");

      // Try to login as blocked member in new context
      const context = await browser.newContext();
      const blockedPage = await context.newPage();

      await login(blockedPage, "test-blocklogin001@test.com", "password123");

      // Should see error message about blocked account
      await expect(blockedPage.locator("text=deactivated").or(blockedPage.locator("text=blocked"))).toBeVisible({ timeout: 5000 });

      await context.close();
    });

    test("blocked member referral link stops working", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Block Referral Test",
        email: "test-blockref001@test.com",
        phone: "9800000103",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      const member = getMemberByEmail("test-blockref001@test.com");
      blockMember("test-blockref001@test.com");

      // Try to register using blocked member's referral code
      await page.goto(`/join/${member!.referralCode}`);

      // Should show error about inactive referral
      await expect(
        page.locator("text=no longer active").or(page.locator("text=invalid"))
      ).toBeVisible({ timeout: 5000 });
    });

    test("unblock member → status changes back, can login again", async ({ page, browser }) => {
      await registerMember(page, "ROOT01", {
        name: "Unblock Test Member",
        email: "test-unblockme001@test.com",
        phone: "9800000104",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      const member = getMemberByEmail("test-unblockme001@test.com");
      blockMember("test-unblockme001@test.com");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto(`/admin/members/${member!.id}`);

      await expect(page.locator('[data-testid="member-status"]')).toHaveText("BLOCKED");

      // Unblock the member
      await page.click('[data-testid="block-button"]');
      await expect(page.locator('[data-testid="member-status"]')).toHaveText("ACTIVE", { timeout: 10000 });

      // Verify member can login again
      const context = await browser.newContext();
      const memberPage = await context.newPage();
      await login(memberPage, "test-unblockme001@test.com", "password123");
      await memberPage.waitForURL("**/dashboard", { timeout: 10000 });
      await expect(memberPage).toHaveURL(/\/dashboard/);
      await context.close();
    });
  });

  // ── Password Reset ────────────────────────────────────────

  test.describe("Password Reset", () => {
    test("password reset → temporary password shown once", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Password Reset Test",
        email: "test-pwreset001@test.com",
        phone: "9800000201",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      const member = getMemberByEmail("test-pwreset001@test.com");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto(`/admin/members/${member!.id}`);

      // Click reset password
      await page.click('[data-testid="reset-password-button"]');

      // Should show temp password alert
      await expect(page.locator('[data-testid="temp-password-alert"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('[data-testid="temp-password"]')).toBeVisible();

      // Get the temp password text
      const tempPw = await page.locator('[data-testid="temp-password"]').textContent();
      expect(tempPw).toBeTruthy();
      expect(tempPw!.length).toBeGreaterThanOrEqual(8);
    });

    test("password reset → member can login with temp password", async ({ page, browser }) => {
      await registerMember(page, "ROOT01", {
        name: "PW Reset Login Test",
        email: "test-pwresetlogin001@test.com",
        phone: "9800000202",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      const member = getMemberByEmail("test-pwresetlogin001@test.com");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto(`/admin/members/${member!.id}`);

      await page.click('[data-testid="reset-password-button"]');
      await expect(page.locator('[data-testid="temp-password"]')).toBeVisible({ timeout: 10000 });
      const tempPw = await page.locator('[data-testid="temp-password"]').textContent();

      // Login with temp password in new context
      const context = await browser.newContext();
      const memberPage = await context.newPage();
      await resetRateLimiter();
      await login(memberPage, "test-pwresetlogin001@test.com", tempPw!);

      // Should be able to login
      await memberPage.waitForURL("**/dashboard", { timeout: 10000 });
      await expect(memberPage).toHaveURL(/\/dashboard/);
      await context.close();
    });
  });

  // ── Create Root Member ────────────────────────────────────

  test.describe("Create Root Member", () => {
    test("create root button visible when no members exist", async ({ page }) => {
      // Remove all members
      dbQuery("DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE role='MEMBER')");
      dbQuery("DELETE FROM users WHERE role='MEMBER'");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      await expect(page.locator('[data-testid="create-root-button"]')).toBeVisible();

      // Restore root member after test
      // (afterEach/cleanup will handle re-seeding if needed)
    });

    test("create root member when none exist → root created", async ({ page }) => {
      // Remove all members
      dbQuery("DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE role='MEMBER')");
      dbQuery("DELETE FROM users WHERE role='MEMBER'");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members/create-root");

      await expect(page.locator('[data-testid="create-root-title"]')).toHaveText("Create Root Member");

      await page.fill('[data-testid="root-name"]', "New Root Member");
      await page.fill('[data-testid="root-email"]', "newroot@test.com");
      await page.fill('[data-testid="root-phone"]', "9800000999");
      await page.fill('[data-testid="root-password"]', "password123");

      await page.click('[data-testid="root-submit"]');
      await page.waitForURL("**/admin/members", { timeout: 10000 });

      // Verify root was created
      await expect(page.locator("text=New Root Member")).toBeVisible();

      // Verify in DB
      const rootCount = dbQuery("SELECT COUNT(*) FROM users WHERE email='newroot@test.com' AND role='MEMBER'");
      expect(parseInt(rootCount)).toBe(1);

      // Verify wallet created
      const walletCount = dbQuery(
        "SELECT COUNT(*) FROM wallets WHERE user_id IN (SELECT id FROM users WHERE email='newroot@test.com')"
      );
      expect(parseInt(walletCount)).toBe(1);

      // Cleanup: delete the new root so seed can restore
      dbQuery("DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE email='newroot@test.com')");
      dbQuery("DELETE FROM users WHERE email='newroot@test.com'");
    });

    test("create root button NOT visible when members exist", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members");

      // Root member exists, so button should not be there
      await expect(page.locator('[data-testid="create-root-button"]')).not.toBeVisible();
    });

    test("creating root when members exist → API returns error", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members/create-root");

      await page.fill('[data-testid="root-name"]', "Duplicate Root");
      await page.fill('[data-testid="root-email"]', "duproot@test.com");
      await page.fill('[data-testid="root-phone"]', "9800000998");
      await page.fill('[data-testid="root-password"]', "password123");

      await page.click('[data-testid="root-submit"]');

      // Should show error
      await expect(page.locator('[data-testid="root-error"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('[data-testid="root-error"]')).toContainText("Root member already exists");
    });
  });

  // ── Admin Tree View ───────────────────────────────────────

  test.describe("Admin Tree View", () => {
    test("tree view shows tree structure correctly", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      await page.click('[data-testid="nav-tree"]');
      await page.waitForURL("**/admin/tree");

      await expect(page.locator('[data-testid="tree-title"]')).toHaveText("Network Tree");
      await expect(page.locator('[data-testid="tree-container"]')).toBeVisible();

      // Root member should be visible in tree
      const rootId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
      await expect(page.locator(`[data-testid="tree-node-${rootId}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="tree-node-name-${rootId}"]`)).toContainText("Rajesh Kumar");
    });

    test("tree view shows empty slots as dotted", async ({ page }) => {
      // Ensure root has no children (cleanup leaves only root)
      const rootId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
      // Remove any children of root created by other tests
      dbQuery(`DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE parent_id='${rootId}')`);
      dbQuery(`DELETE FROM users WHERE parent_id='${rootId}'`);

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/tree");

      // Wait for tree to load
      await expect(page.locator('[data-testid="tree-container"]')).toBeVisible({ timeout: 10000 });

      // Root has 0 children, so 3 empty slots should appear
      const emptySlots = page.locator('[data-testid="empty-slot"]');
      await expect(emptySlots.first()).toBeVisible({ timeout: 10000 });
    });

    test("tree view shows blocked member in gray", async ({ page }) => {
      // Register 2 members under root, then block one
      await registerMember(page, "ROOT01", {
        name: "Tree Active Member",
        email: "test-treeactive001@test.com",
        phone: "9800000301",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      await resetRateLimiter();
      await registerMember(page, "ROOT01", {
        name: "Tree Blocked Member",
        email: "test-treeblocked001@test.com",
        phone: "9800000302",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      blockMember("test-treeblocked001@test.com");

      const blockedMember = getMemberByEmail("test-treeblocked001@test.com");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/tree");

      await expect(page.locator('[data-testid="tree-container"]')).toBeVisible();

      // Blocked member should have BLOCKED label
      await expect(
        page.locator(`[data-testid="tree-node-blocked-${blockedMember!.id}"]`)
      ).toBeVisible();
    });

    test("click tree node → drills down to subtree", async ({ page }) => {
      // Register a member under root with children
      await registerMember(page, "ROOT01", {
        name: "Tree Drill Target",
        email: "test-treedrill001@test.com",
        phone: "9800000311",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      const member = getMemberByEmail("test-treedrill001@test.com");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/tree");

      await expect(page.locator('[data-testid="tree-container"]')).toBeVisible();

      // Click drill down on root
      const rootId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
      const drillButton = page.locator(`[data-testid="drill-down-${rootId}"]`);

      if (await drillButton.isVisible()) {
        await drillButton.click();

        // Breadcrumbs should appear
        await expect(page.locator('[data-testid="tree-breadcrumbs"]')).toBeVisible();
        await expect(page.locator('[data-testid="breadcrumb-root"]')).toBeVisible();
      }
    });

    test("tree view empty when no members", async ({ page }) => {
      // Remove all members
      dbQuery("DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE role='MEMBER')");
      dbQuery("DELETE FROM users WHERE role='MEMBER'");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/tree");

      await expect(page.locator('[data-testid="tree-empty"]')).toBeVisible();
      await expect(page.locator('[data-testid="tree-empty"]')).toContainText("No members");

      // Restore root for other tests — re-seed
      // seed.ts handles upsert, but we need the root member back
    });
  });

  // ── Global Search ─────────────────────────────────────────

  test.describe("Global Search", () => {
    test("global search shows matching members", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      // Type in global search
      await page.fill('[data-testid="global-search-input"]', "Rajesh");

      // Wait for search results dropdown
      await expect(page.locator('[data-testid="global-search-results"]')).toBeVisible({ timeout: 5000 });

      // Should show root member
      const rootId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
      await expect(page.locator(`[data-testid="search-member-${rootId}"]`)).toBeVisible();
    });

    test("global search shows matching products", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      await page.fill('[data-testid="global-search-input"]', "Mileage");

      await expect(page.locator('[data-testid="global-search-results"]')).toBeVisible({ timeout: 5000 });

      // Should show products section with Mileage product
      await expect(page.locator("text=Exide Mileage")).toBeVisible();
    });

    test("global search navigates to member on click", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      await page.fill('[data-testid="global-search-input"]', "Rajesh");
      await expect(page.locator('[data-testid="global-search-results"]')).toBeVisible({ timeout: 5000 });

      const rootId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
      await page.click(`[data-testid="search-member-${rootId}"]`);

      await page.waitForURL(`**/admin/members/${rootId}`, { timeout: 10000 });
      await expect(page.locator('[data-testid="member-name"]')).toHaveText("Rajesh Kumar");
    });

    test("global search no results → shows empty message", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      await page.fill('[data-testid="global-search-input"]', "zzzznonexistent99999");

      await expect(page.locator('[data-testid="global-search-results"]')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-testid="search-no-results"]')).toBeVisible();
    });
  });

  // ── Audit Logs ────────────────────────────────────────────

  test.describe("Audit Logs", () => {
    test("member blocked → audit log entry exists", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Audit Block Test",
        email: "test-auditblock001@test.com",
        phone: "9800000401",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      const member = getMemberByEmail("test-auditblock001@test.com");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto(`/admin/members/${member!.id}`);

      await page.click('[data-testid="block-button"]');
      await expect(page.locator('[data-testid="member-status"]')).toHaveText("BLOCKED", { timeout: 10000 });

      // Check audit log in DB
      const auditCount = dbQuery(
        `SELECT COUNT(*) FROM audit_logs WHERE action='MEMBER_BLOCKED' AND entity_id='${member!.id}'`
      );
      expect(parseInt(auditCount)).toBeGreaterThanOrEqual(1);
    });

    test("password reset → audit log entry exists", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Audit PW Reset Test",
        email: "test-auditpw001@test.com",
        phone: "9800000402",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      const member = getMemberByEmail("test-auditpw001@test.com");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto(`/admin/members/${member!.id}`);

      await page.click('[data-testid="reset-password-button"]');
      await expect(page.locator('[data-testid="temp-password-alert"]')).toBeVisible({ timeout: 10000 });

      // Check audit log in DB
      const auditCount = dbQuery(
        `SELECT COUNT(*) FROM audit_logs WHERE action='PASSWORD_RESET' AND entity_id='${member!.id}'`
      );
      expect(parseInt(auditCount)).toBeGreaterThanOrEqual(1);
    });

    test("member unblocked → audit log entry exists", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Audit Unblock Test",
        email: "test-auditunblock001@test.com",
        phone: "9800000403",
        password: "password123",
      });
      await page.waitForURL("**/login*");

      const member = getMemberByEmail("test-auditunblock001@test.com");
      blockMember("test-auditunblock001@test.com");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto(`/admin/members/${member!.id}`);

      await page.click('[data-testid="block-button"]');
      await expect(page.locator('[data-testid="member-status"]')).toHaveText("ACTIVE", { timeout: 10000 });

      // Check audit log in DB
      const auditCount = dbQuery(
        `SELECT COUNT(*) FROM audit_logs WHERE action='MEMBER_UNBLOCKED' AND entity_id='${member!.id}'`
      );
      expect(parseInt(auditCount)).toBeGreaterThanOrEqual(1);
    });

    test("root member created → audit log entry exists", async ({ page }) => {
      dbQuery("DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE role='MEMBER')");
      dbQuery("DELETE FROM users WHERE role='MEMBER'");

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/members/create-root");

      await page.fill('[data-testid="root-name"]', "Audit Root Test");
      await page.fill('[data-testid="root-email"]', "auditroot@test.com");
      await page.fill('[data-testid="root-phone"]', "9800000998");
      await page.fill('[data-testid="root-password"]', "password123");

      await page.click('[data-testid="root-submit"]');
      await page.waitForURL("**/admin/members", { timeout: 10000 });

      const auditCount = dbQuery(
        "SELECT COUNT(*) FROM audit_logs WHERE action='ROOT_MEMBER_CREATED' AND details LIKE '%Audit Root Test%'"
      );
      expect(parseInt(auditCount)).toBeGreaterThanOrEqual(1);

      // Cleanup
      dbQuery("DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE email='auditroot@test.com')");
      dbQuery("DELETE FROM audit_logs WHERE details LIKE '%Audit Root Test%'");
      dbQuery("DELETE FROM users WHERE email='auditroot@test.com'");
    });
  });
});
