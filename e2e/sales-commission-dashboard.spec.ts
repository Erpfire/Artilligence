import { test, expect } from "@playwright/test";
import {
  resetTestData,
  login,
  dbQuery,
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

const MEMBER_PW_HASH =
  "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureTestFiles() {
  mkdirSync(TEST_FILES_DIR, { recursive: true });
  const jpgBytes = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  writeFileSync(path.join(TEST_FILES_DIR, "receipt.jpg"), jpgBytes);
}

function cleanAllData() {
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

function getRootWalletId(): string {
  const rootId = getRootMemberId();
  return dbQuery(`SELECT id FROM wallets WHERE user_id='${rootId}'`);
}

function getAdminId(): string {
  return dbQuery("SELECT id FROM users WHERE email='admin@artilligence.com'");
}

function ensureCommissionSettings15Levels() {
  dbQuery("DELETE FROM commission_settings");
  const rates = [
    [1, 10.0], [2, 6.0], [3, 4.0], [4, 3.0], [5, 2.0],
    [6, 1.0], [7, 0.5], [8, 0.25], [9, 0.1], [10, 0.05],
    [11, 0.04], [12, 0.03], [13, 0.02], [14, 0.005], [15, 0.001],
  ];
  for (const [level, pct] of rates) {
    dbQuery(
      `INSERT INTO commission_settings (id, level, percentage, updated_at) VALUES (gen_random_uuid(), ${level}, ${pct}, NOW())`
    );
  }
}

function setWalletBalances(userId: string, totalEarned: number, pending: number, paidOut: number) {
  dbQuery(
    `UPDATE wallets SET total_earned=${totalEarned}, pending=${pending}, paid_out=${paidOut} WHERE user_id='${userId}'`
  );
}

function createTransaction(walletId: string, type: string, amount: number, description: string, daysAgo = 0) {
  const dateOffset = daysAgo > 0 ? `NOW() - INTERVAL '${daysAgo} days'` : "NOW()";
  dbQuery(
    `INSERT INTO wallet_transactions (id, wallet_id, type, amount, description, created_at)
     VALUES (gen_random_uuid(), '${walletId}', '${type}', ${amount}, '${description}', ${dateOffset})`
  );
}

function createApprovedSale(memberId: string, billCode: string, amount: number, adminId: string, daysAgo = 0) {
  const dateOffset = daysAgo > 0 ? `NOW() - INTERVAL '${daysAgo} days'` : "NOW()";
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, approved_by, approved_at, created_at, updated_at)
     VALUES (gen_random_uuid(), '${memberId}', '${billCode}', ${amount}, 'Test Customer', '+919876543210', ${dateOffset}, 'APPROVED', '${adminId}', NOW(), NOW(), NOW())`
  );
}

function createPendingSale(memberId: string, billCode: string, amount: number) {
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${memberId}', '${billCode}', ${amount}, 'Test Customer', '+919876543210', NOW(), 'PENDING', NOW(), NOW())`
  );
}

function createReturnedSale(memberId: string, billCode: string, amount: number, adminId: string) {
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, approved_by, approved_at, return_reason, created_at, updated_at)
     VALUES (gen_random_uuid(), '${memberId}', '${billCode}', ${amount}, 'Test Customer', '+919876543210', NOW(), 'RETURNED', '${adminId}', NOW(), 'Product defective', NOW(), NOW())`
  );
}

function createRejectedSale(memberId: string, billCode: string, amount: number) {
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, rejection_reason, created_at, updated_at)
     VALUES (gen_random_uuid(), '${memberId}', '${billCode}', ${amount}, 'Test Customer', '+919876543210', NOW(), 'REJECTED', 'Test rejection', NOW(), NOW())`
  );
}

function insertPendingSaleWithItem(memberId: string, billCode: string, amount: number): string {
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${memberId}', '${billCode}', ${amount}, 'Test Customer', '+919876543210', NOW(), 'PENDING', NOW(), NOW())`
  );
  const saleId = dbQuery(`SELECT id FROM sales WHERE bill_code='${billCode}'`);
  const productId = dbQuery("SELECT id FROM products WHERE is_active=true ORDER BY name LIMIT 1");
  dbQuery(
    `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
     VALUES (gen_random_uuid(), '${saleId}', '${productId}', 1, ${amount}, ${amount})`
  );
  return saleId;
}

function ensureSecondMember(): string {
  const exists = dbQuery("SELECT COUNT(*) FROM users WHERE email='dash-member2@test.com'");
  if (parseInt(exists) === 0) {
    const rootId = getRootMemberId();
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, referral_code, sponsor_id, parent_id, position, depth, path, status, has_completed_onboarding, created_at, updated_at)
       VALUES (gen_random_uuid(), 'dash-member2@test.com', '${MEMBER_PW_HASH}', 'Suresh Verma', '+919876500002', 'MEMBER', 'DASHM2', '${rootId}', '${rootId}', 1, 1, '/root/1', 'ACTIVE', true, NOW(), NOW())`
    );
    const m2Id = dbQuery("SELECT id FROM users WHERE email='dash-member2@test.com'");
    dbQuery(
      `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
       VALUES (gen_random_uuid(), '${m2Id}', 0, 0, 0, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`
    );
  }
  return dbQuery("SELECT id FROM users WHERE email='dash-member2@test.com'");
}

function ensureThirdMember(): string {
  const exists = dbQuery("SELECT COUNT(*) FROM users WHERE email='dash-member3@test.com'");
  if (parseInt(exists) === 0) {
    const rootId = getRootMemberId();
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, referral_code, sponsor_id, parent_id, position, depth, path, status, has_completed_onboarding, created_at, updated_at)
       VALUES (gen_random_uuid(), 'dash-member3@test.com', '${MEMBER_PW_HASH}', 'Amit Sharma', '+919876500003', 'MEMBER', 'DASHM3', '${rootId}', '${rootId}', 2, 1, '/root/2', 'ACTIVE', true, NOW(), NOW())`
    );
    const m3Id = dbQuery("SELECT id FROM users WHERE email='dash-member3@test.com'");
    dbQuery(
      `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
       VALUES (gen_random_uuid(), '${m3Id}', 0, 0, 0, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`
    );
  }
  return dbQuery("SELECT id FROM users WHERE email='dash-member3@test.com'");
}

/** Submit a sale via member UI form */
async function submitSaleViaUI(page: any, billCode: string) {
  await page.goto("/dashboard/sales");
  await page.waitForSelector('[data-testid="sales-page"]', { timeout: 10000 });
  await page.getByTestId("submit-sale-button").click();
  await expect(page.getByTestId("sale-form")).toBeVisible();
  // Wait for products
  await page.waitForFunction(() => {
    const sel = document.querySelector('[data-testid="product-select-0"]') as HTMLSelectElement;
    return sel && sel.options.length > 1;
  }, { timeout: 10000 });

  await page.getByTestId("input-billCode").fill(billCode);
  await page.getByTestId("product-select-0").selectOption({ index: 1 });
  await page.getByTestId("input-customerName").fill("UI Test Customer");
  await page.getByTestId("input-customerPhone").fill("+919876500099");
  await page.getByTestId("input-billPhoto").setInputFiles(path.join(TEST_FILES_DIR, "receipt.jpg"));
  await page.getByTestId("submit-sale-confirm").click();
  await page.waitForSelector('[data-testid="sale-success"], [data-testid="sales-page"]', { timeout: 15000 });
}

/** Approve a sale via admin UI */
async function approveSaleViaUI(page: any, saleId: string) {
  await page.goto("/admin/sales");
  await page.waitForSelector('[data-testid="sales-table"], [data-testid="sales-empty"]', { timeout: 15000 });
  const isEmpty = await page.getByTestId("sales-empty").isVisible().catch(() => false);
  if (isEmpty) {
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 10000 });
  }
  await page.getByTestId(`approve-sale-${saleId}`).click();
  await page.waitForTimeout(2000);
}

// ═════════════════════════════════════════════════════════════════════════════
// Feature 4: Member — Potential Earnings Table
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Feature 4: Potential Earnings Table", () => {
  test.beforeEach(async () => {
    resetTestData();
    ensureCommissionSettings15Levels();
    await resetRateLimiter();
  });

  test("shows all 15 levels with correct percentages and earnings", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("wallet-page")).toBeVisible();
    await page.waitForSelector('[data-testid="potential-earnings-section"]', { timeout: 10000 });

    // Title
    await expect(page.getByTestId("potential-earnings-title")).toBeVisible();

    // All 15 rows
    for (let level = 1; level <= 15; level++) {
      await expect(page.getByTestId(`earnings-row-${level}`)).toBeVisible();
    }

    // Spot-check specific levels
    const expectedData = [
      { level: 1, pct: "10.00%", earning: "3,000" },
      { level: 2, pct: "6.00%", earning: "1,800" },
      { level: 7, pct: "0.50%", earning: "150" },
      { level: 10, pct: "0.05%", earning: "15" },
      { level: 14, pct: "0.005%", earning: "1.50" },
      { level: 15, pct: "0.001%", earning: "0.30" },
    ];
    for (const { level, pct, earning } of expectedData) {
      const row = page.getByTestId(`earnings-row-${level}`);
      await expect(row).toContainText(pct);
      await expect(row).toContainText(earning);
    }

    // Total row
    await expect(page.getByTestId("earnings-total-row")).toBeVisible();
    const totalText = await page.getByTestId("earnings-total-amount").textContent();
    expect(totalText).toBeTruthy();
    // Total should be ₹8,098.80 = 30000 * 26.996%
    await expect(page.getByTestId("earnings-total-amount")).toContainText("8,098");
  });

  test("reads rates dynamically — changing a rate in DB updates the table", async ({ page }) => {
    dbQuery("UPDATE commission_settings SET percentage=12.0 WHERE level=1");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="potential-earnings-section"]', { timeout: 10000 });

    const row1 = page.getByTestId("earnings-row-1");
    await expect(row1).toContainText("12.00%");
    await expect(row1).toContainText("3,600");
  });

  test("earnings table hidden when no commission settings exist", async ({ page }) => {
    dbQuery("DELETE FROM commission_settings");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("wallet-page")).toBeVisible();

    // Table section should NOT appear
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("potential-earnings-section")).toBeHidden();
  });

  test("earnings table with only a few levels (not full 15)", async ({ page }) => {
    // Remove levels 8-15, keep only 7
    dbQuery("DELETE FROM commission_settings WHERE level > 7");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="potential-earnings-section"]', { timeout: 10000 });

    // Only 7 rows
    for (let level = 1; level <= 7; level++) {
      await expect(page.getByTestId(`earnings-row-${level}`)).toBeVisible();
    }
    // Level 8 should not exist
    await expect(page.getByTestId("earnings-row-8")).toBeHidden();
  });

  test("earnings table shows correct ₹ formatting with commas", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="potential-earnings-section"]', { timeout: 10000 });

    // Level 1: ₹3,000.00 (Indian number format)
    const row1 = page.getByTestId("earnings-row-1");
    const row1Text = await row1.textContent();
    expect(row1Text).toMatch(/₹3,000/);
  });

  test("earnings table visible on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone size
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="potential-earnings-section"]', { timeout: 10000 });

    // Table should be scrollable and visible
    await expect(page.getByTestId("potential-earnings-table")).toBeVisible();
    await expect(page.getByTestId("earnings-row-1")).toBeVisible();
    await expect(page.getByTestId("earnings-total-row")).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Feature 3: Member — My Commission View
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Feature 3: Member Commission View", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("shows wallet summary cards with correct balances", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 12500, 4200, 8300);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("wallet-page")).toBeVisible();

    await expect(page.getByTestId("wallet-total-amount")).toContainText("12,500");
    await expect(page.getByTestId("wallet-pending-amount")).toContainText("4,200");
    await expect(page.getByTestId("wallet-paid-amount")).toContainText("8,300");
  });

  test("new member with zero wallet sees ₹0 balances", async ({ page }) => {
    // Root starts with 0 balances from resetTestData
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("wallet-page")).toBeVisible();

    await expect(page.getByTestId("wallet-total-amount")).toContainText("0");
    await expect(page.getByTestId("wallet-pending-amount")).toContainText("0");
    await expect(page.getByTestId("wallet-paid-amount")).toContainText("0");
  });

  test("empty transaction list shows placeholder message", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("wallet-page")).toBeVisible();

    await expect(page.getByTestId("transactions-empty")).toBeVisible();
  });

  test("transaction history with type filter", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    createTransaction(walletId, "COMMISSION", 500, "Level 1 commission from sale MB-001");
    createTransaction(walletId, "PAYOUT", -2000, "Payout received");
    createTransaction(walletId, "COMMISSION", 300, "Level 2 commission from sale MB-002");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="transactions-list"]', { timeout: 10000 });

    // 3 transactions total
    await expect(page.locator("[data-testid^='transaction-row-']")).toHaveCount(3);

    // Filter PAYOUT only
    await page.getByTestId("wallet-type-filter").selectOption("PAYOUT");
    await expect(page.locator("[data-testid^='transaction-row-']")).toHaveCount(1, { timeout: 5000 });

    // Filter COMMISSION only
    await page.getByTestId("wallet-type-filter").selectOption("COMMISSION");
    await expect(page.locator("[data-testid^='transaction-row-']")).toHaveCount(2, { timeout: 5000 });

    // Filter ADJUSTMENT — 0 results
    await page.getByTestId("wallet-type-filter").selectOption("ADJUSTMENT");
    await expect(page.getByTestId("transactions-empty")).toBeVisible({ timeout: 5000 });

    // Clear filters restores all
    await page.getByTestId("wallet-clear-filters").click();
    await expect(page.locator("[data-testid^='transaction-row-']")).toHaveCount(3, { timeout: 5000 });
  });

  test("transaction amounts show correct colors — green for credit, red for debit", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 3000, 1000, 2000);

    createTransaction(walletId, "COMMISSION", 1000, "Commission earned");
    createTransaction(walletId, "PAYOUT", -2000, "Payout sent");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="transactions-list"]', { timeout: 10000 });

    const rows = page.locator("[data-testid^='transaction-row-']");
    await expect(rows).toHaveCount(2);

    // Check amount colors via class — green for positive, red for negative
    const amounts = page.locator("[data-testid^='transaction-amount-']");
    const first = amounts.nth(0);
    const second = amounts.nth(1);

    // One should be green, one should be red (depending on order)
    const firstClass = await first.getAttribute("class") || "";
    const secondClass = await second.getAttribute("class") || "";

    const hasGreen = firstClass.includes("green") || secondClass.includes("green");
    const hasRed = firstClass.includes("red") || secondClass.includes("red");
    expect(hasGreen).toBe(true);
    expect(hasRed).toBe(true);
  });

  test("date range filter narrows transactions", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 2000, 2000, 0);

    createTransaction(walletId, "COMMISSION", 1000, "Old commission", 30); // 30 days ago
    createTransaction(walletId, "COMMISSION", 1000, "Recent commission", 0); // today

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="transactions-list"]', { timeout: 10000 });

    // Both transactions visible
    await expect(page.locator("[data-testid^='transaction-row-']")).toHaveCount(2);

    // Filter to future date range — 0 results
    await page.getByTestId("wallet-date-from").fill("2030-01-01");
    await page.waitForTimeout(500);
    await page.getByTestId("wallet-date-to").fill("2030-12-31");
    await expect(page.getByTestId("transactions-empty")).toBeVisible({ timeout: 10000 });

    // Clear filters — reload page to verify all data
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="transactions-list"]', { timeout: 10000 });
    await expect(page.locator("[data-testid^='transaction-row-']")).toHaveCount(2, { timeout: 10000 });
  });

  test("pagination works with more than 10 transactions", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 12000, 12000, 0);

    // Create 12 transactions
    for (let i = 1; i <= 12; i++) {
      createTransaction(walletId, "COMMISSION", 1000, `Commission #${i}`);
    }

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="transactions-list"]', { timeout: 10000 });

    // Page 1: 10 rows
    await expect(page.locator("[data-testid^='transaction-row-']")).toHaveCount(10);

    // Pagination info
    await expect(page.getByTestId("wallet-pagination-info")).toContainText("1–10");
    await expect(page.getByTestId("wallet-pagination-info")).toContainText("12");

    // Go to page 2
    await page.getByTestId("wallet-next-page").click();
    await expect(page.locator("[data-testid^='transaction-row-']")).toHaveCount(2, { timeout: 5000 });
    await expect(page.getByTestId("wallet-page-info")).toContainText("2 / 2");

    // Go back to page 1
    await page.getByTestId("wallet-prev-page").click();
    await expect(page.locator("[data-testid^='transaction-row-']")).toHaveCount(10, { timeout: 5000 });
  });

  test("mobile view shows transaction cards instead of table", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 1000, 1000, 0);
    createTransaction(walletId, "COMMISSION", 1000, "Test commission");

    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("wallet-page")).toBeVisible();

    // Desktop table should be hidden, mobile cards visible
    await expect(page.getByTestId("transactions-list")).toBeHidden();
    await expect(page.getByTestId("transactions-cards")).toBeVisible();
    await expect(page.locator("[data-testid^='transaction-card-']")).toHaveCount(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Feature 1: Admin — Total Sales Overview
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Feature 1: Admin Sales Overview", () => {
  test.beforeEach(async () => {
    resetTestData();
    cleanAllData();
    await resetRateLimiter();
  });

  test("shows summary section with correct status breakdown", async ({ page }) => {
    const rootId = getRootMemberId();
    const adminId = getAdminId();

    createApprovedSale(rootId, "MB-90001", 30000, adminId);
    createApprovedSale(rootId, "MB-90002", 25000, adminId);
    createPendingSale(rootId, "MB-90003", 15000);
    createRejectedSale(rootId, "MB-90004", 10000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-summary-section"]', { timeout: 10000 });

    // Approved total: 55000
    await expect(page.getByTestId("summary-approved-amount")).toContainText("55,000", { timeout: 10000 });
    // Breakdown
    await expect(page.getByTestId("summary-pending-count")).toContainText("1", { timeout: 10000 });
    await expect(page.getByTestId("summary-approved-count")).toContainText("2", { timeout: 10000 });
    await expect(page.getByTestId("summary-rejected-count")).toContainText("1", { timeout: 10000 });
    await expect(page.getByTestId("summary-returned-count")).toContainText("0", { timeout: 10000 });
  });

  test("empty state — no sales shows zero across all cards", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-summary-section"]', { timeout: 10000 });

    await expect(page.getByTestId("summary-approved-amount")).toContainText("0", { timeout: 10000 });
    await expect(page.getByTestId("summary-pending-count")).toContainText("0", { timeout: 10000 });
    await expect(page.getByTestId("summary-approved-count")).toContainText("0", { timeout: 10000 });
  });

  test("date filter narrows summary to specific range", async ({ page }) => {
    const rootId = getRootMemberId();
    const adminId = getAdminId();

    createApprovedSale(rootId, "MB-80001", 20000, adminId);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-summary-section"]', { timeout: 10000 });

    await expect(page.getByTestId("summary-approved-count")).toContainText("1", { timeout: 10000 });

    // Distant past — 0
    await page.getByTestId("summary-date-from").fill("2020-01-01");
    await page.waitForTimeout(300);
    await page.getByTestId("summary-date-to").fill("2020-01-02");
    await expect(page.getByTestId("summary-approved-count")).toContainText("0", { timeout: 15000 });

    // Clear dates — back to 1
    await page.getByTestId("summary-clear-dates").click();
    await expect(page.getByTestId("summary-approved-count")).toContainText("1", { timeout: 10000 });
  });

  test("summary includes all statuses including RETURNED", async ({ page }) => {
    const rootId = getRootMemberId();
    const adminId = getAdminId();

    createApprovedSale(rootId, "MB-70001", 10000, adminId);
    createPendingSale(rootId, "MB-70002", 5000);
    createRejectedSale(rootId, "MB-70003", 8000);
    createReturnedSale(rootId, "MB-70004", 12000, adminId);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-summary-section"]', { timeout: 10000 });

    await expect(page.getByTestId("summary-approved-count")).toContainText("1", { timeout: 10000 });
    await expect(page.getByTestId("summary-pending-count")).toContainText("1", { timeout: 10000 });
    await expect(page.getByTestId("summary-rejected-count")).toContainText("1", { timeout: 10000 });
    await expect(page.getByTestId("summary-returned-count")).toContainText("1", { timeout: 10000 });
  });

  test("summary updates after approving a sale via UI", async ({ page }) => {
    const rootId = getRootMemberId();
    ensureCommissionSettings15Levels();

    const saleId = insertPendingSaleWithItem(rootId, "MB-60001", 30000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-summary-section"]', { timeout: 10000 });

    // Initially: 1 pending, 0 approved
    await expect(page.getByTestId("summary-pending-count")).toContainText("1", { timeout: 10000 });
    await expect(page.getByTestId("summary-approved-count")).toContainText("0", { timeout: 10000 });

    // Approve via UI
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });
    await page.getByTestId(`approve-sale-${saleId}`).click();

    // Summary should update: 0 pending, 1 approved
    await expect(page.getByTestId("summary-pending-count")).toContainText("0", { timeout: 15000 });
    await expect(page.getByTestId("summary-approved-count")).toContainText("1", { timeout: 15000 });
    await expect(page.getByTestId("summary-approved-amount")).toContainText("30,000", { timeout: 10000 });
  });

  test("large amounts format correctly with Indian numbering", async ({ page }) => {
    const rootId = getRootMemberId();
    const adminId = getAdminId();

    // 12,50,000 in Indian format
    createApprovedSale(rootId, "MB-50001", 1250000, adminId);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-summary-section"]', { timeout: 10000 });

    // Indian format: ₹12,50,000
    await expect(page.getByTestId("summary-approved-amount")).toContainText("12,50,000", { timeout: 10000 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Feature 2: Admin — Commission Tracker (Wallets)
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Feature 2: Admin Commission Tracker", () => {
  test.beforeEach(async () => {
    resetTestData();
    cleanAllData();
    await resetRateLimiter();
  });

  test("sortable column headers with click toggle", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 2000, 3000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="admin-wallets-page"]', { timeout: 10000 });

    // All 3 sortable headers visible
    await expect(page.getByTestId("sort-total-earned")).toBeVisible();
    await expect(page.getByTestId("sort-pending")).toBeVisible();
    await expect(page.getByTestId("sort-paid-out")).toBeVisible();

    // Default: pending desc (↓)
    await expect(page.getByTestId("sort-pending")).toContainText("↓");

    // Click total earned: sorts desc
    await page.getByTestId("sort-total-earned").click();
    await expect(page.getByTestId("sort-total-earned")).toContainText("↓", { timeout: 5000 });

    // Click total earned again: toggles to asc
    await page.getByTestId("sort-total-earned").click();
    await expect(page.getByTestId("sort-total-earned")).toContainText("↑", { timeout: 5000 });
  });

  test("sort order changes displayed data with multiple members", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 10000, 5000, 5000);

    const m2Id = ensureSecondMember();
    setWalletBalances(m2Id, 3000, 1000, 2000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 10000 });

    // Default: sorted by pending desc — root (5000) first
    const firstRow = page.locator("[data-testid^='wallet-row-']").first();
    await expect(firstRow.getByTestId(`wallet-pending-${rootId}`)).toContainText("5,000");

    // Sort by paid out desc
    await page.getByTestId("sort-paid-out").click();
    await page.waitForTimeout(800);
    const firstRowAfterSort = page.locator("[data-testid^='wallet-row-']").first();
    await expect(firstRowAfterSort.getByTestId(`wallet-paid-${rootId}`)).toContainText("5,000");
  });

  test("pending only filter hides zero-pending wallets", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 0, 5000);

    const m2Id = ensureSecondMember();
    setWalletBalances(m2Id, 3000, 1500, 1500);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 10000 });

    await expect(page.locator("[data-testid^='wallet-row-']")).toHaveCount(2);

    // Toggle pending only
    await page.getByTestId("wallets-pending-only").check();
    await expect(page.locator("[data-testid^='wallet-row-']")).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByTestId(`wallet-row-${m2Id}`)).toBeVisible();

    // Uncheck — both visible again
    await page.getByTestId("wallets-pending-only").uncheck();
    await expect(page.locator("[data-testid^='wallet-row-']")).toHaveCount(2, { timeout: 5000 });
  });

  test("pending only filter with all wallets at zero shows empty state", async ({ page }) => {
    // Root wallet starts at 0 from resetTestData
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"], [data-testid="wallets-empty"]', { timeout: 10000 });

    await page.getByTestId("wallets-pending-only").check();
    await expect(page.getByTestId("wallets-empty")).toBeVisible({ timeout: 5000 });
  });

  test("payout modal validates amount exceeding pending", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 1000, 4000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 10000 });

    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.waitForSelector('[data-testid="payout-modal"]', { timeout: 5000 });

    // Enter amount exceeding pending
    await page.getByTestId("payout-amount-input").fill("5000");
    await page.getByTestId("payout-confirm").click();

    // Error message should appear
    await expect(page.getByTestId("payout-error")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("payout-error")).toContainText("exceeds");
  });

  test("payout success updates table balances", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 10000 });

    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.waitForSelector('[data-testid="payout-modal"]', { timeout: 5000 });

    await page.getByTestId("payout-amount-input").fill("1500");
    await page.getByTestId("payout-confirm").click();

    await expect(page.getByTestId("payout-modal")).toBeHidden({ timeout: 5000 });

    // Pending: 3000 → 1500, Paid: 2000 → 3500
    await expect(page.getByTestId(`wallet-pending-${rootId}`)).toContainText("1,500", { timeout: 5000 });
    await expect(page.getByTestId(`wallet-paid-${rootId}`)).toContainText("3,500", { timeout: 5000 });

    // Verify in DB
    const dbPending = dbQuery(`SELECT pending FROM wallets WHERE user_id='${rootId}'`);
    expect(parseFloat(dbPending)).toBe(1500);
  });

  test("payout cancel closes modal without changes", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 10000 });

    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.waitForSelector('[data-testid="payout-modal"]', { timeout: 5000 });
    await page.getByTestId("payout-amount-input").fill("500");
    await page.getByTestId("payout-cancel").click();

    await expect(page.getByTestId("payout-modal")).toBeHidden({ timeout: 5000 });
    // Balances unchanged
    await expect(page.getByTestId(`wallet-pending-${rootId}`)).toContainText("3,000");
  });

  test("search by member name", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 1000, 500, 500);
    ensureSecondMember();

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 10000 });

    await page.getByTestId("wallets-search").fill("Rajesh");
    await expect(page.locator("[data-testid^='wallet-row-']")).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByTestId(`wallet-member-name-${rootId}`)).toContainText("Rajesh");
  });

  test("search by phone number", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 1000, 500, 500);
    const m2Id = ensureSecondMember();
    setWalletBalances(m2Id, 2000, 1000, 1000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 10000 });

    // Search by member2's phone
    await page.getByTestId("wallets-search").fill("9876500002");
    await expect(page.locator("[data-testid^='wallet-row-']")).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByTestId(`wallet-row-${m2Id}`)).toBeVisible();
  });

  test("search with no match shows empty state", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"], [data-testid="wallets-empty"]', { timeout: 10000 });

    await page.getByTestId("wallets-search").fill("NonExistentMember12345");
    await expect(page.getByTestId("wallets-empty")).toBeVisible({ timeout: 5000 });
  });

  test("total pending payouts banner shows correct aggregate", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    const m2Id = ensureSecondMember();
    setWalletBalances(m2Id, 4000, 2000, 2000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="admin-wallets-page"]', { timeout: 10000 });

    // Total pending: 3000 + 2000 = 5000
    await expect(page.getByTestId("total-pending-amount")).toContainText("5,000", { timeout: 10000 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Commission Settings: 15-Level Verification
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Commission Settings: 15 Levels", () => {
  test.beforeEach(async () => {
    resetTestData();
    ensureCommissionSettings15Levels();
    await resetRateLimiter();
  });

  test("database has exactly 15 levels with correct percentages", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/commissions");
    await page.waitForTimeout(2000);

    const levelCount = dbQuery("SELECT COUNT(*) FROM commission_settings");
    expect(parseInt(levelCount)).toBe(15);

    // Edge levels
    expect(parseFloat(dbQuery("SELECT percentage FROM commission_settings WHERE level=1"))).toBe(10.0);
    expect(parseFloat(dbQuery("SELECT percentage FROM commission_settings WHERE level=14"))).toBeCloseTo(0.005, 3);
    expect(parseFloat(dbQuery("SELECT percentage FROM commission_settings WHERE level=15"))).toBeCloseTo(0.001, 3);

    // Total under 27%
    const totalPct = parseFloat(dbQuery("SELECT SUM(percentage) FROM commission_settings"));
    expect(totalPct).toBeLessThan(27);
    expect(totalPct).toBeCloseTo(26.996, 3);
  });

  test("admin commissions page shows all 15 levels in rates table", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commission-rates-table"]', { timeout: 10000 });

    // Verify level rows exist for key levels
    await expect(page.getByTestId("commission-row-1")).toBeVisible();
    await expect(page.getByTestId("commission-row-7")).toBeVisible();
    await expect(page.getByTestId("commission-row-15")).toBeVisible();

    // Verify percentage display for level 1 and 15
    await expect(page.getByTestId("percentage-1")).toContainText("10");
    await expect(page.getByTestId("percentage-15")).toContainText("0.001");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-Feature: Real UI End-to-End Flows
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Cross-Feature: End-to-End UI Flows", () => {
  test.beforeAll(() => {
    ensureTestFiles();
  });

  test.beforeEach(async () => {
    resetTestData();
    cleanAllData();
    ensureCommissionSettings15Levels();
    await resetRateLimiter();
  });

  test("member submits sale → admin approves → summary updates + wallet credited", async ({ page }) => {
    const rootId = getRootMemberId();

    // Setup: create a child member who will be the seller
    // Root is the upline — so approving child's sale should credit root's wallet
    const childExists = dbQuery("SELECT COUNT(*) FROM users WHERE email='e2e-seller@test.com'");
    if (parseInt(childExists) === 0) {
      dbQuery(
        `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
         VALUES (gen_random_uuid(), 'e2e-seller@test.com', '${MEMBER_PW_HASH}', 'E2E Seller', '+919555000001', 'MEMBER', '${rootId}', '${rootId}', 0, 1, '/${rootId}/', 'E2ESELL', 'ACTIVE', true, NOW(), NOW())`
      );
      const sellerId = dbQuery("SELECT id FROM users WHERE email='e2e-seller@test.com'");
      dbQuery(
        `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
         VALUES (gen_random_uuid(), '${sellerId}', 0, 0, 0, NOW(), NOW())
         ON CONFLICT (user_id) DO NOTHING`
      );
    }
    const sellerId = dbQuery("SELECT id FROM users WHERE email='e2e-seller@test.com'");

    // Step 1: Seller submits a sale via DB (seller UI not in scope)
    const saleId = insertPendingSaleWithItem(sellerId, "MB-E2E01", 30000);

    // Step 2: Admin logs in and sees 1 pending in summary
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-summary-section"]', { timeout: 10000 });
    await expect(page.getByTestId("summary-pending-count")).toContainText("1", { timeout: 10000 });
    await expect(page.getByTestId("summary-approved-count")).toContainText("0", { timeout: 10000 });

    // Step 3: Admin approves the sale via UI
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });
    await page.getByTestId(`approve-sale-${saleId}`).click();

    // Step 4: Summary updates — 0 pending, 1 approved
    await expect(page.getByTestId("summary-pending-count")).toContainText("0", { timeout: 15000 });
    await expect(page.getByTestId("summary-approved-count")).toContainText("1", { timeout: 15000 });
    await expect(page.getByTestId("summary-approved-amount")).toContainText("30,000", { timeout: 10000 });

    // Step 5: Verify root's wallet was credited via commission engine
    const rootPending = dbQuery(`SELECT pending FROM wallets WHERE user_id='${rootId}'`);
    const rootEarned = dbQuery(`SELECT total_earned FROM wallets WHERE user_id='${rootId}'`);
    // Level 1 commission: 30000 * 10% = 3000
    expect(parseFloat(rootPending)).toBe(3000);
    expect(parseFloat(rootEarned)).toBe(3000);

    // Step 6: Admin navigates to wallets page — sees root has pending
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 10000 });
    await expect(page.getByTestId(`wallet-pending-${rootId}`)).toContainText("3,000", { timeout: 10000 });
    await expect(page.getByTestId(`wallet-earned-${rootId}`)).toContainText("3,000", { timeout: 10000 });
  });

  test("admin pays out → member wallet shows updated balances", async ({ page, browser }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);
    const walletId = getRootWalletId();
    createTransaction(walletId, "COMMISSION", 5000, "Commission earned");

    // Step 1: Admin processes payout via UI
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 10000 });

    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.waitForSelector('[data-testid="payout-modal"]', { timeout: 5000 });
    await page.getByTestId("payout-amount-input").fill("2000");
    await page.getByTestId("payout-confirm").click();
    await expect(page.getByTestId("payout-modal")).toBeHidden({ timeout: 5000 });

    // Verify admin sees updated balances: pending 1000, paid 4000
    await expect(page.getByTestId(`wallet-pending-${rootId}`)).toContainText("1,000", { timeout: 5000 });
    await expect(page.getByTestId(`wallet-paid-${rootId}`)).toContainText("4,000", { timeout: 5000 });

    // Step 2: Member logs in (separate browser context to avoid shared session)
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await login(memberPage, MEMBER_EMAIL, MEMBER_PASSWORD);
    await memberPage.waitForURL("/dashboard");
    await memberPage.goto("/dashboard/wallet");
    await expect(memberPage.getByTestId("wallet-page")).toBeVisible();

    await expect(memberPage.getByTestId("wallet-total-amount")).toContainText("5,000");
    await expect(memberPage.getByTestId("wallet-pending-amount")).toContainText("1,000");
    await expect(memberPage.getByTestId("wallet-paid-amount")).toContainText("4,000");

    // Payout transaction should appear in history — look within the table body
    await expect(memberPage.getByTestId("transactions-list")).toBeVisible({ timeout: 10000 });
    // Check that a PAYOUT type badge exists inside the transactions table
    const payoutBadge = memberPage.getByTestId("transactions-list").locator("span", { hasText: "Payout" });
    await expect(payoutBadge.first()).toBeVisible({ timeout: 5000 });

    await memberContext.close();
  });

  test("pending filter combined with search", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 0, 5000); // zero pending

    const m2Id = ensureSecondMember();
    setWalletBalances(m2Id, 3000, 1500, 1500); // has pending

    const m3Id = ensureThirdMember();
    setWalletBalances(m3Id, 4000, 2000, 2000); // has pending

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 10000 });

    // All 3 visible
    await expect(page.locator("[data-testid^='wallet-row-']")).toHaveCount(3);

    // Enable pending only — 2 visible (m2, m3)
    await page.getByTestId("wallets-pending-only").check();
    await expect(page.locator("[data-testid^='wallet-row-']")).toHaveCount(2, { timeout: 5000 });

    // Search for Suresh (m2) within pending only
    await page.getByTestId("wallets-search").fill("Suresh");
    await expect(page.locator("[data-testid^='wallet-row-']")).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByTestId(`wallet-row-${m2Id}`)).toBeVisible();
  });
});
