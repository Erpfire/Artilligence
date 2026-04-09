import { test, expect } from "@playwright/test";
import { dbQuery, login, resetRateLimiter, ensureRootMember } from "./helpers";

const MEMBER_EMAIL = "root@artilligence.com";
const MEMBER_PASSWORD = "member123456";
const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";

function cleanupCustomOrderSales() {
  const customProductId = dbQuery("SELECT id FROM products WHERE sku = 'COMBO-CUSTOM'");
  if (customProductId) {
    // Clean up sales that contain custom order items
    dbQuery(`DELETE FROM sale_flags WHERE sale_id IN (SELECT sale_id FROM sale_items WHERE product_id = '${customProductId}')`);
    dbQuery(`DELETE FROM commissions WHERE sale_id IN (SELECT sale_id FROM sale_items WHERE product_id = '${customProductId}')`);
    dbQuery(`DELETE FROM wallet_transactions WHERE reference_id IN (SELECT id FROM commissions WHERE sale_id IN (SELECT sale_id FROM sale_items WHERE product_id = '${customProductId}'))`);
    const saleIds = dbQuery(`SELECT sale_id FROM sale_items WHERE product_id = '${customProductId}'`);
    if (saleIds.trim()) {
      for (const saleId of saleIds.split("\n")) {
        if (saleId.trim()) {
          dbQuery(`DELETE FROM sale_items WHERE sale_id = '${saleId.trim()}'`);
          dbQuery(`DELETE FROM sales WHERE id = '${saleId.trim()}'`);
        }
      }
    }
  }
}

test.describe("Custom Order", () => {
  test.beforeEach(async () => {
    await resetRateLimiter();
    ensureRootMember();
  });

  test.afterAll(() => {
    cleanupCustomOrderSales();
  });

  // ── Database ───────────────────────────────────────────────

  test.describe("Database", () => {
    test("Custom Order product exists with correct attributes", async () => {
      const row = dbQuery("SELECT name, sku, price, is_combo, is_active, category FROM products WHERE sku = 'COMBO-CUSTOM'");
      expect(row).toContain("Custom Order");
      expect(row).toContain("COMBO-CUSTOM");
      expect(row).toContain("0.00");
      expect(row).toContain("t"); // is_combo = true
      expect(row).toContain("COMBO");
    });

    test("sale_items table has remark column", async () => {
      // Just verify the column exists by querying it
      const result = dbQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'remark'");
      expect(result).toBe("remark");
    });
  });

  // ── Dashboard API ──────────────────────────────────────────

  test.describe("Dashboard API", () => {
    test("Custom Order appears in dashboard products", async ({ page, request }) => {
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

      const res = await request.get("/api/dashboard/products", {
        headers: { Cookie: cookieHeader },
      });
      const data = await res.json();

      const customProduct = data.products.find((p: { name: string }) => p.name === "Custom Order");
      expect(customProduct).toBeTruthy();
      expect(customProduct.sku).toBe("COMBO-CUSTOM");
      expect(parseFloat(customProduct.price)).toBe(0);
    });
  });

  // ── Sales Form UI ──────────────────────────────────────────

  test.describe("Sales Form UI", () => {
    test("Custom Order appears in product dropdown", async ({ page }) => {
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");
      await page.goto("/dashboard/sales");
      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      // Wait for products to load
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="product-select-0"] option').length > 1,
        { timeout: 10000 }
      );

      const options = await page.locator('[data-testid="product-select-0"] option').allTextContents();
      const hasCustom = options.some((o) => o.includes("Custom Order"));
      expect(hasCustom).toBe(true);
    });

    test("selecting Custom Order shows price and description fields", async ({ page }) => {
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");
      await page.goto("/dashboard/sales");
      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="product-select-0"] option').length > 1,
        { timeout: 10000 }
      );

      // Select Custom Order
      const customId = dbQuery("SELECT id FROM products WHERE sku = 'COMBO-CUSTOM'");
      await page.selectOption('[data-testid="product-select-0"]', customId);

      // Custom price and remark fields should appear
      await expect(page.locator('[data-testid="custom-price-0"]')).toBeVisible();
      await expect(page.locator('[data-testid="custom-remark-0"]')).toBeVisible();
    });

    test("custom fields hidden when non-custom product selected", async ({ page }) => {
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");
      await page.goto("/dashboard/sales");
      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="product-select-0"] option').length > 1,
        { timeout: 10000 }
      );

      // Select a regular combo
      const comboId = dbQuery("SELECT id FROM products WHERE sku = 'COMBO-1'");
      await page.selectOption('[data-testid="product-select-0"]', comboId);

      // Custom fields should NOT be visible
      await expect(page.locator('[data-testid="custom-price-0"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="custom-remark-0"]')).not.toBeVisible();
    });

    test("custom price reflects in subtotal and total", async ({ page }) => {
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");
      await page.goto("/dashboard/sales");
      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="product-select-0"] option').length > 1,
        { timeout: 10000 }
      );

      const customId = dbQuery("SELECT id FROM products WHERE sku = 'COMBO-CUSTOM'");
      await page.selectOption('[data-testid="product-select-0"]', customId);

      // Enter custom price
      await page.fill('[data-testid="custom-price-0"]', "25000");

      // Subtotal should show 25000
      const subtotal = await page.locator('[data-testid="product-subtotal-0"]').textContent();
      expect(subtotal).toContain("25,000");

      // Total should reflect the same
      const total = await page.locator('[data-testid="sale-total"]').textContent();
      expect(total).toContain("25,000");
    });

    test("Custom Order line has amber styling", async ({ page }) => {
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");
      await page.goto("/dashboard/sales");
      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="product-select-0"] option').length > 1,
        { timeout: 10000 }
      );

      const customId = dbQuery("SELECT id FROM products WHERE sku = 'COMBO-CUSTOM'");
      await page.selectOption('[data-testid="product-select-0"]', customId);

      // Check the line has amber border styling
      const lineEl = page.locator('[data-testid="product-line-0"]');
      const classes = await lineEl.getAttribute("class");
      expect(classes).toContain("border-amber");
    });

    test("switching from Custom Order to regular combo hides fields", async ({ page }) => {
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");
      await page.goto("/dashboard/sales");
      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="product-select-0"] option').length > 1,
        { timeout: 10000 }
      );

      // Select custom order first
      const customId = dbQuery("SELECT id FROM products WHERE sku = 'COMBO-CUSTOM'");
      await page.selectOption('[data-testid="product-select-0"]', customId);
      await expect(page.locator('[data-testid="custom-price-0"]')).toBeVisible();

      // Fill some data
      await page.fill('[data-testid="custom-price-0"]', "15000");
      await page.fill('[data-testid="custom-remark-0"]', "Test products");

      // Switch to regular combo
      const comboId = dbQuery("SELECT id FROM products WHERE sku = 'COMBO-1'");
      await page.selectOption('[data-testid="product-select-0"]', comboId);

      // Custom fields should disappear
      await expect(page.locator('[data-testid="custom-price-0"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="custom-remark-0"]')).not.toBeVisible();
    });

    test("Custom Order dropdown option does not show price", async ({ page }) => {
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");
      await page.goto("/dashboard/sales");
      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="product-select-0"] option').length > 1,
        { timeout: 10000 }
      );

      // Custom Order option should NOT show "₹0" price
      const options = await page.locator('[data-testid="product-select-0"] option').allTextContents();
      const customOption = options.find((o) => o.includes("Custom Order"));
      expect(customOption).toBeTruthy();
      expect(customOption).not.toContain("₹");
      expect(customOption).not.toContain("0.00");
    });
  });

  // ── Sale Submission API ────────────────────────────────────

  test.describe("Sale Submission", () => {
    test("API rejects custom order without price", async ({ page, request }) => {
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

      const customId = dbQuery("SELECT id FROM products WHERE sku = 'COMBO-CUSTOM'");

      const formData = new FormData();
      formData.append("billCode", "MB-99901");
      formData.append("saleDate", "2026-04-08");
      formData.append("customerName", "Test Customer");
      formData.append("customerPhone", "+919876543210");
      formData.append("items", JSON.stringify([{ productId: customId, quantity: 1 }]));
      // Create a minimal test image
      const blob = new Blob(["fake"], { type: "image/jpeg" });
      formData.append("billPhoto", blob, "test.jpg");

      const res = await request.post("/api/dashboard/sales", {
        headers: { Cookie: cookieHeader },
        multipart: {
          billCode: "MB-99901",
          saleDate: "2026-04-08",
          customerName: "Test Customer",
          customerPhone: "+919876543210",
          items: JSON.stringify([{ productId: customId, quantity: 1 }]),
          billPhoto: { name: "test.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fake-jpeg-data") },
        },
      });

      const data = await res.json();
      expect(res.status()).toBe(400);
      expect(data.errors.items).toContain("Custom order requires a valid price");
    });

    test("API rejects custom order without remark", async ({ page, request }) => {
      await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
      await page.waitForURL("**/dashboard");

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

      const customId = dbQuery("SELECT id FROM products WHERE sku = 'COMBO-CUSTOM'");

      const res = await request.post("/api/dashboard/sales", {
        headers: { Cookie: cookieHeader },
        multipart: {
          billCode: "MB-99902",
          saleDate: "2026-04-08",
          customerName: "Test Customer",
          customerPhone: "+919876543210",
          items: JSON.stringify([{ productId: customId, quantity: 1, customPrice: 25000 }]),
          billPhoto: { name: "test.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fake-jpeg-data") },
        },
      });

      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data.errors.items).toContain("Custom order requires a description");
    });
  });

  // ── Admin Visibility ───────────────────────────────────────

  test.describe("Admin Visibility", () => {
    test("Custom Order visible in admin products list", async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      await page.goto("/admin/products");

      await expect(page.locator('[data-testid="products-table"]')).toBeVisible();

      // Search for Custom Order
      await page.fill('[data-testid="search-input"]', "Custom Order");
      await page.click('[data-testid="search-button"]');

      await expect(page.locator("text=Custom Order")).toBeVisible();
      await expect(page.locator("text=COMBO-CUSTOM")).toBeVisible();
    });
  });
});
