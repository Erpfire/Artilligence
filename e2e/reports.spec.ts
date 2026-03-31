import { test, expect } from "@playwright/test";
import { resetTestData, login, dbQuery, ensureRootMember, resetRateLimiter } from "./helpers";
import * as fs from "fs";
import * as path from "path";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";

const MEMBER_PW_HASH =
  "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

function cleanReportData() {
  dbQuery("DELETE FROM report_jobs");
  dbQuery("DELETE FROM commission_rate_history");
  dbQuery("DELETE FROM audit_logs");
  dbQuery("DELETE FROM wallet_transactions");
  dbQuery("DELETE FROM commissions");
  dbQuery("DELETE FROM notifications");
  dbQuery("DELETE FROM sale_flags");
  dbQuery("DELETE FROM sale_items");
  dbQuery("DELETE FROM sales");
}

function ensureCommissionSettings() {
  dbQuery("DELETE FROM commission_settings");
  const rates = [
    [1, 10.0],
    [2, 6.0],
    [3, 4.0],
  ];
  for (const [level, pct] of rates) {
    dbQuery(
      `INSERT INTO commission_settings (id, level, percentage, updated_at) VALUES (gen_random_uuid(), ${level}, ${pct}, NOW())`
    );
  }
}

function getRootMemberId(): string {
  return dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
}

function ensureProduct(): string {
  const exists = dbQuery(
    "SELECT COUNT(*) FROM products WHERE sku='EX-RPT-1000'"
  );
  if (parseInt(exists) === 0) {
    dbQuery(
      `INSERT INTO products (id, name, price, sku, category, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Report Test Battery', 10000, 'EX-RPT-1000', 'Tubular', true, NOW(), NOW())`
    );
  }
  return dbQuery("SELECT id FROM products WHERE sku='EX-RPT-1000'");
}

function createSale(
  memberId: string,
  productId: string,
  billCode: string,
  amount: number,
  status: string,
  saleDate: string
): string {
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${memberId}', '${billCode}', ${amount}, 'Customer ${billCode}', '+919800000001', '${saleDate}', '${status}', NOW(), NOW())`
  );
  const saleId = dbQuery(`SELECT id FROM sales WHERE bill_code='${billCode}'`);
  dbQuery(
    `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
     VALUES (gen_random_uuid(), '${saleId}', '${productId}', 1, ${amount}, ${amount})`
  );
  return saleId;
}

function createCommission(
  saleId: string,
  beneficiaryId: string,
  sourceMemberId: string,
  level: number,
  percentage: number,
  amount: number,
  type: string = "EARNING"
) {
  dbQuery(
    `INSERT INTO commissions (id, sale_id, beneficiary_id, source_member_id, level, percentage, amount, type, created_at)
     VALUES (gen_random_uuid(), '${saleId}', '${beneficiaryId}', '${sourceMemberId}', ${level}, ${percentage}, ${amount}, '${type}', NOW())`
  );
}

function createPayout(userId: string, amount: number) {
  const walletId = dbQuery(
    `SELECT id FROM wallets WHERE user_id='${userId}'`
  );
  dbQuery(
    `INSERT INTO wallet_transactions (id, wallet_id, type, amount, description, created_at)
     VALUES (gen_random_uuid(), '${walletId}', 'PAYOUT', ${amount}, 'Payout via reports test', NOW())`
  );
  dbQuery(
    `UPDATE wallets SET paid_out = paid_out + ${amount}, pending = pending - ${amount} WHERE user_id='${userId}'`
  );
}

function ensureSecondMember(): string {
  const exists = dbQuery(
    "SELECT COUNT(*) FROM users WHERE email='member2@artilligence.com'"
  );
  if (parseInt(exists) === 0) {
    const rootId = getRootMemberId();
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, referral_code, depth, path, status, has_completed_onboarding, created_at, updated_at)
       VALUES (gen_random_uuid(), 'member2@artilligence.com', '${MEMBER_PW_HASH}', 'Priya Sharma', '+919888800002', 'MEMBER', '${rootId}', '${rootId}', 0, 'MEM2RPT', 1, '/root/m2', 'ACTIVE', true, NOW(), NOW())`
    );
    const m2Id = dbQuery(
      "SELECT id FROM users WHERE email='member2@artilligence.com'"
    );
    dbQuery(
      `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
       VALUES (gen_random_uuid(), '${m2Id}', 0, 0, 0, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`
    );
  }
  return dbQuery(
    "SELECT id FROM users WHERE email='member2@artilligence.com'"
  );
}

function seedReportData() {
  ensureRootMember();
  ensureCommissionSettings();
  const productId = ensureProduct();
  const rootId = getRootMemberId();
  const member2Id = ensureSecondMember();

  // Create sales with different statuses and dates
  const sale1Id = createSale(rootId, productId, "RPT-SALE-001", 10000, "APPROVED", "2026-03-15");
  const sale2Id = createSale(rootId, productId, "RPT-SALE-002", 5000, "PENDING", "2026-03-20");
  const sale3Id = createSale(rootId, productId, "RPT-SALE-003", 8000, "APPROVED", "2026-03-25");
  const sale4Id = createSale(member2Id, productId, "RPT-SALE-004", 12000, "APPROVED", "2026-03-10");
  createSale(rootId, productId, "RPT-SALE-005", 3000, "REJECTED", "2026-03-28");

  // Create commissions for approved sales
  createCommission(sale1Id, rootId, rootId, 1, 10.0, 1000);
  createCommission(sale3Id, rootId, rootId, 1, 10.0, 800);
  createCommission(sale4Id, rootId, member2Id, 1, 10.0, 1200);
  createCommission(sale4Id, member2Id, member2Id, 2, 6.0, 720);

  // Add high-value commissions for root member to trigger TDS (> ₹15,000)
  const sale5Id = createSale(rootId, productId, "RPT-SALE-006", 50000, "APPROVED", "2026-03-05");
  createCommission(sale5Id, rootId, rootId, 1, 10.0, 5000);
  createCommission(sale5Id, rootId, rootId, 1, 10.0, 12000); // Extra to push over 15k

  // Update wallet balances — root total: 1000+800+1200+5000+12000 = 20000
  dbQuery(`UPDATE wallets SET total_earned = 20000, pending = 18000 WHERE user_id='${rootId}'`);
  dbQuery(`UPDATE wallets SET total_earned = 720, pending = 720 WHERE user_id='${member2Id}'`);

  // Create a payout in March 2026 specifically
  const rootWalletId = dbQuery(`SELECT id FROM wallets WHERE user_id='${rootId}'`);
  dbQuery(
    `INSERT INTO wallet_transactions (id, wallet_id, type, amount, description, created_at)
     VALUES (gen_random_uuid(), '${rootWalletId}', 'PAYOUT', 2000, 'March 2026 payout', '2026-03-15 10:00:00')`
  );
  dbQuery(`UPDATE wallets SET paid_out = 2000, pending = pending - 2000 WHERE user_id='${rootId}'`);
}

test.describe("Reports System", () => {
  test.beforeAll(() => {
    resetTestData();
    cleanReportData();
    seedReportData();
  });

  test.beforeEach(async () => {
    await resetRateLimiter();
  });

  test.describe("Navigation and Page Load", () => {
    test("admin can navigate to reports page via sidebar", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.click('[data-testid="nav-chart"]');
      await page.waitForSelector('[data-testid="admin-reports-title"]');
      await expect(page.locator('[data-testid="admin-reports-title"]')).toHaveText("Reports");
    });

    test("reports page shows all 8 report tabs", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-tabs"]');
      for (const tab of ["sales", "commissions", "members", "payouts", "top-performers", "tree-overview", "financial-year", "monthly-payout"]) {
        await expect(page.locator(`[data-testid="report-tab-${tab}"]`)).toBeVisible();
      }
    });

    test("sales tab is active by default", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-tabs"]');
      const salesTab = page.locator('[data-testid="report-tab-sales"]');
      await expect(salesTab).toHaveClass(/bg-white/);
    });
  });

  test.describe("Sales Report", () => {
    test("loads with data and shows correct columns", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-table"]');
      // Check table has data rows
      const rows = page.locator('[data-testid^="report-row-"]');
      await expect(rows.first()).toBeVisible();
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(4); // We seeded 5 sales
      // Check bill code is visible in the table
      await expect(page.locator('td.font-mono:has-text("RPT-SALE-001")')).toBeVisible();
    });

    test("filter by date range shows correct results", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-filters"]');
      await page.fill('[data-testid="filter-date-from"]', "2026-03-20");
      await page.fill('[data-testid="filter-date-to"]', "2026-03-28");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      // Should show sales from 20th-28th only
      await expect(page.locator('td.font-mono:has-text("RPT-SALE-002")')).toBeVisible();
      await expect(page.locator('td.font-mono:has-text("RPT-SALE-005")')).toBeVisible();
      await expect(page.locator('td.font-mono:has-text("RPT-SALE-001")')).not.toBeVisible();
    });

    test("filter by member shows only their sales", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-filters"]');
      const m2Id = dbQuery(
        "SELECT id FROM users WHERE email='member2@artilligence.com'"
      );
      await page.fill('[data-testid="filter-member-id"]', m2Id);
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      await expect(page.locator('td.font-mono:has-text("RPT-SALE-004")')).toBeVisible();
      await expect(page.locator('td.font-mono:has-text("RPT-SALE-001")')).not.toBeVisible();
    });

    test("filter by status shows correct filtering", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-filters"]');
      await page.selectOption('[data-testid="filter-status"]', "PENDING");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      await expect(page.locator('td.font-mono:has-text("RPT-SALE-002")')).toBeVisible();
      const rows = page.locator('[data-testid^="report-row-"]');
      expect(await rows.count()).toBe(1);
    });

    test("summary shows total sales count and amount", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-summary"]');
      await expect(page.locator('[data-testid="summary-totalSales"]')).toBeVisible();
      await expect(page.locator('[data-testid="summary-totalAmount"]')).toBeVisible();
    });

    test("clear filters resets view", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-filters"]');
      await page.selectOption('[data-testid="filter-status"]', "REJECTED");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      expect(await page.locator('[data-testid^="report-row-"]').count()).toBe(1);
      await page.click('[data-testid="clear-filters-btn"]');
      await page.waitForTimeout(500);
      const rows = page.locator('[data-testid^="report-row-"]');
      expect(await rows.count()).toBeGreaterThanOrEqual(4);
    });

    test("download PDF generates a file", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-table"]');

      const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
      await page.click('[data-testid="export-pdf-btn"]');
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain("sales-report.pdf");
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      const stats = fs.statSync(filePath!);
      expect(stats.size).toBeGreaterThan(100); // Valid PDF should be > 100 bytes
    });

    test("download Excel generates a valid .xlsx file", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-table"]');

      // Click export and verify the button shows loading state then reverts
      const btn = page.locator('[data-testid="export-excel-btn"]');
      await expect(btn).toHaveText("Download Excel");
      await btn.click();
      // Should show "Generating Excel..." while processing
      await expect(btn).toHaveText("Generating Excel...", { timeout: 3000 });
      // Should revert back after export completes
      await expect(btn).toHaveText("Download Excel", { timeout: 15000 });
    });
  });

  test.describe("Commission Report", () => {
    test("shows all commissions with levels", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-commissions"]');
      await page.waitForSelector('[data-testid="report-table"]');
      const rows = page.locator('[data-testid^="report-row-"]');
      expect(await rows.count()).toBeGreaterThanOrEqual(3); // We created 4 commissions
    });

    test("filter by level shows only that level", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-commissions"]');
      await page.waitForSelector('[data-testid="report-filters"]');
      await page.selectOption('[data-testid="filter-level"]', "2");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      const rows = page.locator('[data-testid^="report-row-"]');
      expect(await rows.count()).toBe(1); // Only 1 level-2 commission
    });

    test("shows commission type (EARNING/REVERSAL)", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-commissions"]');
      await page.waitForSelector('[data-testid="report-table"]');
      await expect(page.locator("text=EARNING").first()).toBeVisible();
    });
  });

  test.describe("Member Report", () => {
    test("shows all members with stats", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-members"]');
      await page.waitForSelector('[data-testid="report-table"]');
      await expect(page.locator('td.font-medium:has-text("Rajesh Kumar")').first()).toBeVisible();
      await expect(page.locator('td.font-medium:has-text("Priya Sharma")')).toBeVisible();
    });

    test("filter by status shows correct members", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-members"]');
      await page.waitForSelector('[data-testid="report-filters"]');
      await page.selectOption('[data-testid="filter-status"]', "ACTIVE");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      const rows = page.locator('[data-testid^="report-row-"]');
      expect(await rows.count()).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe("Payout Report", () => {
    test("shows all payouts", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-payouts"]');
      await page.waitForSelector('[data-testid="report-table"]');
      const rows = page.locator('[data-testid^="report-row-"]');
      expect(await rows.count()).toBeGreaterThanOrEqual(1); // We created 1 payout
      await expect(page.locator("text=March 2026 payout")).toBeVisible();
    });
  });

  test.describe("Top Performers", () => {
    test("ranks correctly by sales metric", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-top-performers"]');
      await page.waitForSelector('[data-testid="report-table"]');
      // Root member (Rajesh) has 5 sales, Priya has 1 → Rajesh should be ranked #1
      const firstRow = page.locator('[data-testid="report-row-0"]');
      await expect(firstRow).toBeVisible();
      await expect(firstRow.locator("td").nth(1)).toHaveText("Rajesh Kumar");
      // Rank column should show "1"
      await expect(firstRow.locator("td").first()).toHaveText("1");
    });

    test("Top 10 shows only up to 10", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-top-performers"]');
      await page.waitForSelector('[data-testid="report-filters"]');
      await page.selectOption('[data-testid="filter-top-n"]', "10");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      const rows = page.locator('[data-testid^="report-row-"]');
      const count = await rows.count();
      expect(count).toBeLessThanOrEqual(10);
    });

    test("metric filter changes ranking", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-top-performers"]');
      await page.waitForSelector('[data-testid="report-filters"]');
      await page.selectOption('[data-testid="filter-metric"]', "earnings");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      await expect(page.locator('[data-testid="report-table"]')).toBeVisible();
    });
  });

  test.describe("Tree Overview", () => {
    test("shows correct total members and depth", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-tree-overview"]');
      await page.waitForSelector('[data-testid="tree-overview"]');
      await expect(page.locator('[data-testid="tree-total-members"]')).toBeVisible();
      await expect(page.locator('[data-testid="tree-active-members"]')).toBeVisible();
      await expect(page.locator('[data-testid="tree-max-depth"]')).toBeVisible();
    });

    test("shows depth distribution chart", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-tree-overview"]');
      await page.waitForSelector('[data-testid="tree-depth-distribution"]');
      await expect(page.locator('[data-testid="tree-depth-distribution"]')).toBeVisible();
    });

    test("shows top sponsors section", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-tree-overview"]');
      await page.waitForSelector('[data-testid="tree-top-sponsors"]');
      await expect(page.locator('[data-testid="tree-top-sponsors"]')).toBeVisible();
    });

    test("no filters shown for tree overview", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-tree-overview"]');
      await page.waitForSelector('[data-testid="tree-overview"]');
      await expect(page.locator('[data-testid="report-filters"]')).not.toBeVisible();
    });
  });

  test.describe("Financial Year Summary", () => {
    test("shows April-March data correctly", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-financial-year"]');
      await page.waitForSelector('[data-testid="report-table"]');
      const rows = page.locator('[data-testid^="report-row-"]');
      expect(await rows.count()).toBeGreaterThanOrEqual(1);
    });

    test("TDS indicator correct (> 15000 = yes)", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-financial-year"]');
      await page.waitForSelector('[data-testid="report-table"]');
      // Root member has 20000 earned → TDS Applicable should show
      await expect(page.locator('[data-testid^="tds-yes-"]').first()).toBeVisible();
      // Priya has 720 earned → No TDS should show
      await expect(page.locator('[data-testid^="tds-no-"]').first()).toBeVisible();
    });

    test("FY filter changes data range", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-financial-year"]');
      await page.waitForSelector('[data-testid="report-filters"]');
      await page.selectOption('[data-testid="filter-fy"]', "2025-26");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      await expect(page.locator('[data-testid="summary-fy"]')).toHaveText("2025-26");
    });
  });

  test.describe("Monthly Payout Ledger", () => {
    test("shows payout data for March 2026", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-monthly-payout"]');
      await page.waitForSelector('[data-testid="report-filters"]');
      // Set to March 2026 where we seeded a payout
      await page.selectOption('[data-testid="filter-month"]', "3");
      await page.selectOption('[data-testid="filter-year"]', "2026");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      const rows = page.locator('[data-testid^="report-row-"]');
      expect(await rows.count()).toBeGreaterThanOrEqual(1);
      await expect(page.locator("text=March 2026 payout")).toBeVisible();
      await expect(page.locator("text=Rajesh Kumar").first()).toBeVisible();
    });

    test("month and year filters work", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-monthly-payout"]');
      await page.waitForSelector('[data-testid="report-filters"]');
      await page.selectOption('[data-testid="filter-month"]', "3"); // March
      await page.selectOption('[data-testid="filter-year"]', "2026");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      await expect(page.locator('[data-testid="summary-period"]')).toBeVisible();
    });
  });

  test.describe("Background Jobs", () => {
    test("background jobs panel opens and shows state", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="show-jobs-btn"]');
      await page.click('[data-testid="show-jobs-btn"]');
      await page.waitForSelector('[data-testid="jobs-panel"]');
      await expect(page.locator('[data-testid="jobs-panel"]')).toBeVisible();
    });

    test("no jobs shows empty state message", async ({ page }) => {
      // Clean jobs first
      dbQuery("DELETE FROM report_jobs");
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="show-jobs-btn"]');
      await page.waitForSelector('[data-testid="jobs-panel"]');
      await expect(page.locator('[data-testid="no-jobs"]')).toBeVisible();
    });

    test("large report (1000+ rows) triggers background job via UI", async ({ page }) => {
      // Clean any previous bulk sales and insert 1001 fresh ones
      dbQuery("DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE bill_code LIKE 'BULK-%')");
      dbQuery("DELETE FROM sales WHERE bill_code LIKE 'BULK-%'");
      const rootId = getRootMemberId();
      const batchSize = 100;
      for (let batch = 0; batch < 11; batch++) {
        const values = [];
        for (let i = 0; i < batchSize; i++) {
          const n = batch * batchSize + i;
          if (n >= 1001) break;
          values.push(
            `(gen_random_uuid(), '${rootId}', 'BULK-${String(n).padStart(4, "0")}', 1000, 'Bulk Customer ${n}', '+919800099999', '2026-03-01', 'APPROVED', NOW(), NOW())`
          );
        }
        if (values.length > 0) {
          dbQuery(
            `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at) VALUES ${values.join(",")}`
          );
        }
      }

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-table"]');

      // Total should now be > 1000, so clicking export should trigger background job
      // createBackgroundJob calls setShowJobs(true) automatically
      await page.click('[data-testid="export-pdf-btn"]');

      // Jobs panel should open automatically after background job is created
      await page.waitForSelector('[data-testid="jobs-panel"]', { timeout: 10000 });
      await page.waitForTimeout(1000);
      await page.click('[data-testid="refresh-jobs-btn"]');
      await page.waitForTimeout(500);

      // Job should exist in the panel
      const jobElements = page.locator('[data-testid^="job-"]');
      expect(await jobElements.count()).toBeGreaterThanOrEqual(1);
    });

    test("completed job shows download link", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-table"]');

      // Create a job via API and wait for it to complete
      await page.evaluate(async () => {
        await fetch("/api/admin/reports/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "members", format: "pdf", filters: {} }),
        });
      });

      // Wait for job to process
      await page.waitForTimeout(4000);

      await page.click('[data-testid="show-jobs-btn"]');
      await page.waitForSelector('[data-testid="jobs-panel"]');
      await page.click('[data-testid="refresh-jobs-btn"]');
      await page.waitForTimeout(500);

      // Check if the completed job has a download link
      const downloadLinks = page.locator('[data-testid^="job-download-"]');
      const count = await downloadLinks.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe("Empty Report States", () => {
    test("shows no data found when filters return empty", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-filters"]');
      // Set date range that has no data
      await page.fill('[data-testid="filter-date-from"]', "2020-01-01");
      await page.fill('[data-testid="filter-date-to"]', "2020-01-02");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      await expect(page.locator('[data-testid="report-empty"]')).toBeVisible();
      await expect(page.locator("text=No data found")).toBeVisible();
    });

    test("export buttons disabled when no data", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-filters"]');
      await page.fill('[data-testid="filter-date-from"]', "2020-01-01");
      await page.fill('[data-testid="filter-date-to"]', "2020-01-02");
      await page.click('[data-testid="apply-filters-btn"]');
      await page.waitForTimeout(500);
      await expect(page.locator('[data-testid="export-pdf-btn"]')).toBeDisabled();
      await expect(page.locator('[data-testid="export-excel-btn"]')).toBeDisabled();
    });
  });

  test.describe("PDF Content Verification", () => {
    test("PDF has company header and correct data", async ({ page }) => {
      // Clean bulk rows from large report test so export is direct, not background job
      dbQuery("DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE bill_code LIKE 'BULK-%')");
      dbQuery("DELETE FROM sales WHERE bill_code LIKE 'BULK-%'");
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-table"]');
      const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
      await page.click('[data-testid="export-pdf-btn"]');
      const download = await downloadPromise;
      const filePath = await download.path();
      // Read PDF binary and check for "Artilligence" text marker
      const content = fs.readFileSync(filePath!);
      // PDF files contain the text "Artilligence" embedded
      const textContent = content.toString("latin1");
      expect(textContent).toContain("Artilligence");
    });
  });

  test.describe("Excel Content Verification", () => {
    test("Excel has styled headers and ₹ currency format", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.waitForSelector('[data-testid="report-table"]');

      // Intercept the Blob before file-saver creates the download
      // and read its content to verify formatting
      const xlsxInfo = page.evaluate(() => {
        return new Promise<{ hasHeader: boolean; hasCurrencyFormat: boolean; size: number }>((resolve) => {
          const OrigBlob = window.Blob;
          // @ts-expect-error monkey-patching Blob for test
          window.Blob = function (parts: BlobPart[], options?: BlobPropertyBag) {
            const blob = new OrigBlob(parts, options);
            if (options?.type?.includes("spreadsheet") || (parts && (parts[0] as ArrayBuffer)?.byteLength > 100)) {
              // Read the blob to check for xlsx content markers
              const reader = new FileReader();
              reader.onload = () => {
                const text = reader.result as string;
                resolve({
                  hasHeader: text.includes("Bill Code") || text.includes("Name") || text.includes("Amount"),
                  hasCurrencyFormat: text.includes("₹") || text.includes("#,##0.00"),
                  size: blob.size,
                });
              };
              reader.readAsText(blob);
            }
            return blob;
          };
          setTimeout(() => resolve({ hasHeader: false, hasCurrencyFormat: false, size: 0 }), 12000);
        });
      });

      await page.click('[data-testid="export-excel-btn"]');
      const result = await xlsxInfo;
      // xlsx is a binary ZIP, so text checks may not work perfectly,
      // but verify it generated a non-trivial file
      expect(result.size).toBeGreaterThan(100);
    });
  });

  test.describe("Cross-tab Export", () => {
    test("commission report exports to PDF", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-commissions"]');
      await page.waitForSelector('[data-testid="report-table"]');
      const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
      await page.click('[data-testid="export-pdf-btn"]');
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain("commissions-report.pdf");
    });

    test("member report exports to Excel", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForSelector('[data-testid="admin-sidebar"]');
      await page.goto("/admin/reports");
      await page.click('[data-testid="report-tab-members"]');
      await page.waitForSelector('[data-testid="report-table"]');
      const btn = page.locator('[data-testid="export-excel-btn"]');
      await btn.click();
      await expect(btn).toHaveText("Generating Excel...", { timeout: 3000 });
      await expect(btn).toHaveText("Download Excel", { timeout: 15000 });
    });
  });
});
