import { test, expect } from "@playwright/test";
import {
  resetTestData,
  login,
  dbQuery,
  resetRateLimiter,
  ensureRootMember,
} from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const MEMBER_EMAIL = "root@artilligence.com";
const MEMBER_PASSWORD = "member123456";

const MEMBER_PW_HASH =
  "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

function cleanWalletData() {
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

/** Set wallet balances directly */
function setWalletBalances(userId: string, totalEarned: number, pending: number, paidOut: number) {
  dbQuery(
    `UPDATE wallets SET total_earned=${totalEarned}, pending=${pending}, paid_out=${paidOut} WHERE user_id='${userId}'`
  );
}

/** Create a wallet transaction directly */
function createTransaction(walletId: string, type: string, amount: number, description: string, daysAgo = 0) {
  const dateOffset = daysAgo > 0 ? `NOW() - INTERVAL '${daysAgo} days'` : "NOW()";
  dbQuery(
    `INSERT INTO wallet_transactions (id, wallet_id, type, amount, description, created_at)
     VALUES (gen_random_uuid(), '${walletId}', '${type}', ${amount}, '${description}', ${dateOffset})`
  );
}

/** Create a second member for multi-wallet admin tests */
function ensureSecondMember(): string {
  const exists = dbQuery("SELECT COUNT(*) FROM users WHERE email='wallet-member2@test.com'");
  if (parseInt(exists) === 0) {
    const rootId = getRootMemberId();
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
       VALUES (gen_random_uuid(), 'wallet-member2@test.com', '${MEMBER_PW_HASH}', 'Wallet Test Member', '+919333000001', 'MEMBER', '${rootId}', '${rootId}', 0, 1, '/${rootId}/', 'WALTEST2', 'ACTIVE', true, NOW(), NOW())`
    );
  }
  const memberId = dbQuery("SELECT id FROM users WHERE email='wallet-member2@test.com'");
  dbQuery(
    `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
     VALUES (gen_random_uuid(), '${memberId}', 0, 0, 0, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`
  );
  return memberId;
}

// ═══════════════════════════════════════════════════════════════
// MEMBER WALLET TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Member Wallet Page", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("shows correct wallet balances", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("wallet-page")).toBeVisible();

    await expect(page.getByTestId("wallet-total-amount")).toContainText("₹5,000.00");
    await expect(page.getByTestId("wallet-pending-amount")).toContainText("₹3,000.00");
    await expect(page.getByTestId("wallet-paid-amount")).toContainText("₹2,000.00");
  });

  test("shows transaction history in correct order (newest first)", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 2000, 2000, 0);

    // Create transactions with different dates
    createTransaction(walletId, "COMMISSION", 1000, "Commission L1 MB-001", 2);
    createTransaction(walletId, "COMMISSION", 1000, "Commission L1 MB-002", 0);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("transactions-list")).toBeVisible();

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);

    // Newest should be first
    const firstDesc = rows.nth(0).locator("td:nth-child(2)");
    await expect(firstDesc).toContainText("MB-002");
    const secondDesc = rows.nth(1).locator("td:nth-child(2)");
    await expect(secondDesc).toContainText("MB-001");
  });

  test("empty state shows when no transactions", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("transactions-empty")).toBeVisible();
    await expect(page.getByTestId("transactions-empty")).toContainText("No transactions yet");
  });

  test("filter by type: COMMISSION only", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 1500, 500, 0);

    createTransaction(walletId, "COMMISSION", 1000, "Commission L1 MB-100");
    createTransaction(walletId, "ADJUSTMENT", 500, "Credit adjustment: bonus");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("transactions-list")).toBeVisible();

    // Initially 2 transactions
    await expect(page.locator("tbody tr")).toHaveCount(2);

    // Filter to COMMISSION only
    await page.getByTestId("wallet-type-filter").selectOption("COMMISSION");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first().locator("td:nth-child(2)")).toContainText("MB-100");
  });

  test("filter by type: PAYOUT only", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 1000, 0, 1000);

    createTransaction(walletId, "COMMISSION", 1000, "Commission L1 MB-200");
    createTransaction(walletId, "PAYOUT", -1000, "Payout of 1000");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("transactions-list")).toBeVisible();

    await page.getByTestId("wallet-type-filter").selectOption("PAYOUT");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first().locator("td:nth-child(2)")).toContainText("Payout");
  });

  test("filter by date range", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 2000, 2000, 0);

    // Create old and recent transactions
    createTransaction(walletId, "COMMISSION", 1000, "Old commission", 30);
    createTransaction(walletId, "COMMISSION", 1000, "Recent commission", 0);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("transactions-list")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(2);

    // Filter to only recent (last 7 days)
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    await page.getByTestId("wallet-date-from").fill(weekAgo);
    await page.getByTestId("wallet-date-to").fill(today);

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first().locator("td:nth-child(2)")).toContainText("Recent commission");
  });

  test("clear filters resets all filters", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 2000, 2000, 0);

    createTransaction(walletId, "COMMISSION", 1000, "Comm 1");
    createTransaction(walletId, "ADJUSTMENT", 1000, "Adj 1");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.locator("tbody tr")).toHaveCount(2);

    // Apply type filter
    await page.getByTestId("wallet-type-filter").selectOption("COMMISSION");
    await expect(page.locator("tbody tr")).toHaveCount(1);

    // Clear
    await page.getByTestId("wallet-clear-filters").click();
    await expect(page.locator("tbody tr")).toHaveCount(2);
  });

  test("pagination works when many transactions", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 12000, 12000, 0);

    // Create 12 transactions (page size = 10)
    for (let i = 1; i <= 12; i++) {
      createTransaction(walletId, "COMMISSION", 1000, `Comm-${String(i).padStart(2, "0")}`, 12 - i);
    }

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("transactions-list")).toBeVisible();

    // Page 1: 10 transactions
    await expect(page.locator("tbody tr")).toHaveCount(10);
    await expect(page.getByTestId("wallet-pagination")).toBeVisible();
    await expect(page.getByTestId("wallet-pagination-info")).toContainText("1–10");
    await expect(page.getByTestId("wallet-pagination-info")).toContainText("of 12");
    await expect(page.getByTestId("wallet-page-info")).toContainText("1 / 2");

    // Go to page 2
    await page.getByTestId("wallet-next-page").click();
    await expect(page.locator("tbody tr")).toHaveCount(2);
    await expect(page.getByTestId("wallet-page-info")).toContainText("2 / 2");

    // Go back
    await page.getByTestId("wallet-prev-page").click();
    await expect(page.locator("tbody tr")).toHaveCount(10);
    await expect(page.getByTestId("wallet-page-info")).toContainText("1 / 2");
  });

  test("no filtered results shows correct message", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 1000, 1000, 0);

    createTransaction(walletId, "COMMISSION", 1000, "Some commission");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");

    // Filter to PAYOUT (none exist)
    await page.getByTestId("wallet-type-filter").selectOption("PAYOUT");
    await expect(page.getByTestId("transactions-empty")).toBeVisible();
    await expect(page.getByTestId("transactions-empty")).toContainText("No transactions match");
  });

  test("transaction type badges show correct colors", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 1000, 1000, 0);

    createTransaction(walletId, "COMMISSION", 1000, "Test commission");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");

    const badge = page.locator("tbody tr").first().locator("span.rounded-full");
    await expect(badge).toContainText("Commission");
    await expect(badge).toHaveClass(/bg-green-100/);
  });

  test("negative amounts show in red", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 0, -1000, 0);

    createTransaction(walletId, "COMMISSION_REVERSAL", -1000, "Reversal test");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");

    const amountCell = page.locator("tbody tr").first().locator("td:nth-child(3)");
    await expect(amountCell).toHaveClass(/text-red-600/);
  });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN WALLET MANAGEMENT TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Admin Wallet Management", () => {
  test.beforeEach(async () => {
    resetTestData();
    cleanWalletData();
    await resetRateLimiter();
  });

  test("admin sees all member wallets with correct balances", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);
    // Verify SQL took effect
    const check = dbQuery(`SELECT total_earned FROM wallets WHERE user_id='${rootId}'`);
    expect(parseFloat(check)).toBe(5000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("wallets-table")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("admin-wallets-title")).toContainText("Wallet Management");

    // Root member wallet should be visible
    await expect(page.getByTestId(`wallet-row-${rootId}`)).toBeVisible();
    await expect(page.getByTestId(`wallet-member-name-${rootId}`)).toContainText("Rajesh Kumar");
    await expect(page.getByTestId(`wallet-earned-${rootId}`)).toContainText("₹5,000.00");
    await expect(page.getByTestId(`wallet-pending-${rootId}`)).toContainText("₹3,000.00");
    await expect(page.getByTestId(`wallet-paid-${rootId}`)).toContainText("₹2,000.00");
  });

  test("admin sees total pending payouts sum", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    const member2Id = ensureSecondMember();
    setWalletBalances(member2Id, 2000, 1500, 500);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();
    await expect(page.getByTestId("total-pending-amount")).toContainText("₹4,500.00");
  });

  test("admin search filters wallets by member name", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);
    const member2Id = ensureSecondMember();
    setWalletBalances(member2Id, 2000, 1500, 500);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();

    // Both visible initially
    await expect(page.getByTestId(`wallet-row-${rootId}`)).toBeVisible();
    await expect(page.getByTestId(`wallet-row-${member2Id}`)).toBeVisible();

    // Search for "Wallet Test"
    await page.getByTestId("wallets-search").fill("Wallet Test");
    // Wait for fetch
    await page.waitForTimeout(500);
    await expect(page.getByTestId(`wallet-row-${member2Id}`)).toBeVisible();
    await expect(page.getByTestId(`wallet-row-${rootId}`)).not.toBeVisible();
  });

  // ── Payout tests ──

  test("admin payout: valid amount processes correctly", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();

    await page.getByTestId(`payout-btn-${rootId}`).click();
    await expect(page.getByTestId("payout-modal")).toBeVisible();
    await expect(page.getByTestId("payout-modal-title")).toContainText("Process Payout");

    await page.getByTestId("payout-amount-input").fill("1000");
    await page.getByTestId("payout-confirm").click();

    // Modal should close
    await expect(page.getByTestId("payout-modal")).not.toBeVisible();

    // Balances updated: pending 3000→2000, paidOut 2000→3000
    await expect(page.getByTestId(`wallet-pending-${rootId}`)).toContainText("₹2,000.00");
    await expect(page.getByTestId(`wallet-paid-${rootId}`)).toContainText("₹3,000.00");
  });

  test("admin payout: exceeds pending balance shows error", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 1000, 4000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();

    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.getByTestId("payout-amount-input").fill("2000");
    await page.getByTestId("payout-confirm").click();

    await expect(page.getByTestId("payout-error")).toContainText("exceeds pending balance");
  });

  test("admin payout: zero amount shows error", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();

    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.getByTestId("payout-amount-input").fill("0");
    await page.getByTestId("payout-confirm").click();

    await expect(page.getByTestId("payout-error")).toContainText("greater than zero");
  });

  test("admin payout: cancel closes modal without changes", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();

    await page.getByTestId(`payout-btn-${rootId}`).click();
    await expect(page.getByTestId("payout-modal")).toBeVisible();
    await page.getByTestId("payout-cancel").click();
    await expect(page.getByTestId("payout-modal")).not.toBeVisible();

    // Balances unchanged
    await expect(page.getByTestId(`wallet-pending-${rootId}`)).toContainText("₹3,000.00");
  });

  // ── Adjustment tests ──

  test("admin adjustment credit: increases pending and total_earned", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 1000, 1000, 0);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();

    await page.getByTestId(`adjustment-btn-${rootId}`).click();
    await expect(page.getByTestId("adjustment-modal")).toBeVisible();

    // Default is credit
    await expect(page.getByTestId("adjustment-type-credit")).toBeChecked();
    await page.getByTestId("adjustment-amount-input").fill("500");
    await page.getByTestId("adjustment-reason-input").fill("Bonus reward");
    await page.getByTestId("adjustment-confirm").click();

    await expect(page.getByTestId("adjustment-modal")).not.toBeVisible();

    // total_earned: 1000→1500, pending: 1000→1500
    await expect(page.getByTestId(`wallet-earned-${rootId}`)).toContainText("₹1,500.00");
    await expect(page.getByTestId(`wallet-pending-${rootId}`)).toContainText("₹1,500.00");
  });

  test("admin adjustment debit: decreases pending and total_earned", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 2000, 2000, 0);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();

    await page.getByTestId(`adjustment-btn-${rootId}`).click();
    await page.getByTestId("adjustment-type-debit").click();
    await page.getByTestId("adjustment-amount-input").fill("500");
    await page.getByTestId("adjustment-reason-input").fill("Correction for error");
    await page.getByTestId("adjustment-confirm").click();

    await expect(page.getByTestId("adjustment-modal")).not.toBeVisible();

    // total_earned: 2000→1500, pending: 2000→1500
    await expect(page.getByTestId(`wallet-earned-${rootId}`)).toContainText("₹1,500.00");
    await expect(page.getByTestId(`wallet-pending-${rootId}`)).toContainText("₹1,500.00");
  });

  test("admin adjustment: empty reason shows error", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 1000, 1000, 0);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();

    await page.getByTestId(`adjustment-btn-${rootId}`).click();
    await page.getByTestId("adjustment-amount-input").fill("100");
    // Leave reason empty
    await page.getByTestId("adjustment-confirm").click();

    await expect(page.getByTestId("adjustment-error")).toContainText("Reason is required");
  });

  test("admin adjustment: zero amount shows error", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 1000, 1000, 0);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();

    await page.getByTestId(`adjustment-btn-${rootId}`).click();
    await page.getByTestId("adjustment-amount-input").fill("0");
    await page.getByTestId("adjustment-reason-input").fill("Some reason");
    await page.getByTestId("adjustment-confirm").click();

    await expect(page.getByTestId("adjustment-error")).toContainText("greater than zero");
  });

  // ── After payout/adjustment: member sees transaction ──

  test("after payout: member sees PAYOUT transaction in wallet", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    // Admin processes payout
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();
    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.getByTestId("payout-amount-input").fill("1000");
    await page.getByTestId("payout-confirm").click();
    await expect(page.getByTestId("payout-modal")).not.toBeVisible();

    // Clear admin session and login as member
    await page.context().clearCookies();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("transactions-list")).toBeVisible();

    // Should see PAYOUT transaction
    const firstRow = page.locator("tbody tr").first();
    const badge = firstRow.locator("span.rounded-full");
    await expect(badge).toContainText("Payout");
    await expect(badge).toHaveClass(/bg-blue-100/);
  });

  test("after adjustment: member sees ADJUSTMENT transaction in wallet", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 1000, 1000, 0);

    // Admin processes adjustment
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();
    await page.getByTestId(`adjustment-btn-${rootId}`).click();
    await page.getByTestId("adjustment-amount-input").fill("500");
    await page.getByTestId("adjustment-reason-input").fill("Bonus reward");
    await page.getByTestId("adjustment-confirm").click();
    await expect(page.getByTestId("adjustment-modal")).not.toBeVisible();

    // Clear admin session and login as member
    await page.context().clearCookies();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("transactions-list")).toBeVisible();

    const firstRow = page.locator("tbody tr").first();
    const badge = firstRow.locator("span.rounded-full");
    await expect(badge).toContainText("Adjustment");
    await expect(badge).toHaveClass(/bg-gray-100/);
    // Description includes reason
    await expect(firstRow.locator("td:nth-child(2)")).toContainText("Bonus reward");
  });

  // ── Notifications ──

  test("after payout: member receives notification", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    // Admin does payout
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();
    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.getByTestId("payout-amount-input").fill("1000");
    await page.getByTestId("payout-confirm").click();
    await expect(page.getByTestId("payout-modal")).not.toBeVisible();

    // Check notification in DB
    const notif = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${rootId}' ORDER BY created_at DESC LIMIT 1`
    );
    expect(notif).toContain("Payout");
    expect(notif).toContain("1000");
  });

  test("after adjustment: member receives notification", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 1000, 1000, 0);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();
    await page.getByTestId(`adjustment-btn-${rootId}`).click();
    await page.getByTestId("adjustment-amount-input").fill("300");
    await page.getByTestId("adjustment-reason-input").fill("Promo bonus");
    await page.getByTestId("adjustment-confirm").click();
    await expect(page.getByTestId("adjustment-modal")).not.toBeVisible();

    const notif = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${rootId}' ORDER BY created_at DESC LIMIT 1`
    );
    expect(notif).toContain("credited");
    expect(notif).toContain("300");
  });

  // ── Audit logs ──

  test("audit log: payout entry exists", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 5000, 3000, 2000);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();
    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.getByTestId("payout-amount-input").fill("1000");
    await page.getByTestId("payout-confirm").click();
    await expect(page.getByTestId("payout-modal")).not.toBeVisible();

    const audit = dbQuery(
      "SELECT action FROM audit_logs WHERE action='PAYOUT_PROCESSED' ORDER BY created_at DESC LIMIT 1"
    );
    expect(audit).toBe("PAYOUT_PROCESSED");
  });

  test("audit log: adjustment entry exists", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 1000, 1000, 0);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();
    await page.getByTestId(`adjustment-btn-${rootId}`).click();
    await page.getByTestId("adjustment-amount-input").fill("200");
    await page.getByTestId("adjustment-reason-input").fill("Testing audit");
    await page.getByTestId("adjustment-confirm").click();
    await expect(page.getByTestId("adjustment-modal")).not.toBeVisible();

    const audit = dbQuery(
      "SELECT action FROM audit_logs WHERE action='WALLET_CREDIT_ADJUSTMENT' ORDER BY created_at DESC LIMIT 1"
    );
    expect(audit).toBe("WALLET_CREDIT_ADJUSTMENT");
  });

  test("audit log: debit adjustment entry exists", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 2000, 2000, 0);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();
    await page.getByTestId(`adjustment-btn-${rootId}`).click();
    await page.getByTestId("adjustment-type-debit").click();
    await page.getByTestId("adjustment-amount-input").fill("300");
    await page.getByTestId("adjustment-reason-input").fill("Correction");
    await page.getByTestId("adjustment-confirm").click();
    await expect(page.getByTestId("adjustment-modal")).not.toBeVisible();

    const audit = dbQuery(
      "SELECT action FROM audit_logs WHERE action='WALLET_DEBIT_ADJUSTMENT' ORDER BY created_at DESC LIMIT 1"
    );
    expect(audit).toBe("WALLET_DEBIT_ADJUSTMENT");
  });

  // ── Wallet invariant ──

  test("wallet invariant: total_earned = pending + paid_out after multiple operations", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 10000, 10000, 0);

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();

    // Payout 3000
    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.getByTestId("payout-amount-input").fill("3000");
    await page.getByTestId("payout-confirm").click();
    await expect(page.getByTestId("payout-modal")).not.toBeVisible();

    // Credit adjustment 500
    await page.getByTestId(`adjustment-btn-${rootId}`).click();
    await page.getByTestId("adjustment-amount-input").fill("500");
    await page.getByTestId("adjustment-reason-input").fill("Bonus");
    await page.getByTestId("adjustment-confirm").click();
    await expect(page.getByTestId("adjustment-modal")).not.toBeVisible();

    // Payout another 2000
    await page.getByTestId(`payout-btn-${rootId}`).click();
    await page.getByTestId("payout-amount-input").fill("2000");
    await page.getByTestId("payout-confirm").click();
    await expect(page.getByTestId("payout-modal")).not.toBeVisible();

    // Verify invariant in DB
    const row = dbQuery(`SELECT total_earned, pending, paid_out FROM wallets WHERE user_id='${rootId}'`);
    const [totalEarned, pending, paidOut] = row.split("|").map(Number);
    // total_earned should equal pending + paid_out
    expect(totalEarned).toBe(pending + paidOut);

    // Expected: total_earned = 10500 (10000 + 500 credit adj)
    //           paid_out = 5000 (3000 + 2000)
    //           pending = 5500 (10000 - 3000 + 500 - 2000)
    expect(totalEarned).toBe(10500);
    expect(paidOut).toBe(5000);
    expect(pending).toBe(5500);
  });
});

// ═══════════════════════════════════════════════════════════════
// HINDI & RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Wallet - Hindi & Responsive", () => {
  test.beforeEach(async () => {
    resetTestData();
    cleanWalletData();
    await resetRateLimiter();
  });

  test("Hindi: wallet page shows Hindi text when language is Hindi", async ({ page }) => {
    const rootId = getRootMemberId();
    // Set user to Hindi
    dbQuery(`UPDATE users SET "preferredLanguage"='hi' WHERE email='root@artilligence.com'`);
    setWalletBalances(rootId, 1000, 1000, 0);
    const walletId = getRootWalletId();
    createTransaction(walletId, "COMMISSION", 1000, "Test commission");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");

    await expect(page.getByTestId("wallet-title")).toContainText("वॉलेट");
    await expect(page.getByTestId("transactions-title")).toContainText("लेनदेन इतिहास");

    // Type filter label should be Hindi
    const filterLabel = page.locator("label", { hasText: "प्रकार" });
    await expect(filterLabel).toBeVisible();
  });

  test("Mobile: wallet cards stack vertically on small screens", async ({ page }) => {
    const rootId = getRootMemberId();
    setWalletBalances(rootId, 1000, 1000, 0);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");
    await expect(page.getByTestId("wallet-page")).toBeVisible();
    await expect(page.getByTestId("wallet-total-card")).toBeVisible();
    await expect(page.getByTestId("wallet-pending-card")).toBeVisible();
    await expect(page.getByTestId("wallet-paid-card")).toBeVisible();

    // On mobile, cards should stack (grid-cols-1)
    const summary = page.getByTestId("wallet-summary");
    const box = await summary.boundingBox();
    expect(box).toBeTruthy();
    // Cards should be stacked, so height > width roughly (or at least visible)
    const totalCard = await page.getByTestId("wallet-total-card").boundingBox();
    const pendingCard = await page.getByTestId("wallet-pending-card").boundingBox();
    expect(totalCard).toBeTruthy();
    expect(pendingCard).toBeTruthy();
    // Pending card top should be below total card bottom (stacked)
    expect(pendingCard!.y).toBeGreaterThan(totalCard!.y + totalCard!.height - 5);
  });

  test("Mobile: transactions render as cards", async ({ page }) => {
    const rootId = getRootMemberId();
    const walletId = getRootWalletId();
    setWalletBalances(rootId, 3000, 3000, 0);

    createTransaction(walletId, "COMMISSION", 1000, "Commission for a very long description test");
    createTransaction(walletId, "COMMISSION", 1000, "Another commission transaction");
    createTransaction(walletId, "ADJUSTMENT", 1000, "Credit adjustment with long reason");

    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.goto("/dashboard/wallet");

    // Desktop table should be hidden on mobile
    const desktopTable = page.getByTestId("transactions-list");
    await expect(desktopTable).toBeHidden();

    // Mobile cards should be visible
    const mobileCards = page.getByTestId("transactions-cards");
    await expect(mobileCards).toBeVisible();
    // Should have 3 transaction cards
    const cards = mobileCards.locator('[data-testid^="transaction-card-"]');
    await expect(cards).toHaveCount(3);
  });

  test("admin wallets page nav link visible", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("/admin");

    const walletNav = page.getByTestId("nav-wallet");
    await expect(walletNav).toBeVisible();
    await expect(walletNav).toContainText("Wallets");

    await walletNav.click();
    await page.waitForURL("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible();
  });
});
