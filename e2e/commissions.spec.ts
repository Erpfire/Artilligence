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

function cleanCommissionData() {
  dbQuery("DELETE FROM commission_rate_history");
  dbQuery("DELETE FROM audit_logs");
  dbQuery("DELETE FROM wallet_transactions");
  dbQuery("DELETE FROM commissions");
  dbQuery("DELETE FROM notifications");
  dbQuery("DELETE FROM sale_flags");
  dbQuery("DELETE FROM sale_items");
  dbQuery("DELETE FROM sales");
}

function resetCommissionSettings() {
  dbQuery("DELETE FROM commission_settings");
  const rates = [
    [1, 10.0],
    [2, 6.0],
    [3, 4.0],
    [4, 3.0],
    [5, 2.0],
    [6, 1.0],
    [7, 0.5],
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
    "SELECT COUNT(*) FROM products WHERE sku='EX-IMTT-1500'"
  );
  if (parseInt(exists) === 0) {
    dbQuery(
      `INSERT INTO products (id, name, price, sku, category, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Test Battery', 10000, 'EX-IMTT-1500', 'Tubular', true, NOW(), NOW())`
    );
  }
  return dbQuery("SELECT id FROM products WHERE sku='EX-IMTT-1500'");
}

function ensureDeepTree(): { memberIds: string[]; leafId: string } {
  const rootId = getRootMemberId();
  const ids: string[] = [rootId];
  let parentId = rootId;

  for (let i = 1; i <= 8; i++) {
    const email = `chain-m${i}@test.com`;
    const exists = dbQuery(`SELECT COUNT(*) FROM users WHERE email='${email}'`);
    if (parseInt(exists) === 0) {
      dbQuery(
        `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
         VALUES (gen_random_uuid(), '${email}', '${MEMBER_PW_HASH}', 'Chain M${i}', '+91800000000${i}', 'MEMBER', '${rootId}', '${parentId}', 0, ${i}, '/${parentId}/', 'CHAIN0${i}', 'ACTIVE', true, NOW(), NOW())`
      );
    }
    const memberId = dbQuery(`SELECT id FROM users WHERE email='${email}'`);
    dbQuery(
      `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
       VALUES (gen_random_uuid(), '${memberId}', 0, 0, 0, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`
    );
    ids.push(memberId);
    parentId = memberId;
  }

  return { memberIds: ids, leafId: ids[ids.length - 1] };
}

function createSaleForMember(
  memberId: string,
  billCode: string,
  amount: number
): string {
  const productId = ensureProduct();
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${memberId}', '${billCode}', ${amount}, 'Test Customer', '+919000000001', CURRENT_DATE, 'PENDING', NOW(), NOW())`
  );
  const saleId = dbQuery(
    `SELECT id FROM sales WHERE bill_code='${billCode}'`
  );
  dbQuery(
    `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
     VALUES (gen_random_uuid(), '${saleId}', '${productId}', 1, ${amount}, ${amount})`
  );
  return saleId;
}

function resetAppSettings() {
  dbQuery("DELETE FROM app_settings");
  dbQuery(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('daily_sale_limit', '10', NOW())"
  );
  dbQuery(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('weekly_sale_limit', '50', NOW())"
  );
  dbQuery(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('min_sale_gap_minutes', '5', NOW())"
  );
  dbQuery(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('bill_code_format', '^MB-\\d{5,}$$', NOW())`
  );
}

async function adminLogin(page: import("@playwright/test").Page) {
  await resetRateLimiter();
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.waitForURL("**/admin", { timeout: 15000 });
}

async function memberLogin(page: import("@playwright/test").Page) {
  await resetRateLimiter();
  await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
  await page.waitForURL("**/dashboard", { timeout: 15000 });
}

// ═══════════════════════════════════════════════════════════════
// COMMISSION SETTINGS PAGE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Commission Settings Page", () => {
  test.beforeEach(async () => {
    cleanCommissionData();
    resetCommissionSettings();
    ensureRootMember();
  });

  test("admin sees current commission rates", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commissions-title"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="commissions-title"]')).toHaveText(
      "Commission Settings"
    );

    // Verify DB has 7 levels
    const count = dbQuery("SELECT COUNT(*) FROM commission_settings");
    expect(parseInt(count)).toBe(7);

    // Verify all 7 levels visible
    for (let i = 1; i <= 7; i++) {
      await expect(
        page.locator(`[data-testid="commission-row-${i}"]`)
      ).toBeVisible({ timeout: 5000 });
    }

    // Verify specific percentages (formatted with 2 decimal places)
    await expect(page.locator('[data-testid="percentage-1"]')).toHaveText("10.00%");
    await expect(page.locator('[data-testid="percentage-2"]')).toHaveText("6.00%");
    await expect(page.locator('[data-testid="percentage-7"]')).toHaveText("0.50%");

    // Verify total payout
    await expect(page.locator('[data-testid="total-payout"]')).toContainText("26.50%");
  });

  test("warning message about future-only changes is visible", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commissions-warning"]', { timeout: 10000 });

    await expect(
      page.locator('[data-testid="commissions-warning"]')
    ).toContainText("Changes apply to future sales only");
  });

  test("admin changes Level 1 from 10% to 12% via UI", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commission-row-1"]', { timeout: 10000 });

    await page.click('[data-testid="edit-level-1"]');
    const input = page.locator('[data-testid="edit-percentage-1"]');
    await expect(input).toBeVisible();
    await input.fill("12");
    await page.click('[data-testid="save-level-1"]');

    await expect(
      page.locator('[data-testid="commission-success"]')
    ).toContainText("Level 1 updated to 12%", { timeout: 10000 });

    const dbPct = dbQuery("SELECT percentage FROM commission_settings WHERE level=1");
    expect(dbPct).toBe("12.00");
  });

  test("after rate change: new sale uses new rate, old commissions unchanged", async ({ page }) => {
    const { leafId } = ensureDeepTree();

    // Create & approve first sale at old rate (10%)
    const sale1Id = createSaleForMember(leafId, "MB-OLD01", 10000);
    dbQuery(`UPDATE sales SET status='APPROVED', approved_at=NOW() WHERE id='${sale1Id}'`);

    // Create commission at old rate for later verification
    const firstAncestorId = dbQuery(`SELECT parent_id FROM users WHERE id='${leafId}'`);
    dbQuery(
      `INSERT INTO commissions (id, sale_id, beneficiary_id, source_member_id, level, percentage, amount, type, created_at)
       VALUES (gen_random_uuid(), '${sale1Id}', '${firstAncestorId}', '${leafId}', 1, 10.00, 1000.00, 'EARNING', NOW())`
    );

    // Change Level 1 to 12% via UI
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commission-row-1"]', { timeout: 10000 });

    await page.click('[data-testid="edit-level-1"]');
    await page.locator('[data-testid="edit-percentage-1"]').fill("12");
    await page.click('[data-testid="save-level-1"]');
    await expect(page.locator('[data-testid="commission-success"]')).toBeVisible({ timeout: 10000 });

    // Verify old commission still has 10%
    const oldPct = dbQuery(`SELECT percentage FROM commissions WHERE sale_id='${sale1Id}' AND level=1`);
    expect(oldPct).toBe("10.00");

    // Create and approve a new sale — commission should use 12%
    const sale2Id = createSaleForMember(leafId, "MB-NEW02", 10000);
    const res = await page.request.patch(`/api/admin/sales/${sale2Id}`, {
      data: { action: "approve" },
    });
    expect(res.ok()).toBeTruthy();

    const newPct = dbQuery(`SELECT percentage FROM commissions WHERE sale_id='${sale2Id}' AND level=1`);
    expect(newPct).toBe("12.00");
  });

  test("commission rate history shows change with timestamp", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commission-row-1"]', { timeout: 10000 });

    // Make a change
    await page.click('[data-testid="edit-level-1"]');
    await page.locator('[data-testid="edit-percentage-1"]').fill("15");
    await page.click('[data-testid="save-level-1"]');
    await expect(page.locator('[data-testid="commission-success"]')).toBeVisible({ timeout: 10000 });

    // Reload to see history
    await page.reload();
    await page.waitForSelector('[data-testid="history-table-title"]', { timeout: 10000 });

    const historyRows = page.locator('[data-testid="commission-history-table"] tbody tr');
    const count = await historyRows.count();
    expect(count).toBeGreaterThan(0);

    const firstAction = historyRows.first().locator('[data-testid^="history-action-"]');
    await expect(firstAction).toContainText("UPDATED");
  });

  test("add Level 8 at 0.25% via UI", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="add-level-button"]', { timeout: 10000 });

    await page.click('[data-testid="add-level-button"]');
    await expect(page.locator('[data-testid="add-level-row"]')).toBeVisible();

    await page.locator('[data-testid="new-level-input"]').fill("8");
    await page.locator('[data-testid="new-percentage-input"]').fill("0.25");
    await page.click('[data-testid="confirm-add-level"]');

    await expect(
      page.locator('[data-testid="commission-success"]')
    ).toContainText("Level 8 added at 0.25%", { timeout: 10000 });

    const count = dbQuery("SELECT COUNT(*) FROM commission_settings WHERE level=8");
    expect(parseInt(count)).toBe(1);
    const pct = dbQuery("SELECT percentage FROM commission_settings WHERE level=8");
    expect(pct).toBe("0.25");
  });

  test("after adding Level 8: sale with 8+ level upline generates Level 8 commission", async ({ page }) => {
    const { leafId } = ensureDeepTree();

    // Add Level 8 via UI
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="add-level-button"]', { timeout: 10000 });

    await page.click('[data-testid="add-level-button"]');
    await page.locator('[data-testid="new-level-input"]').fill("8");
    await page.locator('[data-testid="new-percentage-input"]').fill("0.25");
    await page.click('[data-testid="confirm-add-level"]');
    await expect(page.locator('[data-testid="commission-success"]')).toBeVisible({ timeout: 10000 });

    // Create and approve a sale for leaf member
    const saleId = createSaleForMember(leafId, "MB-DEEP1", 10000);
    const res = await page.request.patch(`/api/admin/sales/${saleId}`, {
      data: { action: "approve" },
    });
    expect(res.ok()).toBeTruthy();

    // Verify Level 8 commission was generated
    const lvl8Count = dbQuery(`SELECT COUNT(*) FROM commissions WHERE sale_id='${saleId}' AND level=8`);
    expect(parseInt(lvl8Count)).toBe(1);

    const lvl8Amount = dbQuery(`SELECT amount FROM commissions WHERE sale_id='${saleId}' AND level=8`);
    expect(lvl8Amount).toBe("25.00");
  });

  test("remove Level 7 via UI", async ({ page }) => {
    // Set up dialog handler BEFORE any navigation
    page.on("dialog", (dialog) => dialog.accept());

    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commission-row-7"]', { timeout: 10000 });

    await page.click('[data-testid="remove-level-7"]');
    await expect(
      page.locator('[data-testid="commission-success"]')
    ).toContainText("Level 7 removed", { timeout: 10000 });

    const count = dbQuery("SELECT COUNT(*) FROM commission_settings WHERE level=7");
    expect(parseInt(count)).toBe(0);
  });

  test("after removing Level 7: sale only generates up to Level 6", async ({ page }) => {
    const { leafId } = ensureDeepTree();

    // Remove Level 7
    page.on("dialog", (dialog) => dialog.accept());
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commission-row-7"]', { timeout: 10000 });

    await page.click('[data-testid="remove-level-7"]');
    await expect(page.locator('[data-testid="commission-success"]')).toBeVisible({ timeout: 10000 });

    // Create and approve a sale
    const saleId = createSaleForMember(leafId, "MB-NO7A", 10000);
    const res = await page.request.patch(`/api/admin/sales/${saleId}`, {
      data: { action: "approve" },
    });
    expect(res.ok()).toBeTruthy();

    const maxLevel = dbQuery(`SELECT MAX(level) FROM commissions WHERE sale_id='${saleId}'`);
    expect(parseInt(maxLevel)).toBe(6);

    const lvl7Count = dbQuery(`SELECT COUNT(*) FROM commissions WHERE sale_id='${saleId}' AND level=7`);
    expect(parseInt(lvl7Count)).toBe(0);
  });

  test("validation: percentage must be > 0 and <= 100", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commission-row-1"]', { timeout: 10000 });

    // Try editing with 0
    await page.click('[data-testid="edit-level-1"]');
    await page.locator('[data-testid="edit-percentage-1"]').fill("0");
    await page.click('[data-testid="save-level-1"]');
    await expect(
      page.locator('[data-testid="commission-error"]')
    ).toContainText("between 0 and 100", { timeout: 10000 });

    // Cancel and try with 101
    await page.click('[data-testid="cancel-edit-1"]');
    await page.click('[data-testid="edit-level-1"]');
    await page.locator('[data-testid="edit-percentage-1"]').fill("101");
    await page.click('[data-testid="save-level-1"]');
    await expect(
      page.locator('[data-testid="commission-error"]')
    ).toContainText("between 0 and 100", { timeout: 10000 });
  });

  test("validation: duplicate level rejected when adding", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="add-level-button"]', { timeout: 10000 });

    await page.click('[data-testid="add-level-button"]');
    await page.locator('[data-testid="new-level-input"]').fill("1");
    await page.locator('[data-testid="new-percentage-input"]').fill("5");
    await page.click('[data-testid="confirm-add-level"]');
    await expect(
      page.locator('[data-testid="commission-error"]')
    ).toContainText("Level 1 already exists", { timeout: 10000 });
  });

  test("audit log: rate change entries exist", async ({ page }) => {
    dbQuery("DELETE FROM audit_logs");

    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commission-row-1"]', { timeout: 10000 });

    await page.click('[data-testid="edit-level-1"]');
    await page.locator('[data-testid="edit-percentage-1"]').fill("11");
    await page.click('[data-testid="save-level-1"]');
    await expect(page.locator('[data-testid="commission-success"]')).toBeVisible({ timeout: 10000 });

    const auditCount = dbQuery("SELECT COUNT(*) FROM audit_logs WHERE action='COMMISSION_RATE_UPDATED'");
    expect(parseInt(auditCount)).toBeGreaterThan(0);

    const details = dbQuery(
      "SELECT details FROM audit_logs WHERE action='COMMISSION_RATE_UPDATED' ORDER BY created_at DESC LIMIT 1"
    );
    expect(details).toContain("level 1");
    expect(details).toContain("11");
  });

  test("commission settings navigation link works", async ({ page }) => {
    await adminLogin(page);
    await page.click('[data-testid="nav-percent"]');
    await page.waitForURL("**/admin/commissions", { timeout: 10000 });
    await expect(page.locator('[data-testid="commissions-title"]')).toBeVisible({ timeout: 10000 });
  });

  test("cancel edit restores original value", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commission-row-1"]', { timeout: 10000 });

    // Read the current displayed value
    const originalText = await page.locator('[data-testid="percentage-1"]').textContent();

    await page.click('[data-testid="edit-level-1"]');
    await page.locator('[data-testid="edit-percentage-1"]').fill("99");
    await page.click('[data-testid="cancel-edit-1"]');

    // Should restore to original
    await expect(page.locator('[data-testid="percentage-1"]')).toHaveText(originalText!);

    // DB unchanged
    const dbPct = dbQuery("SELECT percentage FROM commission_settings WHERE level=1");
    expect(dbPct).toBe("10.00");
  });

  test("cancel add level hides the form row", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="add-level-button"]', { timeout: 10000 });

    await page.click('[data-testid="add-level-button"]');
    await expect(page.locator('[data-testid="add-level-row"]')).toBeVisible();

    await page.click('[data-testid="cancel-add-level"]');
    await expect(page.locator('[data-testid="add-level-row"]')).not.toBeVisible();
  });

  test("history shows ADDED and REMOVED actions", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());

    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="add-level-button"]', { timeout: 10000 });

    // Add level 8
    await page.click('[data-testid="add-level-button"]');
    await page.locator('[data-testid="new-level-input"]').fill("8");
    await page.locator('[data-testid="new-percentage-input"]').fill("0.50");
    await page.click('[data-testid="confirm-add-level"]');
    await expect(page.locator('[data-testid="commission-success"]')).toBeVisible({ timeout: 10000 });

    // Remove level 7
    await page.reload();
    await page.waitForSelector('[data-testid="commission-row-7"]', { timeout: 10000 });
    await page.click('[data-testid="remove-level-7"]');
    await expect(page.locator('[data-testid="commission-success"]')).toBeVisible({ timeout: 10000 });

    // Check history
    await page.reload();
    await page.waitForSelector('[data-testid="commission-history-table"]', { timeout: 10000 });

    const historyText = await page
      .locator('[data-testid="commission-history-table"] tbody')
      .textContent();
    expect(historyText).toContain("ADDED");
    expect(historyText).toContain("REMOVED");
  });

  test("rates table title and history table title visible", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="rates-table-title"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="rates-table-title"]')).toHaveText("Commission Rates");
    await expect(page.locator('[data-testid="history-table-title"]')).toHaveText("Rate Change History");
  });

  test("empty history shows placeholder", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="no-history"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="no-history"]')).toContainText("No rate changes recorded");
  });
});

// ═══════════════════════════════════════════════════════════════
// APP SETTINGS PAGE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("App Settings Page", () => {
  test.beforeEach(async () => {
    resetAppSettings();
    dbQuery("DELETE FROM audit_logs");
    ensureRootMember();
  });

  test("admin sees current app settings", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings");
    await page.waitForSelector('[data-testid="settings-title"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="settings-title"]')).toHaveText("App Settings");
    await expect(page.locator('[data-testid="fraud-section-title"]')).toHaveText("Fraud Prevention");
    await expect(page.locator('[data-testid="company-section-title"]')).toHaveText("Company");

    await expect(page.locator('[data-testid="setting-daily_sale_limit"]')).toHaveValue("10");
    await expect(page.locator('[data-testid="setting-weekly_sale_limit"]')).toHaveValue("50");
    await expect(page.locator('[data-testid="setting-min_sale_gap_minutes"]')).toHaveValue("5");
  });

  test("admin changes max sales per day and saves", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings");
    await page.waitForSelector('[data-testid="setting-daily_sale_limit"]', { timeout: 10000 });

    await page.locator('[data-testid="setting-daily_sale_limit"]').fill("3");
    await page.click('[data-testid="save-settings-button"]');

    await expect(
      page.locator('[data-testid="settings-success"]')
    ).toContainText("Settings saved successfully", { timeout: 10000 });

    const val = dbQuery("SELECT value FROM app_settings WHERE key='daily_sale_limit'");
    expect(val).toBe("3");
  });

  test("app settings: change bill code format is persisted", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings");
    await page.waitForSelector('[data-testid="setting-bill_code_format"]', { timeout: 10000 });

    await page.locator('[data-testid="setting-bill_code_format"]').fill("^BILL-\\d{4}$");
    await page.click('[data-testid="save-settings-button"]');

    await expect(page.locator('[data-testid="settings-success"]')).toBeVisible({ timeout: 10000 });

    const val = dbQuery("SELECT value FROM app_settings WHERE key='bill_code_format'");
    expect(val).toContain("BILL");
  });

  test("app settings: change company name is persisted", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings");
    await page.waitForSelector('[data-testid="setting-company_name"]', { timeout: 10000 });

    await page.locator('[data-testid="setting-company_name"]').fill("New Company Name Pvt Ltd");
    await page.click('[data-testid="save-settings-button"]');

    await expect(page.locator('[data-testid="settings-success"]')).toBeVisible({ timeout: 10000 });

    const val = dbQuery("SELECT value FROM app_settings WHERE key='company_name'");
    expect(val).toBe("New Company Name Pvt Ltd");
  });

  test("app settings: audit log created on change", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings");
    await page.waitForSelector('[data-testid="setting-daily_sale_limit"]', { timeout: 10000 });

    await page.locator('[data-testid="setting-daily_sale_limit"]').fill("7");
    await page.click('[data-testid="save-settings-button"]');
    await expect(page.locator('[data-testid="settings-success"]')).toBeVisible({ timeout: 10000 });

    const auditCount = dbQuery("SELECT COUNT(*) FROM audit_logs WHERE action='APP_SETTINGS_UPDATED'");
    expect(parseInt(auditCount)).toBeGreaterThan(0);

    const details = dbQuery(
      "SELECT details FROM audit_logs WHERE action='APP_SETTINGS_UPDATED' ORDER BY created_at DESC LIMIT 1"
    );
    expect(details).toContain("daily_sale_limit");
  });

  test("settings navigation link works", async ({ page }) => {
    await adminLogin(page);
    await page.click('[data-testid="nav-settings"]');
    await page.waitForURL("**/admin/settings", { timeout: 10000 });
    await expect(page.locator('[data-testid="settings-title"]')).toBeVisible({ timeout: 10000 });
  });

  test("app settings: max sales per day enforced on member side", async ({ page }) => {
    // Set daily limit to 2 and clear bill code format so format check doesn't interfere
    dbQuery("UPDATE app_settings SET value='2' WHERE key='daily_sale_limit'");
    dbQuery("DELETE FROM app_settings WHERE key='bill_code_format'");
    await resetRateLimiter();
    ensureRootMember();
    ensureProduct();
    cleanCommissionData();

    // Create 2 sales already today to hit the limit
    const rootId = getRootMemberId();
    for (let i = 1; i <= 2; i++) {
      dbQuery(
        `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, sale_date, status, created_at, updated_at)
         VALUES (gen_random_uuid(), '${rootId}', 'MB-LIM0${i}', 5000, 'Customer ${i}', CURRENT_DATE, 'PENDING', NOW(), NOW())`
      );
    }

    // Try submitting via multipart API as member
    await memberLogin(page);
    const productId = ensureProduct();

    const apiRes = await page.request.post("/api/dashboard/sales", {
      multipart: {
        billCode: "MB-99999",
        customerName: "Test Customer",
        customerPhone: "+919000000099",
        saleDate: new Date().toISOString().split("T")[0],
        items: JSON.stringify([{ productId, quantity: 1 }]),
        billPhoto: {
          name: "test.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("fake-image"),
        },
      },
    });

    // Should be rejected with 429 rate limit
    expect(apiRes.ok()).toBeFalsy();
    expect(apiRes.status()).toBe(429);
  });

  test("app settings: bill code format enforced on sale submission", async ({ page }) => {
    dbQuery(`UPDATE app_settings SET value='^BILL-\\d{4}$$' WHERE key='bill_code_format'`);
    await resetRateLimiter();
    ensureRootMember();
    ensureProduct();
    cleanCommissionData();

    await memberLogin(page);
    const productId = ensureProduct();

    // Submit sale with invalid bill code via multipart
    const apiRes = await page.request.post("/api/dashboard/sales", {
      multipart: {
        billCode: "INVALID-CODE",
        customerName: "Test Customer",
        customerPhone: "+919000000099",
        saleDate: new Date().toISOString().split("T")[0],
        items: JSON.stringify([{ productId, quantity: 1 }]),
        billPhoto: {
          name: "test.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("fake-image"),
        },
      },
    });

    // Should be rejected due to invalid bill code format (400)
    expect(apiRes.ok()).toBeFalsy();
    const body = await apiRes.json();
    expect(body.errors?.billCode).toBeTruthy();
  });

  test("app settings: ghost member inactive days setting persists", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings");
    await page.waitForSelector('[data-testid="setting-ghost_member_inactive_days"]', { timeout: 10000 });

    await page.locator('[data-testid="setting-ghost_member_inactive_days"]').fill("60");
    await page.click('[data-testid="save-settings-button"]');

    await expect(page.locator('[data-testid="settings-success"]')).toBeVisible({ timeout: 10000 });

    const val = dbQuery("SELECT value FROM app_settings WHERE key='ghost_member_inactive_days'");
    expect(val).toBe("60");
  });

  test("app settings page responsive on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await adminLogin(page);
    await page.click('[data-testid="sidebar-toggle"]');
    await page.click('[data-testid="nav-settings"]');
    await page.waitForURL("**/admin/settings", { timeout: 10000 });

    await expect(page.locator('[data-testid="settings-title"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="save-settings-button"]')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// COMMISSION SETTINGS RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Commission Settings Responsive", () => {
  test.beforeEach(async () => {
    cleanCommissionData();
    resetCommissionSettings();
  });

  test("commission settings page works on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await adminLogin(page);
    await page.click('[data-testid="sidebar-toggle"]');
    await page.click('[data-testid="nav-percent"]');
    await page.waitForURL("**/admin/commissions", { timeout: 10000 });

    await expect(page.locator('[data-testid="commissions-title"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="commission-rates-table"]')).toBeVisible();
  });
});
