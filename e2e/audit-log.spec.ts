import { test, expect } from "@playwright/test";
import { dbQuery, resetTestData, resetRateLimiter, login, ensureRootMember } from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASS = "admin123456";

function getAdminId(): string {
  return dbQuery("SELECT id FROM users WHERE email='admin@artilligence.com'").trim();
}

function getRootMemberId(): string {
  return dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'").trim();
}

function ensureProduct(): string {
  const exists = dbQuery("SELECT COUNT(*) FROM products WHERE sku='AUDIT-TEST-PROD'");
  if (parseInt(exists) === 0) {
    dbQuery(
      `INSERT INTO products (id, name, name_hi, description, description_hi, category, price, sku, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Audit Test Battery', 'ऑडिट टेस्ट बैटरी', 'Test product for audit', 'टेस्ट', 'Inverter', 5000, 'AUDIT-TEST-PROD', true, NOW(), NOW())`
    );
  }
  return dbQuery("SELECT id FROM products WHERE sku='AUDIT-TEST-PROD'").trim();
}

function ensureCommissionLevel(): void {
  const exists = dbQuery("SELECT COUNT(*) FROM commission_settings WHERE level=1");
  if (parseInt(exists) === 0) {
    dbQuery(
      `INSERT INTO commission_settings (id, level, percentage, created_at, updated_at)
       VALUES (gen_random_uuid(), 1, 10.00, NOW(), NOW())`
    );
  }
}

function insertPendingSale(billCode: string): string {
  const memberId = getRootMemberId();
  const productId = ensureProduct();
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${memberId}', '${billCode}', 5000, 'Test Customer', '+919876543210', '2026-03-25', 'PENDING', NOW(), NOW())`
  );
  const saleId = dbQuery(`SELECT id FROM sales WHERE bill_code='${billCode}'`).trim();
  dbQuery(
    `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
     VALUES (gen_random_uuid(), '${saleId}', '${productId}', 1, 5000, 5000)`
  );
  return saleId;
}

// bcrypt hash of 'member123456'
const MEMBER_PW_HASH =
  "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

/** Create a child member under root so commission calculation actually fires */
function ensureChildMember(): string {
  const rootId = getRootMemberId();
  const exists = dbQuery("SELECT COUNT(*) FROM users WHERE email='audit-child@test.com'");
  if (parseInt(exists) === 0) {
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
       VALUES (gen_random_uuid(), 'audit-child@test.com', '${MEMBER_PW_HASH}', 'Audit Child', '+919111222333', 'MEMBER', '${rootId}', '${rootId}', 0, 1, '/${rootId}/', 'ACHILD01', 'ACTIVE', true, NOW(), NOW())`
    );
    const childId = dbQuery("SELECT id FROM users WHERE email='audit-child@test.com'").trim();
    dbQuery(
      `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
       VALUES (gen_random_uuid(), '${childId}', 0, 0, 0, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`
    );
  }
  return dbQuery("SELECT id FROM users WHERE email='audit-child@test.com'").trim();
}

/** Insert a pending sale for a child member (so commissions flow to root) */
function insertChildPendingSale(billCode: string): string {
  const childId = ensureChildMember();
  const productId = ensureProduct();
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${childId}', '${billCode}', 5000, 'Test Customer', '+919876543210', '2026-03-25', 'PENDING', NOW(), NOW())`
  );
  const saleId = dbQuery(`SELECT id FROM sales WHERE bill_code='${billCode}'`).trim();
  dbQuery(
    `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
     VALUES (gen_random_uuid(), '${saleId}', '${productId}', 1, 5000, 5000)`
  );
  return saleId;
}

function giveWalletBalance(amount: number) {
  const rootId = getRootMemberId();
  dbQuery(`UPDATE wallets SET total_earned=${amount}, pending=${amount}, paid_out=0 WHERE user_id='${rootId}'`);
}

/** Seed many audit log entries for pagination testing (SQL is acceptable here
 * since we're testing the page UI, not audit trail generation) */
function seedManyAuditLogs() {
  const adminId = getAdminId();
  for (let i = 0; i < 45; i++) {
    dbQuery(
      `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, details, created_at)
       VALUES (gen_random_uuid(), '${adminId}', 'PRODUCT_UPDATED', 'Product', gen_random_uuid(), '{"name":"Paginated Entry ${i}"}', NOW() - interval '${i} minutes')`
    );
  }
}

// ── Helper: go to audit log and check for specific action ──

async function verifyAuditEntry(page: any, action: string, expectedLabel: string) {
  await page.goto("/admin/audit-log");
  await page.waitForSelector('[data-testid="audit-log-title"]', { timeout: 15000 });
  // Wait for loading to complete (spinner disappears, table or empty state appears)
  await page.waitForSelector('[data-testid="audit-loading"]', { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => {
    return !document.querySelector('[data-testid="audit-loading"]') &&
           (document.querySelector('[data-testid="audit-table"]') || document.querySelector('[data-testid="audit-empty"]'));
  }, { timeout: 15000 });

  // Filter by the specific action
  const actionSelect = page.locator('[data-testid="filter-action"]');
  const options = await actionSelect.locator("option").allTextContents();
  expect(options).toContain(expectedLabel);

  await page.selectOption('[data-testid="filter-action"]', action);
  await page.click('[data-testid="apply-filters-btn"]');
  await page.waitForTimeout(1000);

  const count = page.locator('[data-testid="audit-count"]');
  const countText = await count.textContent();
  expect(countText).toMatch(/of [1-9]/);

  // Expand and verify details panel works
  const toggle = page.locator('[data-testid^="audit-row-toggle-"]').first();
  await toggle.click();
  const details = page.locator('[data-testid^="audit-details-"]').first();
  await expect(details).toBeVisible();
}

// ══════════════════════════════════════════════════════════════════════
// SECTION 1: Real UI Flows → Verify Audit Entries Created
// Every test performs the actual admin/member action through the UI,
// then navigates to audit log and verifies the entry exists.
// ══════════════════════════════════════════════════════════════════════

test.describe("Audit Trail — Product CRUD via UI", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("creating a product via admin UI → PRODUCT_CREATED audit entry", async ({ page }) => {
    // Clean up product from prior runs
    dbQuery("DELETE FROM products WHERE sku='AUDIT-UI-CREATE-001'");

    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // Create product via UI
    await page.goto("/admin/products");
    await page.waitForSelector('[data-testid="products-table"]', { timeout: 15000 });
    await page.click('[data-testid="add-product-button"]');
    await page.waitForURL("**/admin/products/new", { timeout: 10000 });

    await page.fill('[data-testid="input-name"]', "Audit Created Battery");
    await page.fill('[data-testid="input-nameHi"]', "ऑडिट बैटरी");
    await page.fill('[data-testid="input-description"]', "Created via UI for audit test");
    await page.fill('[data-testid="input-descriptionHi"]', "ऑडिट टेस्ट");
    await page.selectOption('[data-testid="input-category"]', "Car");
    await page.fill('[data-testid="input-price"]', "7500");
    await page.fill('[data-testid="input-sku"]', "AUDIT-UI-CREATE-001");
    await page.click('[data-testid="submit-button"]');
    await page.waitForURL("**/admin/products", { timeout: 10000 });

    // Verify audit entry
    await verifyAuditEntry(page, "PRODUCT_CREATED", "Product Created");
  });

  test("updating a product via admin UI → PRODUCT_UPDATED audit entry", async ({ page }) => {
    ensureProduct();
    const productId = dbQuery("SELECT id FROM products WHERE sku='AUDIT-TEST-PROD'").trim();

    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // Edit product via UI
    await page.goto(`/admin/products/${productId}/edit`);
    await page.waitForSelector('[data-testid="edit-product-title"]', { timeout: 15000 });
    await page.fill('[data-testid="input-price"]', "5500");
    await page.click('[data-testid="submit-button"]');
    await page.waitForURL("**/admin/products", { timeout: 10000 });

    // Verify audit entry
    await verifyAuditEntry(page, "PRODUCT_UPDATED", "Product Updated");
  });
});

test.describe("Audit Trail — Member Block/Unblock via UI", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("blocking a member via admin UI → MEMBER_BLOCKED audit entry", async ({ page }) => {
    const rootId = getRootMemberId();

    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // Block via member detail page
    await page.goto(`/admin/members/${rootId}`);
    await page.waitForSelector('[data-testid="block-button"]', { timeout: 15000 });
    await expect(page.locator('[data-testid="member-status"]')).toHaveText("ACTIVE");
    await page.click('[data-testid="block-button"]');
    await expect(page.locator('[data-testid="member-status"]')).toHaveText("BLOCKED", { timeout: 10000 });

    // Verify audit entry
    await verifyAuditEntry(page, "MEMBER_BLOCKED", "Member Blocked");
  });

  test("unblocking a member via admin UI → MEMBER_UNBLOCKED audit entry", async ({ page }) => {
    const rootId = getRootMemberId();
    // Pre-block so we can unblock
    dbQuery(`UPDATE users SET status='BLOCKED' WHERE id='${rootId}'`);

    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`/admin/members/${rootId}`);
    await page.waitForSelector('[data-testid="block-button"]', { timeout: 15000 });
    await expect(page.locator('[data-testid="member-status"]')).toHaveText("BLOCKED");
    await page.click('[data-testid="block-button"]');
    await expect(page.locator('[data-testid="member-status"]')).toHaveText("ACTIVE", { timeout: 10000 });

    // Verify audit entry
    await verifyAuditEntry(page, "MEMBER_UNBLOCKED", "Member Unblocked");
  });
});

test.describe("Audit Trail — Sale Approve/Reject via UI", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
    ensureProduct();
    ensureCommissionLevel();
  });

  test("approving a sale via admin UI → SALE_APPROVED audit entry", async ({ page }) => {
    // Setup: create pending sale (SQL). The UI action we test is the APPROVAL click.
    const saleId = insertPendingSale("AUDIT-APPROVE-001");

    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Approve via admin UI
    await page.getByTestId(`approve-sale-${saleId}`).click();
    // Wait for approval to complete
    await page.waitForFunction(
      (id) => {
        const btn = document.querySelector(`[data-testid="approve-sale-${id}"]`);
        return !btn;
      },
      saleId,
      { timeout: 15000 }
    );

    // Verify SALE_APPROVED audit entry
    await verifyAuditEntry(page, "SALE_APPROVED", "Sale Approved");
  });

  test("rejecting a sale via admin UI → SALE_REJECTED audit entry", async ({ page }) => {
    const saleId = insertPendingSale("AUDIT-REJECT-001");

    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Reject via UI
    await page.getByTestId(`reject-sale-${saleId}`).click();
    await expect(page.getByTestId("reject-modal")).toBeVisible();
    await page.getByTestId("rejection-reason-input").fill("Invalid bill code for audit test");
    await page.getByTestId("confirm-reject").click();
    await expect(page.getByTestId("reject-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify audit entry
    await verifyAuditEntry(page, "SALE_REJECTED", "Sale Rejected");
  });

  test("approving a sale also creates COMMISSIONS_CALCULATED audit entry", async ({ page }) => {
    // Use child member's sale so commissions flow to root
    const saleId = insertChildPendingSale("AUDIT-COMM-001");

    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    await page.getByTestId(`approve-sale-${saleId}`).click();
    await page.waitForFunction(
      (id) => {
        const btn = document.querySelector(`[data-testid="approve-sale-${id}"]`);
        return !btn;
      },
      saleId,
      { timeout: 15000 }
    );

    // Verify COMMISSIONS_CALCULATED audit entry
    await verifyAuditEntry(page, "COMMISSIONS_CALCULATED", "Commissions Calculated");
  });
});

test.describe("Audit Trail — Wallet Payout/Adjustment via UI", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
    ensureProduct();
    ensureCommissionLevel();
  });

  test("processing wallet payout via admin UI → PAYOUT_PROCESSED audit entry", async ({ page }) => {
    // Give root member some wallet balance (setup data for payout test)
    giveWalletBalance(3000);

    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible({ timeout: 15000 });

    const rootId = getRootMemberId();
    await page.getByTestId(`payout-btn-${rootId}`).click();
    await expect(page.getByTestId("payout-modal")).toBeVisible();
    await page.getByTestId("payout-amount-input").fill("1000");
    await page.getByTestId("payout-confirm").click();
    await expect(page.getByTestId("payout-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify audit entry
    await verifyAuditEntry(page, "PAYOUT_PROCESSED", "Payout Processed");
  });

  test("processing wallet adjustment via admin UI → WALLET_CREDIT_ADJUSTMENT audit entry", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/wallets");
    await expect(page.getByTestId("admin-wallets-page")).toBeVisible({ timeout: 15000 });

    const rootId = getRootMemberId();
    await page.getByTestId(`adjustment-btn-${rootId}`).click();
    await expect(page.getByTestId("adjustment-modal")).toBeVisible();
    await page.getByTestId("adjustment-amount-input").fill("500");
    await page.getByTestId("adjustment-reason-input").fill("Bonus credit for audit test");
    await page.getByTestId("adjustment-confirm").click();
    await expect(page.getByTestId("adjustment-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify audit entry
    await verifyAuditEntry(page, "WALLET_CREDIT_ADJUSTMENT", "Wallet Credit Adjustment");
  });
});

test.describe("Audit Trail — Commission Rate Changes via UI", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
    ensureCommissionLevel();
  });

  test("editing commission rate via admin UI → COMMISSION_RATE_UPDATED audit entry", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commissions-title"]', { timeout: 10000 });

    // Edit level 1 percentage
    await page.click('[data-testid="edit-level-1"]');
    const input = page.locator('[data-testid="edit-percentage-1"]');
    await expect(input).toBeVisible();
    await input.fill("12");
    await page.click('[data-testid="save-level-1"]');
    await expect(page.locator('[data-testid="commission-success"]')).toBeVisible({ timeout: 10000 });

    // Verify audit entry
    await verifyAuditEntry(page, "COMMISSION_RATE_UPDATED", "Commission Rate Updated");
  });

  test("adding commission level via admin UI → COMMISSION_LEVEL_ADDED audit entry", async ({ page }) => {
    // Clean up level 2 from prior runs
    dbQuery("DELETE FROM commission_settings WHERE level=2");

    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/commissions");
    await page.waitForSelector('[data-testid="commissions-title"]', { timeout: 10000 });

    // Add level 2
    await page.click('[data-testid="add-level-button"]');
    await expect(page.locator('[data-testid="add-level-row"]')).toBeVisible();
    await page.locator('[data-testid="new-level-input"]').fill("2");
    await page.locator('[data-testid="new-percentage-input"]').fill("5");
    await page.click('[data-testid="confirm-add-level"]');
    await expect(page.locator('[data-testid="commission-success"]')).toBeVisible({ timeout: 10000 });

    // Verify audit entry
    await verifyAuditEntry(page, "COMMISSION_LEVEL_ADDED", "Commission Level Added");
  });
});

test.describe("Audit Trail — App Settings Changes via UI", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("updating app settings via admin UI → APP_SETTINGS_UPDATED audit entry", async ({ page }) => {
    // Ensure the setting has a known value so our change is always a real change
    dbQuery("DELETE FROM app_settings WHERE key='company_name'");

    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/settings");
    await page.waitForSelector('[data-testid="settings-title"]', { timeout: 10000 });

    // Change a setting (will always be a new value since we deleted it)
    await page.locator('[data-testid="setting-company_name"]').fill("Artilligence Audit Test");
    await page.click('[data-testid="save-settings-button"]');
    await expect(page.locator('[data-testid="settings-success"]')).toBeVisible({ timeout: 10000 });

    // Verify audit entry
    await verifyAuditEntry(page, "APP_SETTINGS_UPDATED", "App Settings Updated");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 2: Audit Log Page UI Functionality
// Tests the audit log page itself: nav, filters, expand, pagination, export.
// Uses SQL seeds for audit_logs table to set up enough data for page tests.
// ══════════════════════════════════════════════════════════════════════

test.describe("Audit Log Page — Navigation & Display", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
    // Create entries via real admin actions for page testing
    // We do a quick product create + block via API to populate audit logs
    const adminId = getAdminId();
    const rootId = getRootMemberId();
    ensureProduct();
    // Seed a few entries via SQL for page UI testing (these test the page, not the trail)
    const entries = [
      { action: "PRODUCT_CREATED", entity: "Product", entityId: ensureProduct(), details: '{"name":"Test"}' },
      { action: "MEMBER_BLOCKED", entity: "User", entityId: rootId, details: '{"member":"Rajesh"}' },
      { action: "SALE_APPROVED", entity: "Sale", entityId: "s1", details: '{"billCode":"MB-001"}' },
      { action: "PAYOUT_PROCESSED", entity: "wallet", entityId: "w1", details: '{"amount":"1000"}' },
      { action: "APP_SETTINGS_UPDATED", entity: "AppSetting", entityId: null, details: '{"company":"Test"}' },
    ];
    for (const e of entries) {
      const eid = e.entityId ? `'${e.entityId}'` : "NULL";
      dbQuery(
        `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, details, created_at)
         VALUES (gen_random_uuid(), '${adminId}', '${e.action}', '${e.entity}', ${eid}, '${e.details}', NOW() - interval '${entries.indexOf(e)} minutes')`
      );
    }
  });

  test("audit log page loads with entries and title", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-log-title"]', { timeout: 15000 });

    await expect(page.locator('[data-testid="audit-log-title"]')).toHaveText("Audit Log");
    await expect(page.locator('[data-testid="audit-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-count"]')).toContainText("of 5 entries");
  });

  test("nav link for Audit Log exists and navigates", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    const navLink = page.locator('[data-testid="nav-shield"]');
    await expect(navLink).toBeVisible();
    await expect(navLink).toContainText("Audit Log");
    await navLink.click();
    await page.waitForURL(/\/admin\/audit-log/, { timeout: 10000 });
    await expect(page.locator('[data-testid="audit-log-title"]')).toBeVisible();
  });

  test("filter by action type → only matching entries", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"]', { timeout: 15000 });

    await page.selectOption('[data-testid="filter-action"]', "SALE_APPROVED");
    await page.click('[data-testid="apply-filters-btn"]');
    await page.waitForTimeout(1000);

    await expect(page.locator('[data-testid="audit-count"]')).toContainText("of 1 entries");
    const actionBadge = page.locator('table span[class*="bg-blue-100"]');
    await expect(actionBadge).toContainText("Sale Approved");
  });

  test("filter by entity type → only matching entries", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"]', { timeout: 15000 });

    await page.selectOption('[data-testid="filter-entity"]', "wallet");
    await page.click('[data-testid="apply-filters-btn"]');
    await page.waitForTimeout(1000);

    await expect(page.locator('[data-testid="audit-count"]')).toContainText("of 1 entries");
  });

  test("filter by date range → correct results", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"]', { timeout: 15000 });

    const today = new Date().toISOString().split("T")[0];
    await page.fill('[data-testid="filter-date-from"]', today);
    await page.fill('[data-testid="filter-date-to"]', today);
    await page.click('[data-testid="apply-filters-btn"]');
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="audit-count"]')).toContainText("of 5 entries");

    // Past date — should show 0
    await page.fill('[data-testid="filter-date-from"]', "2020-01-01");
    await page.fill('[data-testid="filter-date-to"]', "2020-01-02");
    await page.click('[data-testid="apply-filters-btn"]');
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="audit-empty"]')).toBeVisible();
  });

  test("click entry → expands to show details, click again → collapses", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"]', { timeout: 15000 });

    const toggleDiv = page.locator('[data-testid^="audit-row-toggle-"]').first();
    await toggleDiv.click();

    const detailsPanel = page.locator('[data-testid^="audit-details-"]').first();
    await expect(detailsPanel).toBeVisible();
    await expect(detailsPanel).toContainText("Details");

    await toggleDiv.click();
    await expect(detailsPanel).not.toBeVisible();
  });

  test("clear filters resets all values", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"]', { timeout: 15000 });

    await page.selectOption('[data-testid="filter-entity"]', "wallet");
    await page.click('[data-testid="apply-filters-btn"]');
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="audit-count"]')).toContainText("of 1 entries");

    await page.click('[data-testid="clear-filters-btn"]');
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="audit-count"]')).toContainText("of 5 entries");
  });

  test("filter dropdowns populate with correct options", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"]', { timeout: 15000 });

    const actionOptions = await page.locator('[data-testid="filter-action"] option').allTextContents();
    expect(actionOptions).toContain("All Actions");
    expect(actionOptions.length).toBeGreaterThanOrEqual(6); // All + 5 actions

    const entityOptions = await page.locator('[data-testid="filter-entity"] option').allTextContents();
    expect(entityOptions).toContain("All Entities");
    expect(entityOptions.length).toBeGreaterThanOrEqual(5); // All + 4 entities

    const actorOptions = await page.locator('[data-testid="filter-actor"] option').allTextContents();
    expect(actorOptions).toContain("All Actors");
    expect(actorOptions.length).toBeGreaterThanOrEqual(2); // All + admin
  });

  test("expanded row shows JSON detail fields as key-value cards", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"]', { timeout: 15000 });

    // Filter to PRODUCT_CREATED which has JSON {name: "Test"}
    await page.selectOption('[data-testid="filter-action"]', "PRODUCT_CREATED");
    await page.click('[data-testid="apply-filters-btn"]');
    await page.waitForTimeout(1000);

    const toggle = page.locator('[data-testid^="audit-row-toggle-"]').first();
    await toggle.click();
    const details = page.locator('[data-testid^="audit-details-"]').first();
    await expect(details).toBeVisible();
    await expect(details.locator('.rounded.bg-white.p-2.border')).toHaveCount(1);
    await expect(details).toContainText("Test");
  });
});

test.describe("Audit Log Page — Pagination", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
    seedManyAuditLogs(); // 45 entries
  });

  test("pagination works with 45 entries (20 per page)", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"]', { timeout: 15000 });

    const count = page.locator('[data-testid="audit-count"]');
    await expect(count).toContainText("of 45 entries");
    await expect(count).toContainText("Showing 20");

    const pagination = page.locator('[data-testid="audit-pagination"]');
    await expect(pagination).toContainText("Page 1 of 3");
    await expect(page.locator('[data-testid="pagination-prev"]')).toBeDisabled();

    // Page 2
    await page.click('[data-testid="pagination-next"]');
    await page.waitForTimeout(1000);
    await expect(pagination).toContainText("Page 2 of 3");

    // Page 3
    await page.click('[data-testid="pagination-next"]');
    await page.waitForTimeout(1000);
    await expect(pagination).toContainText("Page 3 of 3");
    await expect(count).toContainText("Showing 5");
    await expect(page.locator('[data-testid="pagination-next"]')).toBeDisabled();

    // Back to page 2
    await page.click('[data-testid="pagination-prev"]');
    await page.waitForTimeout(1000);
    await expect(pagination).toContainText("Page 2 of 3");
  });
});

test.describe("Audit Log Page — Export", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
    // Create entries via real UI action to have export data
    const adminId = getAdminId();
    dbQuery(
      `INSERT INTO audit_logs (id, user_id, action, entity, details, created_at)
       VALUES (gen_random_uuid(), '${adminId}', 'PRODUCT_CREATED', 'Product', '{"name":"Export Test"}', NOW())`
    );
  });

  test("export PDF → downloads valid file", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"]', { timeout: 15000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
    await page.click('[data-testid="export-pdf-btn"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("audit-log.pdf");
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
  });

  test("export Excel → generates valid xlsx file", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-table"]', { timeout: 15000 });

    const xlsxInfo = page.evaluate(() => {
      return new Promise<{ size: number }>((resolve) => {
        const OrigBlob = window.Blob;
        // @ts-expect-error monkey-patching Blob for test
        window.Blob = function (parts: BlobPart[], options?: BlobPropertyBag) {
          const blob = new OrigBlob(parts, options);
          if (options?.type?.includes("spreadsheet") || (parts && (parts[0] as ArrayBuffer)?.byteLength > 100)) {
            resolve({ size: blob.size });
          }
          return blob;
        };
        setTimeout(() => resolve({ size: 0 }), 25000);
      });
    });

    await page.click('[data-testid="export-excel-btn"]');
    const result = await xlsxInfo;
    expect(result.size).toBeGreaterThan(100);
  });
});

test.describe("Audit Log Page — Empty State & Mobile", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  test("empty state shown when no audit entries", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/audit-log");
    await page.waitForSelector('[data-testid="audit-log-title"]', { timeout: 15000 });

    await expect(page.locator('[data-testid="audit-empty"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-empty"]')).toContainText("No audit log entries found");
  });

  test("audit log renders on mobile viewport with sidebar nav", async ({ page }) => {
    // Seed one entry so the page has content
    const adminId = getAdminId();
    dbQuery(
      `INSERT INTO audit_logs (id, user_id, action, entity, details, created_at)
       VALUES (gen_random_uuid(), '${adminId}', 'PRODUCT_CREATED', 'Product', '{"name":"Mobile Test"}', NOW())`
    );

    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.click('[data-testid="sidebar-toggle"]');
    await page.waitForTimeout(500);
    await page.locator('[data-testid="nav-shield"]').click();
    await page.waitForURL(/\/admin\/audit-log/, { timeout: 10000 });

    await expect(page.locator('[data-testid="audit-log-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-filters"]')).toBeVisible();
    await expect(page.locator('[data-testid="export-pdf-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="export-excel-btn"]')).toBeVisible();
  });
});
