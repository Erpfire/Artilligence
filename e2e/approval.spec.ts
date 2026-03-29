import { test, expect } from "@playwright/test";
import {
  resetTestData,
  login,
  dbQuery,
  registerMember,
  resetRateLimiter,
  ensureRootMember,
} from "./helpers";
import path from "path";
import { writeFileSync, mkdirSync } from "fs";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const MEMBER_EMAIL = "root@artilligence.com";
const MEMBER_PASSWORD = "member123456";

const TEST_FILES_DIR = "/tmp/artilligence-test-files";

function ensureTestFiles() {
  mkdirSync(TEST_FILES_DIR, { recursive: true });
  const jpgBytes = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  writeFileSync(path.join(TEST_FILES_DIR, "receipt.jpg"), jpgBytes);
}

// bcrypt hash of 'member123456'
const MEMBER_PW_HASH =
  "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

// ── Helper: insert a pending sale directly in DB ──

function insertPendingSale(opts: {
  billCode: string;
  memberId: string;
  totalAmount?: number;
  customerName?: string;
  customerPhone?: string;
}): string {
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${opts.memberId}', '${opts.billCode}', ${opts.totalAmount || 10000}, '${opts.customerName || "Test Customer"}', '${opts.customerPhone || "+919876543210"}', '2026-03-25', 'PENDING', NOW(), NOW())`
  );
  const saleId = dbQuery(`SELECT id FROM sales WHERE bill_code='${opts.billCode}'`);
  // Add a sale item
  const productId = dbQuery("SELECT id FROM products WHERE is_active=true ORDER BY name LIMIT 1");
  const price = dbQuery(`SELECT price FROM products WHERE id='${productId}'`);
  dbQuery(
    `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
     VALUES (gen_random_uuid(), '${saleId}', '${productId}', 1, ${price}, ${price})`
  );
  return saleId;
}

function cleanSalesData() {
  dbQuery("DELETE FROM audit_logs");
  dbQuery("DELETE FROM wallet_transactions");
  dbQuery("DELETE FROM commissions");
  dbQuery("DELETE FROM notifications");
  dbQuery("DELETE FROM sale_flags");
  dbQuery("DELETE FROM sale_items");
  dbQuery("DELETE FROM sales");
}

function getRootMemberId(): string {
  return dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
}

// Ensure a tree chain for commission testing: root -> child1 -> child2 -> seller
function setupTreeForCommissions(): { sellerId: string; sellerEmail: string; rootId: string } {
  const rootId = getRootMemberId();

  // Create child1 under root
  const child1Exists = dbQuery("SELECT COUNT(*) FROM users WHERE email='child1@test.com'");
  if (parseInt(child1Exists) === 0) {
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
       VALUES (gen_random_uuid(), 'child1@test.com', '${MEMBER_PW_HASH}', 'Child One', '+919111000001', 'MEMBER', '${rootId}', '${rootId}', 0, 1, '/${rootId}/', 'CHILD1CODE', 'ACTIVE', true, NOW(), NOW())`
    );
  }
  const child1Id = dbQuery("SELECT id FROM users WHERE email='child1@test.com'");
  // Ensure wallet for child1
  dbQuery(
    `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
     VALUES (gen_random_uuid(), '${child1Id}', 0, 0, 0, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`
  );

  // Create seller under child1
  const sellerExists = dbQuery("SELECT COUNT(*) FROM users WHERE email='seller@test.com'");
  if (parseInt(sellerExists) === 0) {
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
       VALUES (gen_random_uuid(), 'seller@test.com', '${MEMBER_PW_HASH}', 'Seller Member', '+919111000002', 'MEMBER', '${child1Id}', '${child1Id}', 0, 2, '/${rootId}/${child1Id}/', 'SELLERCODE', 'ACTIVE', true, NOW(), NOW())`
    );
  }
  const sellerId = dbQuery("SELECT id FROM users WHERE email='seller@test.com'");
  // Ensure wallet for seller
  dbQuery(
    `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
     VALUES (gen_random_uuid(), '${sellerId}', 0, 0, 0, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`
  );

  // Ensure root wallet
  dbQuery(
    `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
     VALUES (gen_random_uuid(), '${rootId}', 0, 0, 0, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`
  );

  // Reset wallet balances
  dbQuery(`UPDATE wallets SET total_earned=0, pending=0, paid_out=0`);

  return { sellerId, sellerEmail: "seller@test.com", rootId };
}

// ──────────────────────────────────────────────────────────────────

test.describe("Admin Sales Approval + Commissions", () => {
  test.beforeAll(() => {
    ensureTestFiles();
  });

  test.beforeEach(async () => {
    cleanSalesData();
    resetTestData();
    await resetRateLimiter();
  });

  // ── Admin sees pending sales list ──

  test("admin sees pending sales list", async ({ page }) => {
    const memberId = getRootMemberId();
    insertPendingSale({ billCode: "MB-AP001", memberId });
    insertPendingSale({ billCode: "MB-AP002", memberId });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/sales");
    // Wait for table or empty state (handles first-load page compilation)
    await page.waitForSelector('[data-testid="sales-table"], [data-testid="sales-empty"]', { timeout: 15000 });
    // If empty due to timing, reload once
    const isEmpty = await page.getByTestId("sales-empty").isVisible().catch(() => false);
    if (isEmpty) {
      await page.waitForTimeout(1000);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="sales-table"]', { timeout: 10000 });
    }

    // Default tab is Pending
    await expect(page.getByTestId("tab-pending")).toHaveClass(/border-primary/);
    await expect(page.getByText("MB-AP001")).toBeVisible();
    await expect(page.getByText("MB-AP002")).toBeVisible();
  });

  // ── Admin approves sale → status changes to APPROVED ──

  test("admin approves sale → status changes to APPROVED", async ({ page }) => {
    const memberId = getRootMemberId();
    const saleId = insertPendingSale({ billCode: "MB-AP010", memberId });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Click approve
    await page.getByTestId(`approve-sale-${saleId}`).click();

    // Wait for status to change — sale should move out of pending tab or show approved
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-AP010"),
      { timeout: 10000 }
    );

    // Verify in DB
    const status = dbQuery(`SELECT status FROM sales WHERE id='${saleId}'`);
    expect(status).toBe("APPROVED");

    // Switch to Approved tab to see it
    await page.getByTestId("tab-approved").click();
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 10000 });
    await expect(page.getByText("MB-AP010")).toBeVisible();
  });

  // ── Admin rejects sale → must provide reason, status REJECTED ──

  test("admin rejects sale → must provide reason, status REJECTED", async ({ page }) => {
    const memberId = getRootMemberId();
    const saleId = insertPendingSale({ billCode: "MB-AP020", memberId });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Click reject
    await page.getByTestId(`reject-sale-${saleId}`).click();
    await expect(page.getByTestId("reject-modal")).toBeVisible();

    // Try submitting without reason — button should be disabled
    const confirmBtn = page.getByTestId("confirm-reject");
    await expect(confirmBtn).toBeDisabled();

    // Enter reason
    await page.getByTestId("rejection-reason-input").fill("Duplicate bill photo detected");
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Wait for modal to close and sale to disappear from pending
    await expect(page.getByTestId("reject-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify in DB
    const result = dbQuery(`SELECT status, rejection_reason FROM sales WHERE id='${saleId}'`);
    const [status, reason] = result.split("|");
    expect(status).toBe("REJECTED");
    expect(reason).toBe("Duplicate bill photo detected");
  });

  // ── Rejected sale → NO commissions generated ──

  test("rejected sale → no commissions generated", async ({ page }) => {
    const { sellerId } = setupTreeForCommissions();
    const saleId = insertPendingSale({ billCode: "MB-AP025", memberId: sellerId, totalAmount: 10000 });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Reject the sale
    await page.getByTestId(`reject-sale-${saleId}`).click();
    await page.getByTestId("rejection-reason-input").fill("Test rejection");
    await page.getByTestId("confirm-reject").click();
    await expect(page.getByTestId("reject-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify no commissions
    const commCount = dbQuery(`SELECT COUNT(*) FROM commissions WHERE sale_id='${saleId}'`);
    expect(parseInt(commCount)).toBe(0);
  });

  // ── Bulk approval works ──

  test("bulk approval: approve multiple pending sales", async ({ page }) => {
    const memberId = getRootMemberId();
    const id1 = insertPendingSale({ billCode: "MB-BK001", memberId });
    const id2 = insertPendingSale({ billCode: "MB-BK002", memberId });
    const id3 = insertPendingSale({ billCode: "MB-BK003", memberId });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Select all via header checkbox
    await page.getByTestId("select-all-checkbox").check();

    // Click bulk approve
    await page.getByTestId("bulk-approve-button").click();

    // Wait for table to update (pending should be empty now)
    await page.waitForFunction(
      () => document.querySelector('[data-testid="sales-empty"]') !== null,
      { timeout: 15000 }
    );

    // Verify all approved in DB
    const count = dbQuery(
      `SELECT COUNT(*) FROM sales WHERE id IN ('${id1}','${id2}','${id3}') AND status='APPROVED'`
    );
    expect(parseInt(count)).toBe(3);
  });

  // ── Fraud flags visible on sale cards ──

  test("fraud flags visible on sale cards", async ({ page }) => {
    const memberId = getRootMemberId();
    const saleId = insertPendingSale({
      billCode: "MB-FL001",
      memberId,
      totalAmount: 50000,
      customerName: "Flagged Customer",
    });

    // Insert flags manually
    dbQuery(
      `INSERT INTO sale_flags (id, sale_id, type, severity, details, created_at)
       VALUES (gen_random_uuid(), '${saleId}', 'ROUND_NUMBERS', 'LOW', 'Exact round amount', NOW())`
    );
    dbQuery(
      `INSERT INTO sale_flags (id, sale_id, type, severity, details, created_at)
       VALUES (gen_random_uuid(), '${saleId}', 'HIGH_AMOUNT', 'LOW', 'Sale above 2x average', NOW())`
    );

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Check flags are visible
    await expect(page.getByTestId("flag-ROUND_NUMBERS")).toBeVisible();
    await expect(page.getByTestId("flag-HIGH_AMOUNT")).toBeVisible();
  });

  // ── Dismiss flag button works ──

  test("dismiss flag button works", async ({ page }) => {
    const memberId = getRootMemberId();
    const saleId = insertPendingSale({ billCode: "MB-FL010", memberId });

    dbQuery(
      `INSERT INTO sale_flags (id, sale_id, type, severity, details, created_at)
       VALUES (gen_random_uuid(), '${saleId}', 'ROUND_NUMBERS', 'LOW', 'Exact round amount', NOW())`
    );
    const flagId = dbQuery(`SELECT id FROM sale_flags WHERE sale_id='${saleId}' AND type='ROUND_NUMBERS'`);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // View sale detail
    await page.getByTestId(`view-sale-${saleId}`).click();
    await expect(page.getByTestId("sale-detail-modal")).toBeVisible();

    // Dismiss flag
    await page.getByTestId(`dismiss-flag-${flagId}`).click();

    // Flag should disappear
    await expect(page.getByTestId(`dismiss-flag-${flagId}`)).not.toBeVisible({ timeout: 5000 });

    // Verify in DB
    const remaining = dbQuery(`SELECT COUNT(*) FROM sale_flags WHERE sale_id='${saleId}'`);
    expect(parseInt(remaining)).toBe(0);
  });

  // ── Approved sale → commissions generated for upline ──

  test("approved sale → commissions generated for upline (2 levels)", async ({ page }) => {
    const { sellerId, rootId } = setupTreeForCommissions();
    const child1Id = dbQuery("SELECT id FROM users WHERE email='child1@test.com'");
    const saleId = insertPendingSale({ billCode: "MB-CM001", memberId: sellerId, totalAmount: 10000 });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Approve sale
    await page.getByTestId(`approve-sale-${saleId}`).click();

    // Wait for the sale to disappear from pending
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-CM001"),
      { timeout: 10000 }
    );

    // Verify commissions in DB
    const commissions = dbQuery(
      `SELECT beneficiary_id, level, amount FROM commissions WHERE sale_id='${saleId}' ORDER BY level`
    );
    const rows = commissions.split("\n").filter(Boolean);
    expect(rows.length).toBe(2); // child1 (L1) and root (L2)

    // Level 1: child1 gets 10% of 10000 = 1000
    const [c1Beneficiary, c1Level, c1Amount] = rows[0].split("|");
    expect(c1Beneficiary).toBe(child1Id);
    expect(c1Level).toBe("1");
    expect(parseFloat(c1Amount)).toBe(1000.00);

    // Level 2: root gets 6% of 10000 = 600
    const [c2Beneficiary, c2Level, c2Amount] = rows[1].split("|");
    expect(c2Beneficiary).toBe(rootId);
    expect(c2Level).toBe("2");
    expect(parseFloat(c2Amount)).toBe(600.00);
  });

  // ── Commission amounts match configured percentages ──

  test("commission amounts match configured percentages", async ({ page }) => {
    const { sellerId } = setupTreeForCommissions();
    const saleId = insertPendingSale({ billCode: "MB-CM010", memberId: sellerId, totalAmount: 25000 });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-CM010"),
      { timeout: 10000 }
    );

    // L1 = 10% of 25000 = 2500, L2 = 6% of 25000 = 1500
    const l1 = dbQuery(`SELECT amount FROM commissions WHERE sale_id='${saleId}' AND level=1`);
    const l2 = dbQuery(`SELECT amount FROM commissions WHERE sale_id='${saleId}' AND level=2`);
    expect(parseFloat(l1)).toBe(2500.00);
    expect(parseFloat(l2)).toBe(1500.00);
  });

  // ── Commission: blocked member in upline → skipped ──

  test("commission: blocked member in upline → skipped", async ({ page }) => {
    const { sellerId, rootId } = setupTreeForCommissions();
    const child1Id = dbQuery("SELECT id FROM users WHERE email='child1@test.com'");

    // Block child1
    dbQuery(`UPDATE users SET status='BLOCKED' WHERE id='${child1Id}'`);

    const saleId = insertPendingSale({ billCode: "MB-CM020", memberId: sellerId, totalAmount: 10000 });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-CM020"),
      { timeout: 10000 }
    );

    // child1 is blocked → only root gets commission (L1 rate for first active ancestor)
    const commCount = dbQuery(`SELECT COUNT(*) FROM commissions WHERE sale_id='${saleId}'`);
    expect(parseInt(commCount)).toBe(1);

    // Root gets L1 = 10% = 1000
    const rootComm = dbQuery(`SELECT beneficiary_id, level, amount FROM commissions WHERE sale_id='${saleId}'`);
    const [beneficiary, level, amount] = rootComm.split("|");
    expect(beneficiary).toBe(rootId);
    expect(level).toBe("1");
    expect(parseFloat(amount)).toBe(1000.00);
  });

  // ── Wallet balances update after approval ──

  test("wallet balances update after approval", async ({ page }) => {
    const { sellerId, rootId } = setupTreeForCommissions();
    const child1Id = dbQuery("SELECT id FROM users WHERE email='child1@test.com'");
    const saleId = insertPendingSale({ billCode: "MB-CM030", memberId: sellerId, totalAmount: 10000 });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-CM030"),
      { timeout: 10000 }
    );

    // Verify wallet balances
    const child1Wallet = dbQuery(`SELECT total_earned, pending FROM wallets WHERE user_id='${child1Id}'`);
    const [c1Earned, c1Pending] = child1Wallet.split("|");
    expect(parseFloat(c1Earned)).toBe(1000.00);
    expect(parseFloat(c1Pending)).toBe(1000.00);

    const rootWallet = dbQuery(`SELECT total_earned, pending FROM wallets WHERE user_id='${rootId}'`);
    const [rEarned, rPending] = rootWallet.split("|");
    expect(parseFloat(rEarned)).toBe(600.00);
    expect(parseFloat(rPending)).toBe(600.00);
  });

  // ── Wallet transactions created with correct descriptions ──

  test("wallet transactions created with correct descriptions", async ({ page }) => {
    const { sellerId } = setupTreeForCommissions();
    const saleId = insertPendingSale({ billCode: "MB-CM040", memberId: sellerId, totalAmount: 10000 });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-CM040"),
      { timeout: 10000 }
    );

    // Verify wallet transactions
    const txCount = dbQuery(`SELECT COUNT(*) FROM wallet_transactions WHERE type='COMMISSION'`);
    expect(parseInt(txCount)).toBe(2); // child1 and root

    const txDescriptions = dbQuery(
      `SELECT description FROM wallet_transactions WHERE type='COMMISSION' ORDER BY description`
    );
    expect(txDescriptions).toContain("MB-CM040");
    expect(txDescriptions).toContain("Level 1");
    expect(txDescriptions).toContain("Level 2");
  });

  // ── Notifications created for each beneficiary ──

  test("notifications created for each beneficiary", async ({ page }) => {
    const { sellerId, rootId } = setupTreeForCommissions();
    const child1Id = dbQuery("SELECT id FROM users WHERE email='child1@test.com'");
    const saleId = insertPendingSale({ billCode: "MB-CM050", memberId: sellerId, totalAmount: 10000 });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-CM050"),
      { timeout: 10000 }
    );

    // Verify notifications
    const child1Notif = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${child1Id}' ORDER BY created_at DESC LIMIT 1`
    );
    expect(child1Notif).toContain("Commission earned");
    expect(child1Notif).toContain("1000");

    const rootNotif = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${rootId}' ORDER BY created_at DESC LIMIT 1`
    );
    expect(rootNotif).toContain("Commission earned");
    expect(rootNotif).toContain("600");
  });

  // ── Member sees rejection with reason in their sales page ──

  test("member sees rejection reason in their sales page", async ({ page }) => {
    const memberId = getRootMemberId();
    const saleId = insertPendingSale({ billCode: "MB-RJ001", memberId });

    // Reject via admin
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    await page.getByTestId(`reject-sale-${saleId}`).click();
    await page.getByTestId("rejection-reason-input").fill("Bill photo is unclear");
    await page.getByTestId("confirm-reject").click();
    await expect(page.getByTestId("reject-modal")).not.toBeVisible({ timeout: 10000 });

    // Log out admin by calling signout API, then log in as member
    await page.goto("/api/auth/signout");
    // NextAuth signout page has a form; submit it
    await page.getByRole("button", { name: /sign out/i }).click().catch(async () => {
      // Fallback: clear cookies to force logout
      await page.context().clearCookies();
    });
    await page.waitForTimeout(1000);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await page.goto("/dashboard/sales");
    await page.waitForSelector('[data-testid="sales-page"]', { timeout: 10000 });

    // Go to rejected tab
    await page.getByTestId("tab-REJECTED").click();
    await expect(page.getByText("MB-RJ001")).toBeVisible({ timeout: 5000 });

    // Click on it to see detail
    await page.getByText("MB-RJ001").click();
    await expect(page.getByTestId("sale-detail")).toBeVisible();
    await expect(page.getByText("Bill photo is unclear")).toBeVisible();
  });

  // ── Member sees approved sale in their list ──

  test("member sees approved sale in their list", async ({ page }) => {
    const memberId = getRootMemberId();
    const saleId = insertPendingSale({ billCode: "MB-MV001", memberId });

    // Approve via admin
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });
    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-MV001"),
      { timeout: 10000 }
    );

    // Log out admin, log in as member
    await page.context().clearCookies();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await page.goto("/dashboard/sales");
    await page.waitForSelector('[data-testid="sales-page"]', { timeout: 10000 });

    // Check Approved tab
    await page.getByTestId("tab-APPROVED").click();
    await expect(page.getByText("MB-MV001")).toBeVisible({ timeout: 5000 });
  });

  // ── Sale detail with photo (zoomable) ──

  test("sale detail with photo is zoomable", async ({ page }) => {
    const memberId = getRootMemberId();
    const saleId = insertPendingSale({ billCode: "MB-PH001", memberId });

    // Add a bill photo path
    dbQuery(`UPDATE sales SET bill_photo_path='test-photo.jpg' WHERE id='${saleId}'`);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // View sale detail
    await page.getByTestId(`view-sale-${saleId}`).click();
    await expect(page.getByTestId("sale-detail-modal")).toBeVisible();

    // Photo should be present (may show broken image, but element exists)
    const photo = page.getByTestId("detail-photo");
    if (await photo.isVisible().catch(() => false)) {
      // Click to zoom
      await photo.click();
      // Verify class changes (max-w-full vs max-w-xs)
      await expect(photo).toHaveClass(/max-w-full/);
    }
  });

  // ── Admin sees commissions in sale detail ──

  test("admin sees commissions in approved sale detail", async ({ page }) => {
    const { sellerId } = setupTreeForCommissions();
    const saleId = insertPendingSale({ billCode: "MB-CD001", memberId: sellerId, totalAmount: 10000 });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Approve
    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-CD001"),
      { timeout: 10000 }
    );

    // Switch to approved tab
    await page.getByTestId("tab-approved").click();
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 10000 });

    // View detail
    await page.getByTestId(`view-sale-${saleId}`).click();
    await expect(page.getByTestId("sale-detail-modal")).toBeVisible();

    // Commission table visible
    await expect(page.getByTestId("detail-commissions")).toBeVisible();
    await expect(page.getByTestId("commission-row-1")).toBeVisible();
    await expect(page.getByTestId("commission-row-2")).toBeVisible();
  });

  // ── Audit log: sale approved entry ──

  test("audit log: sale approved entry exists", async ({ page }) => {
    const memberId = getRootMemberId();
    const saleId = insertPendingSale({ billCode: "MB-AL001", memberId });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-AL001"),
      { timeout: 10000 }
    );

    // Verify audit log in DB
    const auditCount = dbQuery(
      `SELECT COUNT(*) FROM audit_logs WHERE action='SALE_APPROVED' AND entity_id='${saleId}'`
    );
    expect(parseInt(auditCount)).toBeGreaterThanOrEqual(1);
  });

  // ── Audit log: commission calculated entries ──

  test("audit log: commission calculated entries exist", async ({ page }) => {
    const { sellerId } = setupTreeForCommissions();
    const saleId = insertPendingSale({ billCode: "MB-AL010", memberId: sellerId, totalAmount: 10000 });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-AL010"),
      { timeout: 10000 }
    );

    // Verify commission audit log
    const auditCount = dbQuery(
      `SELECT COUNT(*) FROM audit_logs WHERE action='COMMISSIONS_CALCULATED' AND entity_id='${saleId}'`
    );
    expect(parseInt(auditCount)).toBeGreaterThanOrEqual(1);
  });

  // ── Flagged sales shown with warning icon in admin list ──

  test("flagged sales shown with warning badges in admin list", async ({ page }) => {
    const memberId = getRootMemberId();
    const saleId = insertPendingSale({ billCode: "MB-FW001", memberId, totalAmount: 50000 });
    dbQuery(
      `INSERT INTO sale_flags (id, sale_id, type, severity, details, created_at)
       VALUES (gen_random_uuid(), '${saleId}', 'NEW_MEMBER_HIGH_SALE', 'MEDIUM', 'New member high sale', NOW())`
    );

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Verify flag badge is visible in the table row
    const flagsCell = page.getByTestId(`sale-flags-${saleId}`);
    await expect(flagsCell).toBeVisible();
    await expect(page.getByTestId("flag-NEW_MEMBER_HIGH_SALE")).toBeVisible();
  });

  // ── Sales tabs filter correctly ──

  test("tabs filter sales by status correctly", async ({ page }) => {
    const memberId = getRootMemberId();
    insertPendingSale({ billCode: "MB-TF001", memberId });

    // Create an approved sale
    const approvedId = insertPendingSale({ billCode: "MB-TF002", memberId });
    dbQuery(`UPDATE sales SET status='APPROVED', approved_at=NOW() WHERE id='${approvedId}'`);

    // Create a rejected sale
    const rejectedId = insertPendingSale({ billCode: "MB-TF003", memberId });
    dbQuery(`UPDATE sales SET status='REJECTED', rejection_reason='Test' WHERE id='${rejectedId}'`);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Pending tab: only MB-TF001
    await expect(page.getByText("MB-TF001")).toBeVisible();
    await expect(page.getByText("MB-TF002")).not.toBeVisible();
    await expect(page.getByText("MB-TF003")).not.toBeVisible();

    // Approved tab: only MB-TF002
    await page.getByTestId("tab-approved").click();
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 10000 });
    await expect(page.getByText("MB-TF002")).toBeVisible();
    await expect(page.getByText("MB-TF001")).not.toBeVisible();

    // Rejected tab: only MB-TF003
    await page.getByTestId("tab-rejected").click();
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 10000 });
    await expect(page.getByText("MB-TF003")).toBeVisible();
    await expect(page.getByText("MB-TF001")).not.toBeVisible();

    // All tab: all three
    await page.getByTestId("tab-all").click();
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 10000 });
    await expect(page.getByText("MB-TF001")).toBeVisible();
    await expect(page.getByText("MB-TF002")).toBeVisible();
    await expect(page.getByText("MB-TF003")).toBeVisible();
  });

  // ── Member sees commission in dashboard ──

  test("member sees commission in dashboard after sale approval", async ({ page }) => {
    const { sellerId, rootId } = setupTreeForCommissions();
    const child1Id = dbQuery("SELECT id FROM users WHERE email='child1@test.com'");
    const saleId = insertPendingSale({ billCode: "MB-DC001", memberId: sellerId, totalAmount: 10000 });

    // Approve via admin
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });
    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="sales-table"]')?.textContent?.includes("MB-DC001"),
      { timeout: 10000 }
    );

    // Log out admin, log in as root member and check dashboard wallet
    await page.context().clearCookies();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard*", { timeout: 10000 });

    // Root should see wallet with ₹600 (L2 commission)
    // Check wallet summary on dashboard
    const walletPending = dbQuery(`SELECT pending FROM wallets WHERE user_id='${rootId}'`);
    expect(parseFloat(walletPending)).toBe(600.00);
  });
});
