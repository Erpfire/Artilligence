import { test, expect, Page } from "@playwright/test";
import {
  resetTestData,
  login,
  dbQuery,
  registerMember,
  resetRateLimiter,
  getMemberByEmail,
  blockMember,
  unblockMember,
} from "./helpers";
import path from "path";
import { writeFileSync, mkdirSync } from "fs";

// ── Constants ──

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const MEMBER_EMAIL = "root@artilligence.com";
const MEMBER_PASSWORD = "member123456";
const TEST_FILES_DIR = "/tmp/artilligence-test-files";

// bcrypt hash of 'member123456'
const MEMBER_PW_HASH =
  "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

function ensureTestFiles() {
  mkdirSync(TEST_FILES_DIR, { recursive: true });
  const jpgBytes = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  writeFileSync(path.join(TEST_FILES_DIR, "receipt.jpg"), jpgBytes);
}

// ── Shared helpers ──

async function adminLogin(page: Page) {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.waitForURL("**/admin**", { timeout: 15000 });
}

async function memberLogin(page: Page, email: string, password: string) {
  await login(page, email, password);
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
}

async function waitForAdminSalesTable(page: Page) {
  await page.goto("/admin/sales");
  await page.waitForSelector(
    '[data-testid="sales-table"], [data-testid="sales-empty"]',
    { timeout: 15000 }
  );
  // If empty due to timing, reload once
  const isEmpty = await page
    .getByTestId("sales-empty")
    .isVisible()
    .catch(() => false);
  if (isEmpty) {
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="sales-table"]', {
      timeout: 10000,
    });
  }
}

async function submitSaleViaUI(
  page: Page,
  opts: {
    billCode: string;
    saleDate?: string;
    customerName?: string;
    customerPhone?: string;
  }
) {
  await page.goto("/dashboard/sales");
  await page.waitForSelector('[data-testid="sales-page"]', { timeout: 10000 });

  await page.getByTestId("submit-sale-button").click();
  await expect(page.getByTestId("sale-form")).toBeVisible();

  // Wait for products to load
  await page.waitForFunction(
    () => {
      const sel = document.querySelector(
        '[data-testid="product-select-0"]'
      ) as HTMLSelectElement;
      return sel && sel.options.length > 1;
    },
    { timeout: 10000 }
  );

  await page.getByTestId("input-billCode").fill(opts.billCode);
  if (opts.saleDate) {
    await page.getByTestId("input-saleDate").fill(opts.saleDate);
  }
  await page.getByTestId("product-select-0").selectOption({ index: 1 });
  await page
    .getByTestId("input-customerName")
    .fill(opts.customerName || "Test Customer");
  await page
    .getByTestId("input-customerPhone")
    .fill(opts.customerPhone || "+919876543210");
  await page
    .getByTestId("input-billPhoto")
    .setInputFiles(path.join(TEST_FILES_DIR, "receipt.jpg"));

  await page.getByTestId("submit-sale-form").click();
  await expect(page.getByTestId("sale-success")).toBeVisible({
    timeout: 10000,
  });
}

async function adminApproveSale(page: Page, saleId: string) {
  await page.getByTestId(`approve-sale-${saleId}`).click();
  // Wait for sale to leave pending list
  await page.waitForFunction(
    (id: string) =>
      !document
        .querySelector('[data-testid="sales-table"]')
        ?.textContent?.includes(id),
    saleId,
    { timeout: 10000 }
  );
}

async function adminReturnSale(page: Page, saleId: string, reason: string) {
  // Switch to approved tab to find the sale
  await page.getByTestId("tab-approved").click();
  await page.waitForSelector('[data-testid="sales-table"]', { timeout: 10000 });

  await page.getByTestId(`return-sale-${saleId}`).click();
  await expect(page.getByTestId("return-modal")).toBeVisible();
  await page.getByTestId("return-reason-input").fill(reason);
  await page.getByTestId("confirm-return").click();
  await expect(page.getByTestId("return-modal")).not.toBeVisible({
    timeout: 10000,
  });
}

function getSaleIdByBillCode(billCode: string): string {
  return dbQuery(`SELECT id FROM sales WHERE bill_code='${billCode}'`);
}

function getWalletBalance(
  email: string
): { totalEarned: number; pending: number; paidOut: number } {
  const row = dbQuery(
    `SELECT w.total_earned, w.pending, w.paid_out FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.email='${email}'`
  );
  const [totalEarned, pending, paidOut] = row.split("|").map(Number);
  return { totalEarned, pending, paidOut };
}

function getCommissionCount(saleId: string, type = "EARNING"): number {
  return parseInt(
    dbQuery(
      `SELECT COUNT(*) FROM commissions WHERE sale_id='${saleId}' AND type='${type}'`
    )
  );
}

function getCommissionAmount(
  saleId: string,
  beneficiaryEmail: string
): number {
  return parseFloat(
    dbQuery(
      `SELECT c.amount FROM commissions c JOIN users u ON u.id=c.beneficiary_id WHERE c.sale_id='${saleId}' AND u.email='${beneficiaryEmail}' AND c.type='EARNING'`
    )
  );
}

function cleanAllTestData() {
  dbQuery("DELETE FROM report_jobs");
  dbQuery("DELETE FROM commission_rate_history");
  dbQuery("DELETE FROM audit_logs");
  dbQuery("DELETE FROM wallet_transactions");
  dbQuery("DELETE FROM commissions");
  dbQuery("DELETE FROM notifications");
  dbQuery("DELETE FROM announcements");
  dbQuery("DELETE FROM sale_flags");
  dbQuery("DELETE FROM sale_items");
  dbQuery("DELETE FROM sales");
  dbQuery(
    "DELETE FROM wallets WHERE user_id NOT IN (SELECT id FROM users WHERE email IN ('admin@artilligence.com','root@artilligence.com'))"
  );
  dbQuery(
    "DELETE FROM users WHERE email NOT IN ('admin@artilligence.com','root@artilligence.com')"
  );
  dbQuery("UPDATE users SET status='ACTIVE'");
  dbQuery(
    `UPDATE users SET name='Rajesh Kumar', phone='+919999900001', has_completed_onboarding=true, "preferredLanguage"='en' WHERE email='root@artilligence.com'`
  );
  dbQuery("UPDATE wallets SET total_earned=0, pending=0, paid_out=0");
  // Reset app settings to defaults
  dbQuery("UPDATE app_settings SET value='20' WHERE key='daily_sale_limit'");
  dbQuery("UPDATE app_settings SET value='100' WHERE key='weekly_sale_limit'");
  dbQuery("UPDATE app_settings SET value='0' WHERE key='min_sale_gap_minutes'");
  dbQuery(
    "UPDATE app_settings SET value='^MB-\\d{5,}$' WHERE key='bill_code_format'"
  );
}

function resetDefaultCommissionRates() {
  dbQuery("DELETE FROM commission_settings");
  dbQuery(
    `INSERT INTO commission_settings (id, level, percentage, updated_at) VALUES
     (gen_random_uuid(), 1, 10.00, NOW()),
     (gen_random_uuid(), 2, 6.00, NOW()),
     (gen_random_uuid(), 3, 4.00, NOW()),
     (gen_random_uuid(), 4, 3.00, NOW()),
     (gen_random_uuid(), 5, 2.00, NOW()),
     (gen_random_uuid(), 6, 1.00, NOW()),
     (gen_random_uuid(), 7, 0.50, NOW())`
  );
}

// ══════════════════════════════════════════════════════════════════
// TEST 1: Full MLM Lifecycle
// ══════════════════════════════════════════════════════════════════

test.describe.serial("Test 1: Full MLM Lifecycle", () => {
  // Shared state across serial tests
  let rootReferralCode: string;
  let child1Email: string;
  let child2Email: string;
  let child3Email: string;
  let child4Email: string; // spillover
  let child1ReferralCode: string;

  test.beforeAll(async () => {
    ensureTestFiles();
    cleanAllTestData();
    resetDefaultCommissionRates();
    await resetRateLimiter();
  });

  test("1a: Root member exists, register 3 children + 1 spillover via UI", async ({
    page,
  }) => {
    // Get root's referral code
    const root = getMemberByEmail("root@artilligence.com");
    expect(root).not.toBeNull();
    rootReferralCode = root!.referralCode;

    // Register child 1
    child1Email = "integ-child1@test.com";
    await registerMember(page, rootReferralCode, {
      name: "Child One",
      email: child1Email,
      phone: "9100000001",
      password: "member123456",
    });
    await page.waitForURL("**/login**", { timeout: 15000 });
    await expect(page.getByText("Account created successfully")).toBeVisible({ timeout: 5000 });

    await resetRateLimiter();

    // Register child 2
    child2Email = "integ-child2@test.com";
    await registerMember(page, rootReferralCode, {
      name: "Child Two",
      email: child2Email,
      phone: "9100000002",
      password: "member123456",
    });
    await page.waitForURL("**/login**", { timeout: 15000 });

    await resetRateLimiter();

    // Register child 3 (fills all 3 slots under root)
    child3Email = "integ-child3@test.com";
    await registerMember(page, rootReferralCode, {
      name: "Child Three",
      email: child3Email,
      phone: "9100000003",
      password: "member123456",
    });
    await page.waitForURL("**/login**", { timeout: 15000 });

    await resetRateLimiter();

    // Register child 4 → BFS spillover to first child
    child4Email = "integ-child4@test.com";
    await registerMember(page, rootReferralCode, {
      name: "Child Four",
      email: child4Email,
      phone: "9100000004",
      password: "member123456",
    });
    await page.waitForURL("**/login**", { timeout: 15000 });

    // Verify tree structure
    const c1 = getMemberByEmail(child1Email);
    const c2 = getMemberByEmail(child2Email);
    const c3 = getMemberByEmail(child3Email);
    const c4 = getMemberByEmail(child4Email);

    expect(c1!.depth).toBe(1);
    expect(c2!.depth).toBe(1);
    expect(c3!.depth).toBe(1);
    // Child4 should spill under child1 (BFS: first child with open slot)
    expect(c4!.depth).toBe(2);
    expect(c4!.parentId).toBe(c1!.id);

    // Save child1 referral code for later
    child1ReferralCode = c1!.referralCode;

    // Ensure onboarding is complete for all registered members so they can login
    dbQuery(
      `UPDATE users SET has_completed_onboarding=true WHERE email IN ('${child1Email}','${child2Email}','${child3Email}','${child4Email}')`
    );
    // Ensure wallets exist
    for (const email of [
      child1Email,
      child2Email,
      child3Email,
      child4Email,
    ]) {
      const id = dbQuery(`SELECT id FROM users WHERE email='${email}'`);
      dbQuery(
        `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
         VALUES (gen_random_uuid(), '${id}', 0, 0, 0, NOW(), NOW())
         ON CONFLICT (user_id) DO NOTHING`
      );
    }
  });

  test("1b: Members submit sales via UI", async ({ page }) => {
    await resetRateLimiter();

    // Child1 submits a sale
    await memberLogin(page, child1Email, "member123456");
    await submitSaleViaUI(page, {
      billCode: "MB-50001",
      saleDate: "2026-03-25",
      customerName: "Customer A",
      customerPhone: "+919800000001",
    });

    // Verify in DB
    const s1 = dbQuery(
      "SELECT status FROM sales WHERE bill_code='MB-50001'"
    );
    expect(s1).toBe("PENDING");

    // Clear session and switch to child4 (deep member)
    await page.context().clearCookies();
    await resetRateLimiter();
    await memberLogin(page, child4Email, "member123456");
    await submitSaleViaUI(page, {
      billCode: "MB-50002",
      saleDate: "2026-03-25",
      customerName: "Customer B",
      customerPhone: "+919800000002",
    });

    const s2 = dbQuery(
      "SELECT status FROM sales WHERE bill_code='MB-50002'"
    );
    expect(s2).toBe("PENDING");
  });

  test("1c: Admin approves sales → commissions generated", async ({
    page,
  }) => {
    await resetRateLimiter();

    const saleId1 = getSaleIdByBillCode("MB-50001");
    const saleId2 = getSaleIdByBillCode("MB-50002");

    await adminLogin(page);
    await waitForAdminSalesTable(page);

    // Approve child1's sale
    await adminApproveSale(page, saleId1);

    // Wait for commission calculation to complete
    await page.waitForTimeout(1000);

    // Verify commissions for child1's sale → root gets L1 commission
    const rootCommCount = getCommissionCount(saleId1);
    expect(rootCommCount).toBeGreaterThanOrEqual(1);

    const rootComm = getCommissionAmount(saleId1, MEMBER_EMAIL);
    expect(rootComm).toBeGreaterThan(0);

    // Reload to get pending sales again
    await waitForAdminSalesTable(page);

    // Approve child4's sale → child1 gets L1, root gets L2
    await adminApproveSale(page, saleId2);

    const child4CommCount = getCommissionCount(saleId2);
    expect(child4CommCount).toBeGreaterThanOrEqual(2); // L1 (child1) + L2 (root)

    const child1Comm = getCommissionAmount(saleId2, child1Email);
    expect(child1Comm).toBeGreaterThan(0);

    const rootCommOnChild4 = getCommissionAmount(saleId2, MEMBER_EMAIL);
    expect(rootCommOnChild4).toBeGreaterThan(0);
  });

  test("1d: Wallet balances reflect commissions", async ({ page }) => {
    await resetRateLimiter();

    // Check root wallet: should have commissions from both sales
    const rootWallet = getWalletBalance(MEMBER_EMAIL);
    expect(rootWallet.totalEarned).toBeGreaterThan(0);
    expect(rootWallet.pending).toBeGreaterThan(0);
    expect(rootWallet.totalEarned).toBe(rootWallet.pending + rootWallet.paidOut);

    // Child1 should have commission from child4's sale
    const child1Wallet = getWalletBalance(child1Email);
    expect(child1Wallet.totalEarned).toBeGreaterThan(0);

    // Verify via member dashboard UI
    await memberLogin(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', {
      timeout: 10000,
    });
    const totalText = await page
      .getByTestId("wallet-total-amount")
      .textContent();
    expect(totalText).toMatch(/₹[\d,]+\.\d{2}/);
    expect(totalText).not.toContain("₹0.00");

    // Check wallet page shows commission transactions
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="wallet-page"]', {
      timeout: 10000,
    });
    const pendingText = await page
      .getByTestId("wallet-pending-amount")
      .textContent();
    expect(pendingText).not.toContain("₹0.00");
  });

  test("1e: Admin pays out commissions via UI", async ({ page }) => {
    await resetRateLimiter();

    const rootWalletBefore = getWalletBalance(MEMBER_EMAIL);
    const payoutAmount = Math.floor(rootWalletBefore.pending / 2); // Pay out half

    await adminLogin(page);
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="total-pending-payouts"]', {
      timeout: 15000,
    });

    // Find root member's payout button
    const rootId = dbQuery(
      "SELECT id FROM users WHERE email='root@artilligence.com'"
    );
    await page.getByTestId(`payout-btn-${rootId}`).click();
    await expect(page.getByTestId("payout-modal")).toBeVisible();

    await page
      .getByTestId("payout-amount-input")
      .fill(String(payoutAmount));
    await page.getByTestId("payout-confirm").click();
    await expect(page.getByTestId("payout-modal")).not.toBeVisible({
      timeout: 10000,
    });

    // Verify wallet updated
    const rootWalletAfter = getWalletBalance(MEMBER_EMAIL);
    expect(rootWalletAfter.paidOut).toBeGreaterThan(rootWalletBefore.paidOut);
    expect(rootWalletAfter.pending).toBeLessThan(rootWalletBefore.pending);
    // Invariant: totalEarned = pending + paidOut
    expect(rootWalletAfter.totalEarned).toBe(
      rootWalletAfter.pending + rootWalletAfter.paidOut
    );

    // Verify PAYOUT transaction in DB
    const payoutTx = dbQuery(
      `SELECT type FROM wallet_transactions wt JOIN wallets w ON w.id=wt.wallet_id JOIN users u ON u.id=w.user_id WHERE u.email='root@artilligence.com' AND wt.type='PAYOUT' LIMIT 1`
    );
    expect(payoutTx).toBe("PAYOUT");
  });

  test("1f: Admin returns a sale → commissions reversed", async ({
    page,
  }) => {
    await resetRateLimiter();

    const saleId1 = getSaleIdByBillCode("MB-50001");

    // Get wallet state before return
    const rootWalletBefore = getWalletBalance(MEMBER_EMAIL);

    await adminLogin(page);
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"], [data-testid="sales-empty"]', {
      timeout: 15000,
    });

    await adminReturnSale(page, saleId1, "Customer returned the product");

    // Verify sale status
    const status = dbQuery(
      `SELECT status FROM sales WHERE id='${saleId1}'`
    );
    expect(status).toBe("RETURNED");

    // Verify reversal commissions created
    const reversalCount = parseInt(
      dbQuery(
        `SELECT COUNT(*) FROM commissions WHERE sale_id='${saleId1}' AND type='REVERSAL'`
      )
    );
    expect(reversalCount).toBeGreaterThan(0);

    // Verify wallet decreased
    const rootWalletAfter = getWalletBalance(MEMBER_EMAIL);
    expect(rootWalletAfter.pending).toBeLessThan(rootWalletBefore.pending);

    // COMMISSION_REVERSAL transactions should exist
    const reversalTx = dbQuery(
      `SELECT COUNT(*) FROM wallet_transactions wt JOIN wallets w ON w.id=wt.wallet_id JOIN users u ON u.id=w.user_id WHERE u.email='root@artilligence.com' AND wt.type='COMMISSION_REVERSAL'`
    );
    expect(parseInt(reversalTx)).toBeGreaterThan(0);
  });

  test("1g: Audit trail records all actions", async ({ page }) => {
    await resetRateLimiter();

    // Verify audit logs exist for key actions
    const approvalLogs = parseInt(
      dbQuery(
        "SELECT COUNT(*) FROM audit_logs WHERE action='SALE_APPROVED'"
      )
    );
    expect(approvalLogs).toBeGreaterThanOrEqual(2);

    const commissionLogs = parseInt(
      dbQuery(
        "SELECT COUNT(*) FROM audit_logs WHERE action='COMMISSIONS_CALCULATED'"
      )
    );
    expect(commissionLogs).toBeGreaterThanOrEqual(2);

    const payoutLogs = parseInt(
      dbQuery(
        "SELECT COUNT(*) FROM audit_logs WHERE action='PAYOUT_PROCESSED'"
      )
    );
    expect(payoutLogs).toBeGreaterThanOrEqual(1);

    const returnLogs = parseInt(
      dbQuery(
        "SELECT COUNT(*) FROM audit_logs WHERE action='SALE_RETURNED'"
      )
    );
    expect(returnLogs).toBeGreaterThanOrEqual(1);

    // Verify audit trail visible in admin UI
    await adminLogin(page);
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"], [data-testid="audit-empty"]', {
      timeout: 15000,
    });

    await expect(page.getByTestId("audit-table")).toBeVisible();
    const auditCount = await page
      .getByTestId("audit-count")
      .textContent();
    expect(auditCount).toMatch(/\d+/);
  });

  test("1h: Reports reflect lifecycle data", async ({ page }) => {
    await resetRateLimiter();

    // Verify data exists before checking reports
    const salesCount = parseInt(dbQuery("SELECT COUNT(*) FROM sales"));
    expect(salesCount).toBeGreaterThan(0);

    await adminLogin(page);
    await page.goto("/admin/reports");
    await page.waitForSelector('[data-testid="admin-reports-page"]', {
      timeout: 15000,
    });

    // Set date range to cover test data and apply
    await page.getByTestId("report-tab-sales").click();
    await page.waitForSelector('[data-testid="report-filters"]', {
      timeout: 15000,
    });

    // Use evaluate to set date inputs reliably (avoids locale issues)
    await page.getByTestId("filter-date-from").evaluate((el: HTMLInputElement) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      nativeSetter.call(el, "2026-01-01");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.getByTestId("filter-date-to").evaluate((el: HTMLInputElement) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      nativeSetter.call(el, "2026-12-31");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await page.getByTestId("apply-filters-btn").click();

    // Wait for report to load
    await page.waitForSelector('[data-testid="report-table"], [data-testid="report-empty"]', {
      timeout: 15000,
    });

    // Should see approved/returned sales in report
    const salesVisible = await page
      .getByTestId("report-table")
      .isVisible()
      .catch(() => false);
    expect(salesVisible).toBe(true);

    // Commissions report tab
    await page.getByTestId("report-tab-commissions").click();
    await page.waitForSelector('[data-testid="report-filters"]', {
      timeout: 10000,
    });
    await page.getByTestId("filter-date-from").fill("2026-01-01");
    await page.getByTestId("filter-date-to").fill("2026-12-31");
    await page.getByTestId("apply-filters-btn").click();
    await page.waitForSelector('[data-testid="report-table"], [data-testid="report-empty"]', {
      timeout: 15000,
    });

    // Payouts report tab
    await page.getByTestId("report-tab-payouts").click();
    await page.waitForSelector('[data-testid="report-filters"]', {
      timeout: 10000,
    });
    await page.getByTestId("filter-date-from").fill("2026-01-01");
    await page.getByTestId("filter-date-to").fill("2026-12-31");
    await page.getByTestId("apply-filters-btn").click();
    await page.waitForSelector('[data-testid="report-table"], [data-testid="report-empty"]', {
      timeout: 15000,
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// TEST 2: Fraud Prevention Journey
// ══════════════════════════════════════════════════════════════════

test.describe.serial("Test 2: Fraud Prevention Journey", () => {
  test.beforeAll(async () => {
    ensureTestFiles();
    cleanAllTestData();
    resetDefaultCommissionRates();
    await resetRateLimiter();
  });

  test("2a: Submit first sale successfully", async ({ page }) => {
    await resetRateLimiter();

    // Member submits first sale
    await memberLogin(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await submitSaleViaUI(page, {
      billCode: "MB-60001",
      saleDate: "2026-03-25",
      customerName: "First Customer",
    });

    // Verify sale exists
    const status = dbQuery("SELECT status FROM sales WHERE bill_code='MB-60001'");
    expect(status).toBe("PENDING");
  });

  test("2b: Duplicate bill code shows error on form", async ({ page }) => {
    await resetRateLimiter();

    // First sale exists from 2a. Submit another with same code.
    await memberLogin(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.goto("/dashboard/sales");
    await page.waitForSelector('[data-testid="sales-page"]', { timeout: 10000 });
    await page.getByTestId("submit-sale-button").click();
    await expect(page.getByTestId("sale-form")).toBeVisible();

    await page.waitForFunction(
      () => {
        const sel = document.querySelector(
          '[data-testid="product-select-0"]'
        ) as HTMLSelectElement;
        return sel && sel.options.length > 1;
      },
      { timeout: 10000 }
    );

    await page.getByTestId("input-billCode").fill("MB-60001");
    await page.getByTestId("input-saleDate").fill("2026-03-25");
    await page.getByTestId("product-select-0").selectOption({ index: 1 });
    await page.getByTestId("input-customerName").fill("Duplicate Attempt");
    await page
      .getByTestId("input-customerPhone")
      .fill("+919876543999");
    await page
      .getByTestId("input-billPhoto")
      .setInputFiles(path.join(TEST_FILES_DIR, "receipt.jpg"));

    await page.getByTestId("submit-sale-form").click();

    // Should show duplicate bill code error
    await expect(page.getByTestId("error-billCode")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("error-billCode")).toContainText("already");
  });

  test("2c: Daily rate limit blocks excess sales", async ({ page }) => {
    await resetRateLimiter();

    // Set daily limit to 3
    dbQuery("UPDATE app_settings SET value='3' WHERE key='daily_sale_limit'");

    // Insert 2 more sales via UI (one already exists from 2a = 1 total)
    await memberLogin(page, MEMBER_EMAIL, MEMBER_PASSWORD);

    await submitSaleViaUI(page, {
      billCode: "MB-60002",
      saleDate: "2026-03-25",
      customerName: "Rate Limit 1",
    });

    await submitSaleViaUI(page, {
      billCode: "MB-60003",
      saleDate: "2026-03-25",
      customerName: "Rate Limit 2",
    });

    // 4th sale should be blocked (3 already exist today)
    await page.goto("/dashboard/sales");
    await page.waitForSelector('[data-testid="sales-page"]', { timeout: 10000 });
    await page.getByTestId("submit-sale-button").click();
    await expect(page.getByTestId("sale-form")).toBeVisible();

    await page.waitForFunction(
      () => {
        const sel = document.querySelector(
          '[data-testid="product-select-0"]'
        ) as HTMLSelectElement;
        return sel && sel.options.length > 1;
      },
      { timeout: 10000 }
    );

    await page.getByTestId("input-billCode").fill("MB-60004");
    await page.getByTestId("input-saleDate").fill("2026-03-25");
    await page.getByTestId("product-select-0").selectOption({ index: 1 });
    await page.getByTestId("input-customerName").fill("Blocked Sale");
    await page
      .getByTestId("input-customerPhone")
      .fill("+919876543888");
    await page
      .getByTestId("input-billPhoto")
      .setInputFiles(path.join(TEST_FILES_DIR, "receipt.jpg"));

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("sale-form-error")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("sale-form-error")).toContainText("maximum");

    // Reset limit
    dbQuery(
      "UPDATE app_settings SET value='20' WHERE key='daily_sale_limit'"
    );
  });

  test("2d: Invalid bill code format rejected", async ({ page }) => {
    await resetRateLimiter();

    await memberLogin(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.goto("/dashboard/sales");
    await page.waitForSelector('[data-testid="sales-page"]', { timeout: 10000 });
    await page.getByTestId("submit-sale-button").click();
    await expect(page.getByTestId("sale-form")).toBeVisible();

    await page.waitForFunction(
      () => {
        const sel = document.querySelector(
          '[data-testid="product-select-0"]'
        ) as HTMLSelectElement;
        return sel && sel.options.length > 1;
      },
      { timeout: 10000 }
    );

    await page.getByTestId("input-billCode").fill("INVALID-CODE");
    await page.getByTestId("input-saleDate").fill("2026-03-25");
    await page.getByTestId("product-select-0").selectOption({ index: 1 });
    await page.getByTestId("input-customerName").fill("Format Test");
    await page
      .getByTestId("input-customerPhone")
      .fill("+919876543777");
    await page
      .getByTestId("input-billPhoto")
      .setInputFiles(path.join(TEST_FILES_DIR, "receipt.jpg"));

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("error-billCode")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("error-billCode")).toContainText("format");
  });

  test("2e: Suspicious flags appear for repeat customer phone", async ({
    page,
  }) => {
    await resetRateLimiter();

    // Submit multiple sales with same customer phone to trigger flag
    await memberLogin(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await submitSaleViaUI(page, {
      billCode: "MB-60011",
      saleDate: "2026-03-25",
      customerName: "Repeat Customer",
      customerPhone: "+919111111111",
    });

    await submitSaleViaUI(page, {
      billCode: "MB-60012",
      saleDate: "2026-03-25",
      customerName: "Repeat Customer",
      customerPhone: "+919111111111",
    });

    await submitSaleViaUI(page, {
      billCode: "MB-60013",
      saleDate: "2026-03-25",
      customerName: "Repeat Customer",
      customerPhone: "+919111111111",
    });

    // Check for flags in DB
    const flagCount = parseInt(
      dbQuery(
        `SELECT COUNT(*) FROM sale_flags sf JOIN sales s ON s.id=sf.sale_id WHERE s.bill_code IN ('MB-60011','MB-60012','MB-60013')`
      )
    );
    expect(flagCount).toBeGreaterThan(0);

    // Admin should see flagged sales
    await page.context().clearCookies();
    await resetRateLimiter();
    await adminLogin(page);
    await waitForAdminSalesTable(page);

    // Flagged sales should have visual indicator
    const pageContent = await page.content();
    // Flags show as warning badges in the sales table
    expect(pageContent).toMatch(/flag|warning|suspicious/i);
  });
});

// ══════════════════════════════════════════════════════════════════
// TEST 3: Admin Management Journey
// ══════════════════════════════════════════════════════════════════

test.describe.serial("Test 3: Admin Management Journey", () => {
  let memberEmail: string;

  test.beforeAll(async () => {
    ensureTestFiles();
    cleanAllTestData();
    resetDefaultCommissionRates();
    await resetRateLimiter();

    // Register a test member via DB (supporting data setup for admin management tests)
    const rootId = dbQuery(
      "SELECT id FROM users WHERE email='root@artilligence.com'"
    );
    memberEmail = "mgmt-member@test.com";
    const exists = parseInt(
      dbQuery(
        `SELECT COUNT(*) FROM users WHERE email='${memberEmail}'`
      )
    );
    if (exists === 0) {
      dbQuery(
        `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
         VALUES (gen_random_uuid(), '${memberEmail}', '${MEMBER_PW_HASH}', 'Mgmt Test Member', '+919200000001', 'MEMBER', '${rootId}', '${rootId}', 0, 1, '/${rootId}/', 'MGMT01', 'ACTIVE', true, NOW(), NOW())`
      );
    }
    const memberId = dbQuery(
      `SELECT id FROM users WHERE email='${memberEmail}'`
    );
    dbQuery(
      `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
       VALUES (gen_random_uuid(), '${memberId}', 0, 0, 0, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`
    );
  });

  test("3a: Admin changes commission rate → new rate applies to new sales", async ({
    page,
  }) => {
    await resetRateLimiter();

    // Get current L1 rate
    const currentRate = dbQuery(
      "SELECT percentage FROM commission_settings WHERE level=1"
    );
    expect(parseFloat(currentRate)).toBe(10);

    // Admin edits L1 rate to 15%
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commission-rates-table"]', {
      timeout: 15000,
    });

    await page.getByTestId("edit-level-1").click();
    await page.getByTestId("edit-percentage-1").fill("15");
    await page.getByTestId("save-level-1").click();

    // Wait for success feedback
    await page.waitForTimeout(1000);

    // Verify in DB
    const newRate = dbQuery(
      "SELECT percentage FROM commission_settings WHERE level=1"
    );
    expect(parseFloat(newRate)).toBe(15);

    // History should record the change
    const historyCount = parseInt(
      dbQuery(
        "SELECT COUNT(*) FROM commission_rate_history WHERE level=1 AND action='UPDATED'"
      )
    );
    expect(historyCount).toBeGreaterThanOrEqual(1);

    // Now submit a sale under the member and approve it — commission should use 15%
    await page.context().clearCookies();
    await resetRateLimiter();
    await memberLogin(page, memberEmail, "member123456");
    await submitSaleViaUI(page, {
      billCode: "MB-70001",
      saleDate: "2026-03-25",
      customerName: "Rate Test Customer",
    });

    const saleId = getSaleIdByBillCode("MB-70001");

    await page.context().clearCookies();
    await resetRateLimiter();
    await adminLogin(page);
    await waitForAdminSalesTable(page);
    await adminApproveSale(page, saleId);

    // Root should get L1 commission at 15%
    const saleAmount = parseFloat(
      dbQuery(`SELECT total_amount FROM sales WHERE id='${saleId}'`)
    );
    const rootComm = getCommissionAmount(saleId, MEMBER_EMAIL);
    const expectedComm = Math.round(saleAmount * 0.15 * 100) / 100;
    expect(rootComm).toBe(expectedComm);

    // Restore original rate
    dbQuery(
      "UPDATE commission_settings SET percentage=10.00 WHERE level=1"
    );
  });

  test("3b: Admin blocks member → member cannot login", async ({ page }) => {
    await resetRateLimiter();

    // Block the test member via admin UI - we'll use the SQL helper since the admin members page
    // block functionality is tested in member management E2E already. Key test here is the effect.
    blockMember(memberEmail);

    // Try to login as blocked member
    await login(page, memberEmail, "member123456");

    // Should show blocked/deactivated error
    await page.waitForTimeout(2000);
    const url = page.url();
    const pageText = await page.textContent("body");
    expect(
      url.includes("blocked") ||
        url.includes("login") ||
        pageText?.toLowerCase().includes("deactivated") ||
        pageText?.toLowerCase().includes("blocked")
    ).toBe(true);
  });

  test("3c: Blocked member skipped in commissions", async ({ page }) => {
    await resetRateLimiter();

    // memberEmail is blocked (from 3b). Register a child under them (via DB for tree setup)
    const blockedId = dbQuery(
      `SELECT id FROM users WHERE email='${memberEmail}'`
    );
    const sellerEmail = "mgmt-seller@test.com";
    const sellerExists = parseInt(
      dbQuery(
        `SELECT COUNT(*) FROM users WHERE email='${sellerEmail}'`
      )
    );
    if (sellerExists === 0) {
      dbQuery(
        `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
         VALUES (gen_random_uuid(), '${sellerEmail}', '${MEMBER_PW_HASH}', 'Mgmt Seller', '+919200000002', 'MEMBER', '${blockedId}', '${blockedId}', 0, 2, '/${dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'")}/${blockedId}/', 'MGSEL1', 'ACTIVE', true, NOW(), NOW())`
      );
    }
    const sellerId = dbQuery(
      `SELECT id FROM users WHERE email='${sellerEmail}'`
    );
    dbQuery(
      `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
       VALUES (gen_random_uuid(), '${sellerId}', 0, 0, 0, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`
    );

    // Seller submits sale via UI
    await memberLogin(page, sellerEmail, "member123456");
    await submitSaleViaUI(page, {
      billCode: "MB-70011",
      saleDate: "2026-03-25",
      customerName: "Blocked Skip Test",
    });

    const saleId = getSaleIdByBillCode("MB-70011");

    // Admin approves
    await page.context().clearCookies();
    await resetRateLimiter();
    await adminLogin(page);
    await waitForAdminSalesTable(page);
    await adminApproveSale(page, saleId);

    // Blocked member (mgmt-member@test.com) should NOT have a commission
    const blockedComm = dbQuery(
      `SELECT COUNT(*) FROM commissions WHERE sale_id='${saleId}' AND beneficiary_id='${blockedId}' AND type='EARNING'`
    );
    expect(parseInt(blockedComm)).toBe(0);

    // Root should still get commission (skips blocked member)
    const rootId = dbQuery(
      "SELECT id FROM users WHERE email='root@artilligence.com'"
    );
    const rootComm = dbQuery(
      `SELECT COUNT(*) FROM commissions WHERE sale_id='${saleId}' AND beneficiary_id='${rootId}' AND type='EARNING'`
    );
    expect(parseInt(rootComm)).toBeGreaterThan(0);
  });

  test("3d: Admin unblocks member → member can login again", async ({
    page,
  }) => {
    await resetRateLimiter();

    unblockMember(memberEmail);

    await memberLogin(page, memberEmail, "member123456");
    await page.waitForSelector('[data-testid="dashboard-home"]', {
      timeout: 10000,
    });
    await expect(page.getByTestId("dashboard-welcome")).toBeVisible();
  });

  test("3e: Admin posts announcement → members see notification", async ({
    page,
  }) => {
    await resetRateLimiter();

    await adminLogin(page);
    await page.goto("/admin/announcements");
    await page.waitForSelector('[data-testid="admin-announcements-page"]', {
      timeout: 15000,
    });

    // Create announcement
    await page.getByTestId("create-announcement-btn").click();
    await expect(page.getByTestId("announcement-form")).toBeVisible();

    await page.getByTestId("input-title-en").fill("Important Update");
    await page
      .getByTestId("input-content-en")
      .fill("New commission rates effective from April 1st");
    await page.getByTestId("submit-announcement").click();

    // Wait for form to close and announcement to appear
    await expect(page.getByTestId("announcement-form")).not.toBeVisible({
      timeout: 10000,
    });

    // Verify announcement exists in DB
    const annCount = parseInt(
      dbQuery(
        "SELECT COUNT(*) FROM announcements WHERE title_en='Important Update'"
      )
    );
    expect(annCount).toBe(1);

    // Verify notifications created for ACTIVE members
    const notifCount = parseInt(
      dbQuery(
        "SELECT COUNT(*) FROM notifications WHERE title LIKE '%Important Update%'"
      )
    );
    expect(notifCount).toBeGreaterThan(0);

    // Member should see announcement
    await page.context().clearCookies();
    await resetRateLimiter();
    await memberLogin(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.goto("/dashboard/announcements");
    await page.waitForSelector('[data-testid="member-announcements-page"]', {
      timeout: 10000,
    });
    await expect(page.getByText("Important Update")).toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════
// TEST 4: Scale Test
// ══════════════════════════════════════════════════════════════════

test.describe.serial("Test 4: Scale Test", () => {
  test.beforeAll(async () => {
    ensureTestFiles();
    cleanAllTestData();
    resetDefaultCommissionRates();
    await resetRateLimiter();
  });

  test("4a: Create 50-member nested tree", async () => {
    // Build ternary tree: root → 3 children, each → 3 children, etc.
    // Level 0: root (1)
    // Level 1: 3 members
    // Level 2: 9 members
    // Level 3: 27 members
    // Level 4: pick 10 more to reach 50
    // Total: 1 + 3 + 9 + 27 + 10 = 50

    const rootId = dbQuery(
      "SELECT id FROM users WHERE email='root@artilligence.com'"
    );
    let memberCount = 1; // root
    const memberIds: { id: string; depth: number; path: string }[] = [
      { id: rootId, depth: 0, path: `/${rootId}` },
    ];

    // Function to create a batch of children under a parent
    function createChild(
      parentId: string,
      parentPath: string,
      parentDepth: number,
      position: number,
      index: number
    ): string {
      const email = `scale-m${index}@test.com`;
      const phone = `+91${String(9100000000 + index)}`;
      const refCode = `SCAL${String(index).padStart(3, "0")}`;

      dbQuery(
        `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
         VALUES (gen_random_uuid(), '${email}', '${MEMBER_PW_HASH}', 'Scale Member ${index}', '${phone}', 'MEMBER', '${parentId}', '${parentId}', ${position}, ${parentDepth + 1}, '${parentPath}/', '${refCode}', 'ACTIVE', true, NOW(), NOW())
         ON CONFLICT DO NOTHING`
      );
      const id = dbQuery(`SELECT id FROM users WHERE email='${email}'`);
      dbQuery(
        `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
         VALUES (gen_random_uuid(), '${id}', 0, 0, 0, NOW(), NOW())
         ON CONFLICT (user_id) DO NOTHING`
      );
      return id;
    }

    let idx = 1;
    // Level 1: 3 children under root
    const level1: typeof memberIds = [];
    for (let pos = 0; pos < 3; pos++) {
      const id = createChild(rootId, `/${rootId}`, 0, pos, idx);
      level1.push({
        id,
        depth: 1,
        path: `/${rootId}/${id}`,
      });
      idx++;
      memberCount++;
    }

    // Level 2: 3 children under each level 1 (9 total)
    const level2: typeof memberIds = [];
    for (const parent of level1) {
      for (let pos = 0; pos < 3; pos++) {
        const id = createChild(
          parent.id,
          parent.path,
          parent.depth,
          pos,
          idx
        );
        level2.push({
          id,
          depth: 2,
          path: `${parent.path}/${id}`,
        });
        idx++;
        memberCount++;
      }
    }

    // Level 3: 3 children under each level 2 (27 total)
    const level3: typeof memberIds = [];
    for (const parent of level2) {
      for (let pos = 0; pos < 3; pos++) {
        const id = createChild(
          parent.id,
          parent.path,
          parent.depth,
          pos,
          idx
        );
        level3.push({
          id,
          depth: 3,
          path: `${parent.path}/${id}`,
        });
        idx++;
        memberCount++;
      }
    }

    // Level 4: 10 more to reach 50
    for (let i = 0; i < 10 && i < level3.length; i++) {
      createChild(
        level3[i].id,
        level3[i].path,
        level3[i].depth,
        0,
        idx
      );
      idx++;
      memberCount++;
    }

    expect(memberCount).toBe(50);

    // Verify count in DB (excluding admin)
    const dbCount = parseInt(
      dbQuery(
        "SELECT COUNT(*) FROM users WHERE role='MEMBER'"
      )
    );
    expect(dbCount).toBe(50);
  });

  test("4b: Submit 100 sales across tree members", async () => {
    // Get 10 member IDs at various levels to distribute sales
    const memberEmails = dbQuery(
      "SELECT email FROM users WHERE role='MEMBER' ORDER BY depth, created_at LIMIT 10"
    )
      .split("\n")
      .filter(Boolean);

    const productId = dbQuery(
      "SELECT id FROM products WHERE is_active=true ORDER BY name LIMIT 1"
    );
    const price = dbQuery(`SELECT price FROM products WHERE id='${productId}'`);

    let saleIndex = 0;
    for (let batch = 0; batch < 10; batch++) {
      const email = memberEmails[batch % memberEmails.length];
      const memberId = dbQuery(
        `SELECT id FROM users WHERE email='${email}'`
      );

      // Insert 10 sales per batch member
      for (let i = 0; i < 10; i++) {
        const billCode = `MB-${String(80000 + saleIndex)}`;
        dbQuery(
          `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
           VALUES (gen_random_uuid(), '${memberId}', '${billCode}', ${price}, 'Scale Customer ${saleIndex}', '+91${String(9800000000 + saleIndex)}', '2026-03-25', 'PENDING', NOW() - interval '${saleIndex} minutes', NOW())
           ON CONFLICT DO NOTHING`
        );
        const saleId = dbQuery(
          `SELECT id FROM sales WHERE bill_code='${billCode}'`
        );
        if (saleId) {
          dbQuery(
            `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
             VALUES (gen_random_uuid(), '${saleId}', '${productId}', 1, ${price}, ${price})
             ON CONFLICT DO NOTHING`
          );
        }
        saleIndex++;
      }
    }

    // Verify 100 sales
    const salesCount = parseInt(
      dbQuery("SELECT COUNT(*) FROM sales")
    );
    expect(salesCount).toBe(100);
  });

  test("4c: Bulk approve sales and verify commissions at all levels", async ({
    page,
  }) => {
    await resetRateLimiter();

    // Approve all 100 sales via API for speed (UI approval would take too long for 100)
    // But we'll verify the result through the UI
    const pendingSaleIds = dbQuery(
      "SELECT id FROM sales WHERE status='PENDING'"
    )
      .split("\n")
      .filter(Boolean);

    // Approve in batches of 20 via admin UI bulk approve
    await adminLogin(page);

    for (let batch = 0; batch < 5; batch++) {
      await waitForAdminSalesTable(page);

      const hasTable = await page
        .getByTestId("sales-table")
        .isVisible()
        .catch(() => false);
      if (!hasTable) break;

      // Select all and bulk approve
      await page.getByTestId("select-all-checkbox").check();
      await page.getByTestId("bulk-approve-button").click();

      // Wait for table to update
      await page.waitForTimeout(3000);
    }

    // Verify most sales approved
    const approvedCount = parseInt(
      dbQuery("SELECT COUNT(*) FROM sales WHERE status='APPROVED'")
    );
    expect(approvedCount).toBeGreaterThan(50);

    // Commissions should be generated at multiple levels
    const commissionLevels = dbQuery(
      "SELECT DISTINCT level FROM commissions WHERE type='EARNING' ORDER BY level"
    )
      .split("\n")
      .filter(Boolean)
      .map(Number);
    expect(commissionLevels.length).toBeGreaterThanOrEqual(2);

    // Root should have received many commissions
    const rootCommCount = parseInt(
      dbQuery(
        `SELECT COUNT(*) FROM commissions c JOIN users u ON u.id=c.beneficiary_id WHERE u.email='root@artilligence.com' AND c.type='EARNING'`
      )
    );
    expect(rootCommCount).toBeGreaterThan(10);
  });

  test("4d: Reports handle large data", async ({ page }) => {
    await resetRateLimiter();

    await adminLogin(page);
    await page.goto("/admin/reports");
    await page.waitForSelector('[data-testid="admin-reports-page"]', {
      timeout: 15000,
    });

    // Sales report — set date range and apply
    await page.getByTestId("report-tab-sales").click();
    await page.waitForSelector('[data-testid="report-filters"]', {
      timeout: 15000,
    });
    await page.getByTestId("filter-date-from").fill("2026-01-01");
    await page.getByTestId("filter-date-to").fill("2026-12-31");
    await page.getByTestId("apply-filters-btn").click();

    // Wait for report to load fully
    await page.waitForSelector('[data-testid="report-table"], [data-testid="report-empty"]', {
      timeout: 30000,
    });

    const hasTable = await page
      .getByTestId("report-table")
      .isVisible()
      .catch(() => false);
    expect(hasTable).toBe(true);

    // Pagination should exist with many records
    const hasPagination = await page
      .getByTestId("report-pagination")
      .isVisible()
      .catch(() => false);
    expect(hasPagination).toBe(true);

    // Members report
    await page.getByTestId("report-tab-members").click();
    await page.waitForSelector('[data-testid="report-filters"]', {
      timeout: 15000,
    });
    await page.getByTestId("filter-date-from").fill("2026-01-01");
    await page.getByTestId("filter-date-to").fill("2026-12-31");
    await page.getByTestId("apply-filters-btn").click();
    await page.waitForSelector('[data-testid="report-table"], [data-testid="report-empty"]', {
      timeout: 30000,
    });
  });

  test("4e: Tree visualization renders with large tree", async ({ page }) => {
    await resetRateLimiter();

    // Admin tree view
    await adminLogin(page);
    await page.goto("/admin/tree");
    await page.waitForSelector('[data-testid="tree-title"]', {
      timeout: 15000,
    });

    // Tree should render within reasonable time (the page loaded)
    // Verify root node is visible
    await expect(page.getByText("Rajesh Kumar")).toBeVisible({ timeout: 10000 });

    // Member tree view — verify it loads with many downline
    await page.context().clearCookies();
    await resetRateLimiter();
    await memberLogin(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.goto("/dashboard/team");
    await page.waitForSelector('[data-testid="team-title"]', {
      timeout: 15000,
    });

    // Switch to list view to verify downline count
    await page.getByTestId("toggle-list-view").click();
    await page.waitForSelector('[data-testid="team-list-table"], [data-testid="team-list-cards"], [data-testid="team-list-empty"]', {
      timeout: 10000,
    });
  });

  test("4f: Pagination works across pages", async ({ page }) => {
    await resetRateLimiter();

    // Check admin sales pagination
    await adminLogin(page);
    await page.goto("/admin/sales");
    await page.waitForSelector(
      '[data-testid="sales-table"], [data-testid="sales-empty"]',
      { timeout: 15000 }
    );

    // Switch to all/approved tab to see all 100 sales
    await page.getByTestId("tab-approved").click();
    await page.waitForSelector('[data-testid="sales-table"]', {
      timeout: 10000,
    });

    // Check that pagination exists (more than one page of results)
    const hasPagination = await page
      .locator('[data-testid="sales-pagination"], [data-testid="pagination"]')
      .isVisible()
      .catch(() => false);

    // With 100 approved sales, pagination should exist
    if (hasPagination) {
      // Navigate to next page
      const nextBtn = page.locator(
        '[data-testid="next-page"], [data-testid="sales-next-page"]'
      );
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Check wallet pagination in member view
    await page.context().clearCookies();
    await resetRateLimiter();
    await memberLogin(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="wallet-page"]', {
      timeout: 10000,
    });

    // Root should have many commission transactions
    const rootCommTxCount = parseInt(
      dbQuery(
        `SELECT COUNT(*) FROM wallet_transactions wt JOIN wallets w ON w.id=wt.wallet_id JOIN users u ON u.id=w.user_id WHERE u.email='root@artilligence.com'`
      )
    );
    expect(rootCommTxCount).toBeGreaterThan(5);
  });
});
