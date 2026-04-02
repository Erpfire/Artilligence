import { test, expect } from "@playwright/test";
import { dbQuery, login, resetRateLimiter } from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";

function cleanupTestProducts() {
  dbQuery(
    "DELETE FROM audit_logs WHERE entity='Product' AND entity_id IN (SELECT id FROM products WHERE sku LIKE 'TEST-%')"
  );
  dbQuery("DELETE FROM products WHERE sku LIKE 'TEST-%'");
}

test.describe("Public Product Catalog", () => {
  test.beforeEach(async () => {
    await resetRateLimiter();
  });

  // ── Page Load ──────────────────────────────────────────────

  test("catalog page loads and shows products", async ({ page }) => {
    await page.goto("/products");

    // Page header
    await expect(page.locator("text=Product Catalog")).toBeVisible();
    await expect(page.locator("text=Exide Battery")).toBeVisible();

    // Should show product cards with names from the imported data
    await expect(page.locator("text=XLTZ5A")).toBeVisible();
    await expect(page.locator("text=DRIVE100L")).toBeVisible();
  });

  test("catalog page shows product images", async ({ page }) => {
    await page.goto("/products");

    // Wait for products to load
    await expect(page.locator("text=XLTZ5A")).toBeVisible();

    // Should have product images rendered
    const images = page.locator('img[alt]');
    const count = await images.count();
    expect(count).toBeGreaterThan(0);

    // Check that at least one image has a /products/ src
    const firstImage = images.first();
    const src = await firstImage.getAttribute("src");
    expect(src).toBeTruthy();
  });

  test("catalog page shows price, AH, and warranty", async ({ page }) => {
    await page.goto("/products");

    // Wait for products to load
    await expect(page.locator("text=XLTZ5A")).toBeVisible();

    // Should show MRP label and prices (formatted as INR currency)
    await expect(page.locator("text=MRP").first()).toBeVisible();

    // Should show AH tags
    await expect(page.locator("text=5 AH").first()).toBeVisible();

    // Should show warranty tags
    await expect(page.locator("text=24F+24P warranty").first()).toBeVisible();
  });

  // ── Category Filtering ─────────────────────────────────────

  test("category filter buttons show correct categories", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("text=XLTZ5A")).toBeVisible();

    // Should have "All" button
    await expect(page.locator("button", { hasText: "All" })).toBeVisible();

    // Should have category buttons from imported data
    await expect(page.locator("button", { hasText: "TWO-WHEELER" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^CAR\/SUV \(\d+\)$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^INVERTER \(\d+\)$/ })).toBeVisible();
  });

  test("clicking category filter shows only that category", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("text=XLTZ5A")).toBeVisible();

    // Click TWO-WHEELER filter
    await page.locator("button", { hasText: "TWO-WHEELER" }).click();

    // Should show TWO-WHEELER products
    await expect(page.locator("text=XLTZ5A")).toBeVisible();
    await expect(page.locator("text=XLTZ7")).toBeVisible();

    // Should NOT show products from other categories
    await expect(page.locator("text=DRIVE100L")).not.toBeVisible();
    await expect(page.locator("text=IMTT1500")).not.toBeVisible();
  });

  test("clicking same category again clears filter", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("text=XLTZ5A")).toBeVisible();

    // Click TWO-WHEELER
    await page.locator("button", { hasText: "TWO-WHEELER" }).click();
    await expect(page.locator("text=DRIVE100L")).not.toBeVisible();

    // Click TWO-WHEELER again to clear
    await page.locator("button", { hasText: "TWO-WHEELER" }).click();

    // Should now show all products again
    await expect(page.locator("text=DRIVE100L")).toBeVisible();
  });

  // ── Search ─────────────────────────────────────────────────

  test("search filters products by name", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("text=XLTZ5A")).toBeVisible();

    // Search for "DRIVE"
    await page.fill('input[placeholder*="Search"]', "DRIVE");

    // Should show DRIVE products
    await expect(page.locator("text=DRIVE100L")).toBeVisible();
    await expect(page.locator("text=DRIVE130R")).toBeVisible();

    // Should NOT show non-matching products
    await expect(page.locator("text=XLTZ5A")).not.toBeVisible();
  });

  test("search with no results shows empty state", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("text=XLTZ5A")).toBeVisible();

    await page.fill('input[placeholder*="Search"]', "zzzznonexistent");

    await expect(page.locator("text=No products found")).toBeVisible();
    await expect(page.locator("text=Clear filters")).toBeVisible();
  });

  test("clear filters resets search and category", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("text=XLTZ5A")).toBeVisible();

    // Search for something that returns no results
    await page.fill('input[placeholder*="Search"]', "zzzznonexistent");
    await expect(page.locator("text=No products found")).toBeVisible();

    // Click clear filters
    await page.click("text=Clear filters");

    // Products should be visible again
    await expect(page.locator("text=XLTZ5A")).toBeVisible();
  });

  // ── Products Grouped by Category ───────────────────────────

  test("products are grouped by category with headers", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("text=XLTZ5A")).toBeVisible();

    // Should show category group headers
    await expect(page.locator("h2", { hasText: "TWO-WHEELER" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "CAR/SUV", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "INVERTER BATTERY" })).toBeVisible();
  });

  // ── Navigation ─────────────────────────────────────────────

  test("navbar has Home link back to landing page", async ({ page }) => {
    await page.goto("/products");

    const homeLink = page.locator("a", { hasText: "Home" });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test("navbar has Sign In link", async ({ page }) => {
    await page.goto("/products");

    const signInLink = page.locator("a", { hasText: "Sign In" });
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute("href", "/login");
  });

  test("footer is visible", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("text=XLTZ5A")).toBeVisible();

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator("text=Powered by Exide Industries")).toBeVisible();
  });
});

test.describe("Landing Page → Products Link", () => {
  test("landing page Products nav links to /products", async ({ page }) => {
    await page.goto("/");

    const productsLink = page.locator('a[href="/products"]', { hasText: "Products" });
    await expect(productsLink.first()).toBeVisible();
  });

  test("landing page View All Products button links to /products", async ({ page }) => {
    await page.goto("/");

    // Scroll to the products section
    await page.locator("#products").scrollIntoViewIfNeeded();

    const viewAllButton = page.locator('a[href="/products"]', { hasText: "View All Products" });
    await expect(viewAllButton).toBeVisible();
  });
});

test.describe("Admin Product Form — New Fields", () => {
  test.beforeEach(async () => {
    await resetRateLimiter();
    cleanupTestProducts();
  });

  test.afterAll(() => {
    cleanupTestProducts();
  });

  test("create product with warranty, AH, imageUrl, remark", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin");
    await page.goto("/admin/products/new");

    await page.fill('[data-testid="input-name"]', "Test Product Fields");
    await page.selectOption('[data-testid="input-category"]', "CAR/SUV");
    await page.fill('[data-testid="input-price"]', "5500");
    await page.fill('[data-testid="input-sku"]', "TEST-FIELDS-001");
    await page.fill('[data-testid="input-warranty"]', "36F+24P");
    await page.fill('[data-testid="input-ah"]', "65");
    await page.fill('[data-testid="input-imageUrl"]', "/products/eezy.png");
    await page.fill('[data-testid="input-remark"]', "Test remark");

    await page.click('[data-testid="submit-button"]');
    await page.waitForURL("**/admin/products");

    // Verify in DB
    const row = dbQuery(
      "SELECT warranty, ah, image_url, remark FROM products WHERE sku='TEST-FIELDS-001'"
    );
    expect(row).toContain("36F+24P");
    expect(row).toContain("65");
    expect(row).toContain("/products/eezy.png");
    expect(row).toContain("Test remark");
  });

  test("image preview appears when imageUrl is filled", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin");
    await page.goto("/admin/products/new");

    // No preview initially
    await expect(page.locator('img[alt="Preview"]')).not.toBeVisible();

    // Fill image URL
    await page.fill('[data-testid="input-imageUrl"]', "/products/drive.png");

    // Preview should appear
    await expect(page.locator('img[alt="Preview"]')).toBeVisible();
  });

  test("edit product preserves warranty, AH, imageUrl fields", async ({ page }) => {
    // Create product with new fields
    dbQuery(
      "INSERT INTO products (id, name, sku, category, price, warranty, ah, image_url, remark, is_active, created_at, updated_at) VALUES (gen_random_uuid(), 'Test Product FieldEdit', 'TEST-FIELDEDIT-001', 'CAR/SUV', 7000, '24F+24P', '50', '/products/mileage.png', 'Some remark', true, NOW(), NOW())"
    );

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin");

    const productId = dbQuery(
      "SELECT id FROM products WHERE sku='TEST-FIELDEDIT-001'"
    );
    await page.goto(`/admin/products/${productId}/edit`);
    await page.waitForSelector('[data-testid="edit-product-title"]');

    // Verify fields are pre-filled
    await expect(page.locator('[data-testid="input-warranty"]')).toHaveValue("24F+24P");
    await expect(page.locator('[data-testid="input-ah"]')).toHaveValue("50");
    await expect(page.locator('[data-testid="input-imageUrl"]')).toHaveValue("/products/mileage.png");
    await expect(page.locator('[data-testid="input-remark"]')).toHaveValue("Some remark");

    // Image preview should be visible
    await expect(page.locator('img[alt="Preview"]')).toBeVisible();

    // Update warranty
    await page.fill('[data-testid="input-warranty"]', "48F+18P");
    await page.click('[data-testid="submit-button"]');
    await page.waitForURL("**/admin/products");

    // Verify warranty updated in DB
    const updated = dbQuery(
      "SELECT warranty FROM products WHERE sku='TEST-FIELDEDIT-001'"
    );
    expect(updated).toContain("48F+18P");
  });

  test("admin product table shows image thumbnail", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin");
    await page.goto("/admin/products");

    // Imported products have images — check that thumbnails render
    const thumbnails = page.locator('tbody img[alt]');
    const count = await thumbnails.count();
    expect(count).toBeGreaterThan(0);
  });

  test("product without image shows N/A placeholder in table", async ({ page }) => {
    // Create product without image
    dbQuery(
      "INSERT INTO products (id, name, sku, category, price, is_active, created_at, updated_at) VALUES (gen_random_uuid(), 'Test Product NoImage', 'TEST-NOIMG-001', 'LCV', 5000, true, NOW(), NOW())"
    );

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin");
    await page.goto("/admin/products?search=Test+Product+NoImage");

    // Should show N/A placeholder
    await expect(page.locator("text=N/A").first()).toBeVisible();
  });
});

test.describe("Public API — /api/products", () => {
  test("returns products with expected fields", async ({ request }) => {
    const response = await request.get("/api/products");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.products).toBeDefined();
    expect(data.categories).toBeDefined();
    expect(data.products.length).toBeGreaterThan(0);

    // Check first product has expected fields
    const product = data.products[0];
    expect(product.id).toBeDefined();
    expect(product.name).toBeDefined();
    expect(product.price).toBeDefined();
    expect(product.category).toBeDefined();
  });

  test("category filter works via API", async ({ request }) => {
    const response = await request.get("/api/products?category=TWO-WHEELER");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.products.length).toBeGreaterThan(0);

    // All products should be TWO-WHEELER
    for (const p of data.products) {
      expect(p.category).toBe("TWO-WHEELER");
    }
  });

  test("search filter works via API", async ({ request }) => {
    const response = await request.get("/api/products?search=DRIVE");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.products.length).toBeGreaterThan(0);

    // All results should contain DRIVE
    for (const p of data.products) {
      expect(p.name.toUpperCase()).toContain("DRIVE");
    }
  });

  test("only active products returned", async ({ request }) => {
    const response = await request.get("/api/products");
    const data = await response.json();

    // Create an inactive product and verify it's excluded
    dbQuery(
      "INSERT INTO products (id, name, sku, category, price, is_active, created_at, updated_at) VALUES (gen_random_uuid(), 'Test Inactive Product', 'TEST-INACTIVE-001', 'LCV', 5000, false, NOW(), NOW())"
    );

    const response2 = await request.get("/api/products?search=Test+Inactive+Product");
    const data2 = await response2.json();
    expect(data2.products.length).toBe(0);

    // Cleanup
    dbQuery("DELETE FROM products WHERE sku='TEST-INACTIVE-001'");
  });
});
