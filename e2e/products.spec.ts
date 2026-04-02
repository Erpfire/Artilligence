import { test, expect } from "@playwright/test";
import { dbQuery, login, resetRateLimiter } from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";

function cleanupTestProducts() {
  // Delete audit logs for test products
  dbQuery(
    "DELETE FROM audit_logs WHERE entity='Product' AND entity_id IN (SELECT id FROM products WHERE sku LIKE 'TEST-%')"
  );
  // Delete test products (those with TEST- prefix SKU)
  dbQuery("DELETE FROM products WHERE sku LIKE 'TEST-%'");
  // Also clean up products created without SKU (by name match)
  dbQuery(
    "DELETE FROM audit_logs WHERE entity='Product' AND entity_id IN (SELECT id FROM products WHERE name LIKE 'Test Product%' OR name LIKE 'Pagination Product%')"
  );
  dbQuery(
    "DELETE FROM products WHERE name LIKE 'Test Product%' OR name LIKE 'Pagination Product%'"
  );
}

test.describe("Product Management", () => {
  test.beforeEach(async () => {
    await resetRateLimiter();
    cleanupTestProducts();
  });

  test.afterAll(() => {
    cleanupTestProducts();
  });

  // ── Products List ──────────────────────────────────────────

  test.describe("Products List", () => {
    test("admin sees products in the table", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      await page.click('[data-testid="nav-package"]');
      await page.waitForURL("**/admin/products");

      await expect(page.locator('[data-testid="products-title"]')).toHaveText("Products");
      await expect(page.locator('[data-testid="products-table"]')).toBeVisible();

      // Should see products in the table (newest first — imported products)
      const rows = page.locator("tbody tr");
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(10); // max per page
    });

    test("products table shows correct columns", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");
      await expect(page.locator('[data-testid="products-table"]')).toBeVisible();

      // Check column headers
      const headers = page.locator("thead th");
      await expect(headers.nth(0)).toContainText("Product");
      await expect(headers.nth(1)).toContainText("Category");
      await expect(headers.nth(2)).toContainText("Price");
      await expect(headers.nth(3)).toContainText("Status");
      await expect(headers.nth(4)).toContainText("Actions");
    });
  });

  // ── Add Product ────────────────────────────────────────────

  test.describe("Add Product", () => {
    test("add product with all fields → appears in list", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await page.click('[data-testid="add-product-button"]');
      await page.waitForURL("**/admin/products/new");
      await expect(page.locator('[data-testid="new-product-title"]')).toHaveText("Add New Product");

      // Fill all fields
      await page.fill('[data-testid="input-name"]', "Test Product Alpha");
      await page.fill('[data-testid="input-nameHi"]', "टेस्ट प्रोडक्ट अल्फा");
      await page.fill('[data-testid="input-description"]', "A test product description");
      await page.fill('[data-testid="input-descriptionHi"]', "टेस्ट प्रोडक्ट विवरण");
      await page.selectOption('[data-testid="input-category"]', "CAR/SUV");
      await page.fill('[data-testid="input-price"]', "9999");
      await page.fill('[data-testid="input-sku"]', "TEST-ALPHA-001");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Product should appear in the list
      await expect(page.locator("text=Test Product Alpha")).toBeVisible();
      await expect(page.locator("text=TEST-ALPHA-001")).toBeVisible();
    });

    test("add product with missing required fields → validation errors", async ({
      page,
    }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      // Submit with empty form
      await page.click('[data-testid="submit-button"]');

      // Should show validation errors
      await expect(page.locator('[data-testid="error-name"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-name"]')).toContainText(
        "Product name is required"
      );
      await expect(page.locator('[data-testid="error-category"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-category"]')).toContainText(
        "Category is required"
      );
      await expect(page.locator('[data-testid="error-price"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-price"]')).toContainText(
        "Valid price is required"
      );

      // Should not navigate away
      await expect(page).toHaveURL(/\/admin\/products\/new/);
    });

    test("add product with duplicate SKU → error", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      // Use an existing seeded product's SKU
      await page.fill('[data-testid="input-name"]', "Duplicate SKU Product");
      await page.selectOption('[data-testid="input-category"]', "CAR/SUV");
      await page.fill('[data-testid="input-price"]', "5000");
      await page.fill('[data-testid="input-sku"]', "EX-IMTT-1500"); // seeded SKU

      await page.click('[data-testid="submit-button"]');

      // Should show duplicate SKU error
      await expect(page.locator('[data-testid="form-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="form-error"]')).toContainText(
        "SKU already exists"
      );
    });

    test("Hindi name and description saved correctly", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      const hindiName = "हिन्दी बैटरी नाम";
      const hindiDesc = "हिन्दी बैटरी विवरण";

      await page.fill('[data-testid="input-name"]', "Hindi Test Product");
      await page.fill('[data-testid="input-nameHi"]', hindiName);
      await page.fill('[data-testid="input-description"]', "English description");
      await page.fill('[data-testid="input-descriptionHi"]', hindiDesc);
      await page.selectOption('[data-testid="input-category"]', "INVERTER BATTERY");
      await page.fill('[data-testid="input-price"]', "7777");
      await page.fill('[data-testid="input-sku"]', "TEST-HINDI-001");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Verify in DB that Hindi fields are saved
      const row = dbQuery(
        "SELECT name_hi, description_hi FROM products WHERE sku='TEST-HINDI-001'"
      );
      expect(row).toContain(hindiName);
      expect(row).toContain(hindiDesc);
    });
  });

  // ── Edit Product ───────────────────────────────────────────

  test.describe("Edit Product", () => {
    test("edit existing product → changes saved", async ({ page }) => {
      // First create a product to edit
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      await page.fill('[data-testid="input-name"]', "Test Product Edit Me");
      await page.selectOption('[data-testid="input-category"]', "TWO-WHEELER");
      await page.fill('[data-testid="input-price"]', "3000");
      await page.fill('[data-testid="input-sku"]', "TEST-EDIT-001");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Find and click edit
      const productId = dbQuery(
        "SELECT id FROM products WHERE sku='TEST-EDIT-001'"
      );
      await page.click(`[data-testid="edit-product-${productId}"]`);
      await page.waitForURL(/\/admin\/products\/.+\/edit/);

      await expect(page.locator('[data-testid="edit-product-title"]')).toHaveText(
        "Edit Product"
      );

      // Verify form is pre-filled
      await expect(page.locator('[data-testid="input-name"]')).toHaveValue(
        "Test Product Edit Me"
      );
      await expect(page.locator('[data-testid="input-sku"]')).toHaveValue(
        "TEST-EDIT-001"
      );

      // Change name and price
      await page.fill('[data-testid="input-name"]', "Test Product Edited");
      await page.fill('[data-testid="input-price"]', "3500");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Verify changes in list
      await expect(page.locator("text=Test Product Edited")).toBeVisible();

      // Verify in DB
      const updatedRow = dbQuery(
        "SELECT name, price FROM products WHERE sku='TEST-EDIT-001'"
      );
      expect(updatedRow).toContain("Test Product Edited");
      expect(updatedRow).toContain("3500");
    });

    test("edit product Hindi name → verify saved correctly", async ({
      page,
    }) => {
      // Create a product
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      await page.fill('[data-testid="input-name"]', "Test Product Hindi Edit");
      await page.fill('[data-testid="input-nameHi"]', "पुराना नाम");
      await page.selectOption('[data-testid="input-category"]', "HCV");
      await page.fill('[data-testid="input-price"]', "8000");
      await page.fill('[data-testid="input-sku"]', "TEST-HI-EDIT-001");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Edit it
      const productId = dbQuery(
        "SELECT id FROM products WHERE sku='TEST-HI-EDIT-001'"
      );
      await page.click(`[data-testid="edit-product-${productId}"]`);
      await page.waitForURL(/\/admin\/products\/.+\/edit/);

      const newHindiName = "नया हिन्दी नाम";
      await page.fill('[data-testid="input-nameHi"]', newHindiName);

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Verify Hindi name updated in DB
      const row = dbQuery(
        "SELECT name_hi FROM products WHERE sku='TEST-HI-EDIT-001'"
      );
      expect(row).toContain(newHindiName);
    });
  });

  // ── Activate/Deactivate ────────────────────────────────────

  test.describe("Activate/Deactivate", () => {
    test("deactivate product → status changes to inactive", async ({
      page,
    }) => {
      // Create test product
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      await page.fill('[data-testid="input-name"]', "Test Product Deactivate");
      await page.selectOption('[data-testid="input-category"]', "CAR/SUV");
      await page.fill('[data-testid="input-price"]', "4000");
      await page.fill('[data-testid="input-sku"]', "TEST-DEACT-001");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      const productId = dbQuery(
        "SELECT id FROM products WHERE sku='TEST-DEACT-001'"
      );

      // Should show as Active initially
      await expect(
        page.locator(`[data-testid="product-status-${productId}"]`)
      ).toHaveText("Active");

      // Click deactivate
      await page.click(`[data-testid="toggle-product-${productId}"]`);

      // Wait for status change
      await expect(
        page.locator(`[data-testid="product-status-${productId}"]`)
      ).toHaveText("Inactive", { timeout: 10000 });

      // Verify in DB
      const isActive = dbQuery(
        `SELECT is_active FROM products WHERE sku='TEST-DEACT-001'`
      );
      expect(isActive).toBe("f");
    });

    test("reactivate product → status changes back to active", async ({
      page,
    }) => {
      // Create and deactivate a product via DB
      dbQuery(
        "INSERT INTO products (id, name, sku, category, price, is_active, created_at, updated_at) VALUES (gen_random_uuid(), 'Test Product Reactivate', 'TEST-REACT-001', 'TWO-WHEELER', 2000, false, NOW(), NOW())"
      );

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      const productId = dbQuery(
        "SELECT id FROM products WHERE sku='TEST-REACT-001'"
      );

      // Should show as Inactive
      await expect(
        page.locator(`[data-testid="product-status-${productId}"]`)
      ).toHaveText("Inactive");

      // Click activate
      await page.click(`[data-testid="toggle-product-${productId}"]`);

      // Wait for status change
      await expect(
        page.locator(`[data-testid="product-status-${productId}"]`)
      ).toHaveText("Active", { timeout: 10000 });

      // Verify in DB
      const isActive = dbQuery(
        `SELECT is_active FROM products WHERE sku='TEST-REACT-001'`
      );
      expect(isActive).toBe("t");
    });
  });

  // ── Pagination ─────────────────────────────────────────────

  test.describe("Pagination", () => {
    test("pagination works with many products", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      // Should see pagination controls (61+ products, 10 per page)
      await expect(page.locator('[data-testid="pagination"]')).toBeVisible();
      await expect(page.locator('[data-testid="next-page"]')).toBeVisible();

      // Count rows on first page — should be exactly 10
      const firstPageRows = page.locator("tbody tr");
      await expect(firstPageRows).toHaveCount(10);

      // Go to page 2
      await page.click('[data-testid="next-page"]');
      await page.waitForURL(/page=2/);
      const secondPageRows = page.locator("tbody tr");
      await expect(secondPageRows).toHaveCount(10);
    });
  });

  // ── Search ─────────────────────────────────────────────────

  test.describe("Search", () => {
    test("search by product name → filters correctly", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await page.fill('[data-testid="search-input"]', "Mileage");
      await page.click('[data-testid="search-button"]');

      // Should show only the Mileage product
      await expect(page.locator("text=Exide Mileage ML 75D23L")).toBeVisible();

      // Other products should not be visible
      await expect(page.locator("text=Exide Inva Master IMTT 1500")).not.toBeVisible();
    });

    test("search by category → filters correctly", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await page.selectOption('[data-testid="category-filter"]', "TWO-WHEELER");

      // Should show TWO-WHEELER products
      await expect(page.getByText("XLTZ5A", { exact: true }).first()).toBeVisible();

      // Non-TWO-WHEELER products should not be visible
      await expect(page.getByText("DRIVE100L", { exact: true })).not.toBeVisible();
    });

    test("search with no results → shows empty state", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await page.fill('[data-testid="search-input"]', "NonExistentProduct12345");
      await page.click('[data-testid="search-button"]');

      await expect(page.locator('[data-testid="no-products"]')).toBeVisible();
      await expect(page.locator('[data-testid="no-products"]')).toContainText(
        "No products found"
      );
    });
  });

  // ── Audit Log ──────────────────────────────────────────────

  test.describe("Audit Log", () => {
    test("product created → audit log entry exists", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      await page.fill('[data-testid="input-name"]', "Test Product Audit Create");
      await page.selectOption('[data-testid="input-category"]', "INVERTER");
      await page.fill('[data-testid="input-price"]', "12000");
      await page.fill('[data-testid="input-sku"]', "TEST-AUDIT-CREATE");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Check audit log in DB
      const auditCount = dbQuery(
        "SELECT COUNT(*) FROM audit_logs WHERE action='PRODUCT_CREATED' AND details LIKE '%Test Product Audit Create%'"
      );
      expect(parseInt(auditCount)).toBeGreaterThanOrEqual(1);
    });

    test("product updated → audit log entry exists", async ({ page }) => {
      // Create product
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      await page.fill('[data-testid="input-name"]', "Test Product Audit Update");
      await page.selectOption('[data-testid="input-category"]', "CAR/SUV");
      await page.fill('[data-testid="input-price"]', "5000");
      await page.fill('[data-testid="input-sku"]', "TEST-AUDIT-UPDATE");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Edit it
      const productId = dbQuery(
        "SELECT id FROM products WHERE sku='TEST-AUDIT-UPDATE'"
      );
      await page.click(`[data-testid="edit-product-${productId}"]`);
      await page.waitForURL(/\/admin\/products\/.+\/edit/);

      await page.fill('[data-testid="input-name"]', "Test Product Audit Updated");
      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Check audit log
      const auditCount = dbQuery(
        "SELECT COUNT(*) FROM audit_logs WHERE action='PRODUCT_UPDATED' AND details LIKE '%Test Product Audit Updated%'"
      );
      expect(parseInt(auditCount)).toBeGreaterThanOrEqual(1);
    });

    test("product deactivated → audit log entry exists", async ({ page }) => {
      // Create product
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      await page.fill('[data-testid="input-name"]', "Test Product Audit Deact");
      await page.selectOption('[data-testid="input-category"]', "LCV");
      await page.fill('[data-testid="input-price"]', "15000");
      await page.fill('[data-testid="input-sku"]', "TEST-AUDIT-DEACT");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      const productId = dbQuery(
        "SELECT id FROM products WHERE sku='TEST-AUDIT-DEACT'"
      );

      // Deactivate
      await page.click(`[data-testid="toggle-product-${productId}"]`);
      await expect(
        page.locator(`[data-testid="product-status-${productId}"]`)
      ).toHaveText("Inactive", { timeout: 10000 });

      // Check audit log
      const auditCount = dbQuery(
        "SELECT COUNT(*) FROM audit_logs WHERE action='PRODUCT_DEACTIVATED' AND details LIKE '%Test Product Audit Deact%'"
      );
      expect(parseInt(auditCount)).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Admin Layout / Navigation ──────────────────────────────

  test.describe("Admin Layout", () => {
    test("sidebar shows correct navigation items", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      await expect(page.locator('[data-testid="admin-sidebar"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-grid"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-package"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-users"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tree"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-settings"]')).toBeVisible();
    });

    test("header shows admin name and logout button", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      await expect(page.locator('[data-testid="admin-header"]')).toBeVisible();
      await expect(page.locator('[data-testid="admin-name"]')).toContainText("Admin");
      await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();
    });

    test("dashboard shows placeholder stats", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      await expect(page.locator('[data-testid="dashboard-title"]')).toHaveText(
        "Admin Dashboard"
      );
      await expect(page.locator('[data-testid="stat-total-products"]')).toBeVisible();
      await expect(page.locator('[data-testid="stat-active-products"]')).toBeVisible();
      await expect(page.locator('[data-testid="stat-total-members"]')).toBeVisible();
      await expect(page.locator('[data-testid="stat-total-sales"]')).toBeVisible();
    });

    test("logout button → redirects to login", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      await page.click('[data-testid="logout-button"]');
      await page.waitForURL("**/login");
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
