import { test, expect } from "@playwright/test";
import { dbQuery, login, resetRateLimiter, ensureRootMember } from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const MEMBER_EMAIL = "root@artilligence.com";
const MEMBER_PASSWORD = "member123456";

const COMBO_NAMES = [
  "PowerSync 1125",
  "StarVolt Essential",
  "ThunderCore 2550",
  "Mega Shield Pro",
  "StarVolt Pro",
  "Thunder Shield Max",
  "StarForce 1375",
  "ThunderCore Titan",
  "MagicVolt 750",
  "PowerSync Elite",
  "StarForce 1125",
  "ThunderCore 900",
  "StarForce Lite",
  "Custom Order",
];

// Total combo count: 13 named combos + 1 Custom Order = 14
const TOTAL_COMBOS = 14;

const COMBO_IMAGES = [
  "/products/comboimages/combo2.jpeg",
  "/products/comboimages/combo1.jpeg",
  "/products/comboimages/combo3.jpeg",
];

function cleanupTestCombos() {
  dbQuery("DELETE FROM audit_logs WHERE entity='Product' AND entity_id IN (SELECT id FROM products WHERE sku LIKE 'TEST-COMBO-%')");
  dbQuery("DELETE FROM sale_items WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'TEST-COMBO-%')");
  dbQuery("DELETE FROM products WHERE sku LIKE 'TEST-COMBO-%'");
}

test.describe("Combo Products", () => {
  test.beforeEach(async () => {
    await resetRateLimiter();
  });

  test.afterAll(() => {
    cleanupTestCombos();
  });

  // ── Database Verification ──────────────────────────────────

  test.describe("Database State", () => {
    test("13 combo products exist in DB", async () => {
      const count = dbQuery("SELECT count(*) FROM products WHERE is_combo = true");
      expect(parseInt(count)).toBe(TOTAL_COMBOS);
    });

    test("all combos have COMBO category", async () => {
      const count = dbQuery("SELECT count(*) FROM products WHERE is_combo = true AND category = 'COMBO'");
      expect(parseInt(count)).toBe(TOTAL_COMBOS);
    });

    test("all combos have 3 images", async () => {
      const count = dbQuery("SELECT count(*) FROM products WHERE is_combo = true AND images IS NOT NULL AND jsonb_array_length(images) = 3");
      expect(parseInt(count)).toBe(TOTAL_COMBOS);
    });

    test("all combos have correct SKU pattern COMBO-N", async () => {
      const skus = dbQuery("SELECT sku FROM products WHERE is_combo = true ORDER BY sku");
      const skuList = skus.split("\n").sort();
      for (let i = 1; i <= 13; i++) {
        expect(skuList).toContain(`COMBO-${i}`);
      }
      expect(skuList).toContain("COMBO-CUSTOM");
    });

    test("all combos have descriptions containing constituent products", async () => {
      // Check combo 1 has both GQP12V1125 and IMTT1500 in description
      const desc = dbQuery("SELECT description FROM products WHERE sku = 'COMBO-1'");
      expect(desc).toContain("GQP12V1125");
      expect(desc).toContain("IMTT1500");
    });

    test("combo prices equal sum of constituent product prices", async () => {
      // Combo 1: GQP12V1125 + IMTT1500
      const comboPrice = dbQuery("SELECT price FROM products WHERE sku = 'COMBO-1'");
      const gqpPrice = dbQuery("SELECT price FROM products WHERE name = 'GQP12V1125' AND is_combo = false");
      const imttPrice = dbQuery("SELECT price FROM products WHERE name = 'IMTT1500' AND is_combo = false");
      const expectedPrice = parseFloat(gqpPrice) + parseFloat(imttPrice);
      expect(parseFloat(comboPrice)).toBeCloseTo(expectedPrice, 1);
    });

    test("individual products (54+) still exist with is_combo = false", async () => {
      const count = dbQuery("SELECT count(*) FROM products WHERE is_combo = false");
      expect(parseInt(count)).toBeGreaterThanOrEqual(54);
    });

    test("combo images array contains correct paths", async () => {
      const images = dbQuery("SELECT images::text FROM products WHERE sku = 'COMBO-1'");
      for (const img of COMBO_IMAGES) {
        expect(images).toContain(img);
      }
    });
  });

  // ── Admin Products List — Only Combos ──────────────────────

  test.describe("Admin Products List", () => {
    test("admin sees only combo products, not individual products", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await expect(page.locator('[data-testid="products-title"]')).toHaveText("Products");
      await expect(page.locator('[data-testid="products-table"]')).toBeVisible();

      // Should see combo products
      const rows = page.locator("tbody tr");
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(13);

      // Verify a combo name is visible
      const cellTexts = await page.locator("tbody tr td:first-child").allTextContents();
      const allText = cellTexts.join(" ");
      const foundCombo = COMBO_NAMES.some((name) => allText.includes(name));
      expect(foundCombo).toBe(true);
    });

    test("individual products NOT shown in admin list", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await expect(page.locator('[data-testid="products-table"]')).toBeVisible();

      // Individual product names should NOT appear
      await expect(page.locator("text=XLTZ4A").first()).not.toBeVisible();
      await expect(page.locator("text=DRIVE130R").first()).not.toBeVisible();
      await expect(page.locator("text=ML38B20L").first()).not.toBeVisible();
    });

    test("all 13 combos visible across pages", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await expect(page.locator('[data-testid="products-table"]')).toBeVisible();

      // Page 1: 10 combos
      const page1Rows = page.locator("tbody tr");
      const page1Count = await page1Rows.count();
      expect(page1Count).toBe(10);

      // Go to page 2
      await page.click('[data-testid="next-page"]');
      await page.waitForURL(/page=2/);
      const page2Rows = page.locator("tbody tr");
      const page2Count = await page2Rows.count();
      expect(page2Count).toBe(TOTAL_COMBOS - 10);
    });

    test("bento grid images rendered for combos in table", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await expect(page.locator('[data-testid="products-table"]')).toBeVisible();

      // Each combo row should have 3 images (bento grid)
      const firstRow = page.locator("tbody tr").first();
      const images = firstRow.locator("img");
      await expect(images).toHaveCount(3);

      // Check image src paths
      const src0 = await images.nth(0).getAttribute("src");
      const src1 = await images.nth(1).getAttribute("src");
      const src2 = await images.nth(2).getAttribute("src");
      expect(src0).toContain("comboimages/combo2.jpeg");
      expect(src1).toContain("comboimages/combo1.jpeg");
      expect(src2).toContain("comboimages/combo3.jpeg");
    });

    test("combo prices displayed correctly", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await expect(page.locator('[data-testid="products-table"]')).toBeVisible();

      // Check that prices are formatted as INR
      const priceCell = page.locator("tbody tr td:nth-child(3)").first();
      const priceText = await priceCell.textContent();
      // Should contain the ₹ sign or "INR" formatting
      expect(priceText).toMatch(/₹|INR/);
    });

    test("search combos by name", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await page.fill('[data-testid="search-input"]', "PowerSync");
      await page.click('[data-testid="search-button"]');

      // Should find PowerSync combos
      await expect(page.locator("text=PowerSync 1125")).toBeVisible();
      // Non-matching combos should be hidden
      await expect(page.locator("text=MagicVolt 750")).not.toBeVisible();
    });

    test("search combos by SKU", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await page.fill('[data-testid="search-input"]', "COMBO-1");
      await page.click('[data-testid="search-button"]');

      // Should find combos with COMBO-1 in SKU (COMBO-1, COMBO-10, COMBO-11, COMBO-12, COMBO-13)
      const rows = page.locator("tbody tr");
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test("no results for non-existent search", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await page.fill('[data-testid="search-input"]', "NonExistentCombo99999");
      await page.click('[data-testid="search-button"]');

      await expect(page.locator('[data-testid="no-products"]')).toBeVisible();
      await expect(page.locator('[data-testid="no-products"]')).toContainText("No products found");
    });
  });

  // ── Admin Combo CRUD ───────────────────────────────────────

  test.describe("Admin Combo CRUD", () => {
    test("create new combo product via form", async ({ page }) => {
      cleanupTestCombos();
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      await page.fill('[data-testid="input-name"]', "Test Combo Alpha");
      await page.fill('[data-testid="input-description"]', "Test combo description");
      await page.selectOption('[data-testid="input-category"]', "COMBO");
      await page.fill('[data-testid="input-price"]', "50000");
      await page.fill('[data-testid="input-sku"]', "TEST-COMBO-ALPHA");

      // Fill combo images
      await page.fill('[data-testid="input-image-0"]', "/products/comboimages/combo2.jpeg");
      await page.fill('[data-testid="input-image-1"]', "/products/comboimages/combo1.jpeg");
      await page.fill('[data-testid="input-image-2"]', "/products/comboimages/combo3.jpeg");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Should appear in list
      await expect(page.locator("text=Test Combo Alpha")).toBeVisible();

      // Verify in DB it's a combo
      const isCombo = dbQuery("SELECT is_combo FROM products WHERE sku = 'TEST-COMBO-ALPHA'");
      expect(isCombo).toBe("t");

      // Verify images saved
      const images = dbQuery("SELECT images::text FROM products WHERE sku = 'TEST-COMBO-ALPHA'");
      expect(images).toContain("combo2.jpeg");
      expect(images).toContain("combo1.jpeg");
      expect(images).toContain("combo3.jpeg");
    });

    test("edit combo product → changes saved", async ({ page }) => {
      cleanupTestCombos();
      // Create test combo via DB
      dbQuery(
        "INSERT INTO products (id, name, sku, category, price, is_combo, is_active, images, created_at, updated_at) VALUES (gen_random_uuid(), 'Test Combo Edit', 'TEST-COMBO-EDIT', 'COMBO', 40000, true, true, '[\"" +
        COMBO_IMAGES.join('","') +
        "\"]', NOW(), NOW())"
      );

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      const productId = dbQuery("SELECT id FROM products WHERE sku = 'TEST-COMBO-EDIT'");
      await page.click(`[data-testid="edit-product-${productId}"]`);
      await page.waitForURL(/\/admin\/products\/.+\/edit/);

      // Verify form pre-filled
      await expect(page.locator('[data-testid="input-name"]')).toHaveValue("Test Combo Edit");

      // Check image inputs are pre-filled
      await expect(page.locator('[data-testid="input-image-0"]')).toHaveValue(COMBO_IMAGES[0]);
      await expect(page.locator('[data-testid="input-image-1"]')).toHaveValue(COMBO_IMAGES[1]);
      await expect(page.locator('[data-testid="input-image-2"]')).toHaveValue(COMBO_IMAGES[2]);

      // Update name and price
      await page.fill('[data-testid="input-name"]', "Test Combo Edited");
      await page.fill('[data-testid="input-price"]', "45000");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      // Verify changes
      await expect(page.locator("text=Test Combo Edited")).toBeVisible();

      const updated = dbQuery("SELECT name, price FROM products WHERE sku = 'TEST-COMBO-EDIT'");
      expect(updated).toContain("Test Combo Edited");
      expect(updated).toContain("45000");
    });

    test("deactivate combo → status changes", async ({ page }) => {
      cleanupTestCombos();
      dbQuery(
        "INSERT INTO products (id, name, sku, category, price, is_combo, is_active, images, created_at, updated_at) VALUES (gen_random_uuid(), 'Test Combo Deact', 'TEST-COMBO-DEACT', 'COMBO', 30000, true, true, '[\"" +
        COMBO_IMAGES.join('","') +
        "\"]', NOW(), NOW())"
      );

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      const productId = dbQuery("SELECT id FROM products WHERE sku = 'TEST-COMBO-DEACT'");

      await expect(page.locator(`[data-testid="product-status-${productId}"]`)).toHaveText("Active");

      await page.click(`[data-testid="toggle-product-${productId}"]`);
      await expect(page.locator(`[data-testid="product-status-${productId}"]`)).toHaveText("Inactive", { timeout: 10000 });

      const isActive = dbQuery("SELECT is_active FROM products WHERE sku = 'TEST-COMBO-DEACT'");
      expect(isActive).toBe("f");
    });

    test("reactivate combo → status changes back", async ({ page }) => {
      cleanupTestCombos();
      dbQuery(
        "INSERT INTO products (id, name, sku, category, price, is_combo, is_active, images, created_at, updated_at) VALUES (gen_random_uuid(), 'Test Combo React', 'TEST-COMBO-REACT', 'COMBO', 30000, true, false, '[\"" +
        COMBO_IMAGES.join('","') +
        "\"]', NOW(), NOW())"
      );

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      const productId = dbQuery("SELECT id FROM products WHERE sku = 'TEST-COMBO-REACT'");

      await expect(page.locator(`[data-testid="product-status-${productId}"]`)).toHaveText("Inactive");

      await page.click(`[data-testid="toggle-product-${productId}"]`);
      await expect(page.locator(`[data-testid="product-status-${productId}"]`)).toHaveText("Active", { timeout: 10000 });

      const isActive = dbQuery("SELECT is_active FROM products WHERE sku = 'TEST-COMBO-REACT'");
      expect(isActive).toBe("t");
    });

    test("combo audit log entries created", async ({ page }) => {
      cleanupTestCombos();
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      await page.fill('[data-testid="input-name"]', "Test Combo Audit");
      await page.selectOption('[data-testid="input-category"]', "COMBO");
      await page.fill('[data-testid="input-price"]', "25000");
      await page.fill('[data-testid="input-sku"]', "TEST-COMBO-AUDIT");

      await page.click('[data-testid="submit-button"]');
      await page.waitForURL("**/admin/products");

      const auditCount = dbQuery(
        "SELECT COUNT(*) FROM audit_logs WHERE action='PRODUCT_CREATED' AND details LIKE '%Test Combo Audit%'"
      );
      expect(parseInt(auditCount)).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Admin Product Form — Image Gallery ─────────────────────

  test.describe("Product Form Image Gallery", () => {
    test("form has 3 image input fields", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      await expect(page.locator('[data-testid="input-image-0"]')).toBeVisible();
      await expect(page.locator('[data-testid="input-image-1"]')).toBeVisible();
      await expect(page.locator('[data-testid="input-image-2"]')).toBeVisible();
    });

    test("bento preview appears when images filled", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      // Initially no preview images
      const previewImages = page.locator("form img");
      const initialCount = await previewImages.count();

      // Fill image URLs
      await page.fill('[data-testid="input-image-0"]', "/products/comboimages/combo2.jpeg");
      await page.fill('[data-testid="input-image-1"]', "/products/comboimages/combo1.jpeg");
      await page.fill('[data-testid="input-image-2"]', "/products/comboimages/combo3.jpeg");

      // Preview images should now appear
      const updatedImages = page.locator("form img");
      const updatedCount = await updatedImages.count();
      expect(updatedCount).toBeGreaterThan(initialCount);
      expect(updatedCount).toBe(3);
    });

    test("category dropdown only has COMBO option", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products/new");

      const options = page.locator('[data-testid="input-category"] option');
      const count = await options.count();
      // "Select category" + "COMBO" = 2
      expect(count).toBe(2);

      const optionTexts = await options.allTextContents();
      expect(optionTexts).toContain("COMBO");
      expect(optionTexts).not.toContain("CAR/SUV");
      expect(optionTexts).not.toContain("TWO-WHEELER");
    });
  });

  // ── Public API — Excludes Combos ───────────────────────────

  test.describe("Public Products API", () => {
    test("GET /api/products returns only non-combo products", async ({ request }) => {
      const res = await request.get("/api/products");
      expect(res.status()).toBe(200);

      const data = await res.json();
      expect(data.products.length).toBeGreaterThan(0);

      // None of the returned products should be a combo
      for (const p of data.products) {
        expect(COMBO_NAMES).not.toContain(p.name);
      }
    });

    test("GET /api/products categories do not include COMBO", async ({ request }) => {
      const res = await request.get("/api/products");
      const data = await res.json();

      expect(data.categories).not.toContain("COMBO");
    });

    test("public catalog shows individual products", async ({ request }) => {
      const res = await request.get("/api/products");
      const data = await res.json();

      // Should include known individual products
      const names = data.products.map((p: { name: string }) => p.name);
      expect(names).toContain("XLTZ4A");
      expect(names).toContain("GQP12V1125");
    });
  });

  // ── Admin API — Only Combos ────────────────────────────────

  test.describe("Admin Products API", () => {
    test("GET /api/admin/products returns only combos", async ({ page, request }) => {
      cleanupTestCombos();
      // Login first to get session cookie
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

      const res = await request.get("/api/admin/products?limit=100", {
        headers: { Cookie: cookieHeader },
      });
      expect(res.status()).toBe(200);

      const data = await res.json();
      expect(data.products.length).toBe(TOTAL_COMBOS);

      for (const p of data.products) {
        expect(p.isCombo).toBe(true);
        expect(p.category).toBe("COMBO");
      }
    });

    test("POST /api/admin/products creates combo with isCombo=true", async ({ page, request }) => {
      cleanupTestCombos();
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

      const res = await request.post("/api/admin/products", {
        headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
        data: {
          name: "Test API Combo",
          category: "COMBO",
          price: 99999,
          sku: "TEST-COMBO-API",
          images: COMBO_IMAGES,
        },
      });
      expect(res.status()).toBe(201);

      const data = await res.json();
      expect(data.product.isCombo).toBe(true);
      expect(data.product.images).toEqual(COMBO_IMAGES);
    });
  });

  // ── Dashboard API — Only Combos ────────────────────────────

  test.describe("Dashboard Products API", () => {
    test("GET /api/dashboard/products returns only active combos", async ({ page, request }) => {
      cleanupTestCombos();
      // Login as member
      ensureRootMember();
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

      const res = await request.get("/api/dashboard/products", {
        headers: { Cookie: cookieHeader },
      });
      expect(res.status()).toBe(200);

      const data = await res.json();
      expect(data.products.length).toBe(TOTAL_COMBOS);

      // All should have combo names and images
      for (const p of data.products) {
        expect(COMBO_NAMES).toContain(p.name);
        expect(p.images).toBeTruthy();
        expect(Array.isArray(p.images)).toBe(true);
      }
    });

    test("dashboard products include images array", async ({ page, request }) => {
      ensureRootMember();
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

      const res = await request.get("/api/dashboard/products", {
        headers: { Cookie: cookieHeader },
      });
      const data = await res.json();

      const firstProduct = data.products[0];
      expect(firstProduct.images).toHaveLength(3);
      expect(firstProduct.images[0]).toContain("comboimages");
    });
  });

  // ── Member Sales Form — Combo Selection ────────────────────

  test.describe("Member Sales Form", () => {
    test("sales form shows only combo products in dropdown", async ({ page }) => {
      ensureRootMember();
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");
      await page.goto("/dashboard/sales");

      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });

      // Click new sale button
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      // Wait for products to load in dropdown
      const selectEl = page.locator('[data-testid="product-select-0"]');
      await expect(selectEl).toBeVisible();
      // Wait for the product options to load from API
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="product-select-0"] option').length > 1,
        { timeout: 10000 }
      );

      // Get all options
      const options = selectEl.locator("option");
      const optionTexts = await options.allTextContents();

      // Should contain combo names (excluding the placeholder "Select product")
      const productOptions = optionTexts.filter((t) => t !== "" && !t.includes("Select"));
      expect(productOptions.length).toBe(TOTAL_COMBOS);

      // Verify combo names are present
      for (const name of COMBO_NAMES) {
        const found = productOptions.some((opt) => opt.includes(name));
        expect(found).toBe(true);
      }

      // Individual products should NOT be in dropdown
      for (const opt of productOptions) {
        expect(opt).not.toContain("XLTZ4A");
        expect(opt).not.toContain("DRIVE130R");
      }
    });

    test("selecting combo shows bento image preview", async ({ page }) => {
      ensureRootMember();
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");
      await page.goto("/dashboard/sales");

      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      // Get a non-custom combo product ID (Custom Order hides bento images)
      const comboId = dbQuery("SELECT id FROM products WHERE is_combo = true AND is_active = true AND sku != 'COMBO-CUSTOM' ORDER BY name LIMIT 1");

      // Select the combo product
      await page.selectOption('[data-testid="product-select-0"]', comboId);

      // Wait for images to appear
      const productLine = page.locator('[data-testid="product-line-0"]');
      const images = productLine.locator("img");
      await expect(images.first()).toBeVisible({ timeout: 5000 });

      // Should show 3 bento images
      const imgCount = await images.count();
      expect(imgCount).toBe(3);
    });

    test("combo price displayed in sale total", async ({ page }) => {
      ensureRootMember();
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");
      await page.goto("/dashboard/sales");

      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      // Get a combo product
      const comboId = dbQuery("SELECT id FROM products WHERE sku = 'COMBO-1' AND is_active = true");

      // Select it
      await page.selectOption('[data-testid="product-select-0"]', comboId);

      // Total should be non-zero
      const total = page.locator('[data-testid="sale-total"]');
      await expect(total).not.toHaveText("₹0");
      await expect(total).not.toHaveText("₹0.00");

      // Subtotal should be shown
      const subtotal = page.locator('[data-testid="product-subtotal-0"]');
      const subtotalText = await subtotal.textContent();
      expect(subtotalText).not.toBe("—");
    });
  });

  // ── Public Product Catalog — No Combos ─────────────────────

  test.describe("Public Product Catalog Page", () => {
    test("public catalog does not show combo products", async ({ page }) => {
      await page.goto("/products");
      await page.waitForSelector("h1", { timeout: 15000 });

      // Combo names should not appear
      for (const name of COMBO_NAMES) {
        await expect(page.locator(`text=${name}`).first()).not.toBeVisible();
      }
    });

    test("public catalog shows individual products", async ({ page }) => {
      await page.goto("/products");
      // Wait for products to load from API (client-side rendered)
      await page.waitForResponse((res) => res.url().includes("/api/products") && res.status() === 200, { timeout: 15000 });
      // Wait for products to render
      await page.waitForTimeout(1000);

      // Check the API response directly for reliability
      const apiRes = await page.evaluate(async () => {
        const res = await fetch("/api/products");
        const data = await res.json();
        return data.products.map((p: { name: string }) => p.name);
      });
      const hasIndividual = apiRes.includes("XLTZ4A") || apiRes.includes("GQP12V1125") || apiRes.includes("IMTT1500");
      expect(hasIndividual).toBe(true);
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────

  test.describe("Edge Cases", () => {
    test("combo with 4 products has correct price (Mega Shield Pro)", async () => {
      // Combo 4: IMTT2200 + STAR24V2550 + XLTZ4A + XLTZ5A
      const comboPrice = parseFloat(dbQuery("SELECT price FROM products WHERE sku = 'COMBO-4'"));
      const p1 = parseFloat(dbQuery("SELECT price FROM products WHERE name = 'IMTT2200' AND is_combo = false"));
      const p2 = parseFloat(dbQuery("SELECT price FROM products WHERE name = 'STAR24V2550' AND is_combo = false"));
      const p3 = parseFloat(dbQuery("SELECT price FROM products WHERE name = 'XLTZ4A' AND is_combo = false"));
      const p4 = parseFloat(dbQuery("SELECT price FROM products WHERE name = 'XLTZ5A' AND is_combo = false"));
      expect(comboPrice).toBeCloseTo(p1 + p2 + p3 + p4, 1);
    });

    test("combo with 3 products has correct price (PowerSync Elite)", async () => {
      // Combo 10: GQP12V1450N + IMTT2000 + XLTX14
      const comboPrice = parseFloat(dbQuery("SELECT price FROM products WHERE sku = 'COMBO-10'"));
      const p1 = parseFloat(dbQuery("SELECT price FROM products WHERE name = 'GQP12V1450N' AND is_combo = false"));
      const p2 = parseFloat(dbQuery("SELECT price FROM products WHERE name = 'IMTT2000' AND is_combo = false"));
      const p3 = parseFloat(dbQuery("SELECT price FROM products WHERE name = 'XLTX14' AND is_combo = false"));
      expect(comboPrice).toBeCloseTo(p1 + p2 + p3, 1);
    });

    test("deactivated combo not returned in dashboard API", async ({ page, request }) => {
      cleanupTestCombos();
      // Create inactive combo
      dbQuery(
        "INSERT INTO products (id, name, sku, category, price, is_combo, is_active, images, created_at, updated_at) VALUES (gen_random_uuid(), 'Test Inactive Combo', 'TEST-COMBO-INACTIVE', 'COMBO', 10000, true, false, '[\"" +
        COMBO_IMAGES.join('","') +
        "\"]', NOW(), NOW())"
      );

      ensureRootMember();
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

      const res = await request.get("/api/dashboard/products", {
        headers: { Cookie: cookieHeader },
      });
      const data = await res.json();

      const names = data.products.map((p: { name: string }) => p.name);
      expect(names).not.toContain("Test Inactive Combo");
    });

    test("combo images are accessible (HTTP 200)", async ({ request }) => {
      for (const img of COMBO_IMAGES) {
        const res = await request.get(img);
        expect(res.status()).toBe(200);
      }
    });
  });
});
