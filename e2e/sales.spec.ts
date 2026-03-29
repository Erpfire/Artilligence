import { test, expect } from "@playwright/test";
import {
  resetTestData,
  login,
  dbQuery,
  resetRateLimiter,
} from "./helpers";
import path from "path";
import { writeFileSync, mkdirSync } from "fs";

const MEMBER_EMAIL = "root@artilligence.com";
const MEMBER_PASSWORD = "member123456";

// ── Test file generators ──

const TEST_FILES_DIR = "/tmp/artilligence-test-files";

function ensureTestFiles() {
  mkdirSync(TEST_FILES_DIR, { recursive: true });

  // Valid JPG (minimal JFIF)
  const jpgBytes = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  writeFileSync(path.join(TEST_FILES_DIR, "receipt.jpg"), jpgBytes);

  // Valid PNG (minimal 1x1 pixel)
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  writeFileSync(path.join(TEST_FILES_DIR, "receipt.png"), pngBytes);

  // Valid PDF (minimal)
  const pdfContent = Buffer.from(
    "%PDF-1.0\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
  );
  writeFileSync(path.join(TEST_FILES_DIR, "receipt.pdf"), pdfContent);

  // Fake EXE disguised as .jpg (MZ header)
  const exeBytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  writeFileSync(path.join(TEST_FILES_DIR, "fake.jpg"), exeBytes);

  // Large file (>5MB): just create header with fake size reference
  const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 0); // 6MB of zeros
  // Add JPG header so it passes type check but fails size check
  largeBuffer[0] = 0xff;
  largeBuffer[1] = 0xd8;
  largeBuffer[2] = 0xff;
  writeFileSync(path.join(TEST_FILES_DIR, "large.jpg"), largeBuffer);
}

// ── Helper: ensure products exist and return first product ID ──

function getFirstProductId(): string {
  return dbQuery("SELECT id FROM products WHERE is_active=true ORDER BY name LIMIT 1");
}

function getProductIds(): string[] {
  return dbQuery("SELECT id FROM products WHERE is_active=true ORDER BY name LIMIT 3")
    .split("\n")
    .filter(Boolean);
}

function cleanSalesData() {
  dbQuery("DELETE FROM sale_flags");
  dbQuery("DELETE FROM sale_items");
  dbQuery("DELETE FROM sales");
}

// ── Helper: submit a sale via the form ──

async function goToSalesPage(page: any) {
  await page.waitForURL("**/dashboard*", { timeout: 10000 });
  await page.goto("/dashboard/sales");
  await page.waitForSelector('[data-testid="sales-page"]', { timeout: 10000 });
}

async function submitSaleViaForm(
  page: any,
  opts: {
    billCode: string;
    saleDate?: string;
    productIndex?: number;
    quantity?: number;
    customerName?: string;
    customerPhone?: string;
    photoFile?: string;
  }
) {
  // Click submit sale button
  await page.getByTestId("submit-sale-button").click();
  await expect(page.getByTestId("sale-form")).toBeVisible();

  // Wait for products to load in dropdown
  await page.waitForFunction(() => {
    const sel = document.querySelector('[data-testid="product-select-0"]') as HTMLSelectElement;
    return sel && sel.options.length > 1;
  }, { timeout: 10000 });

  // Fill bill code
  await page.getByTestId("input-billCode").fill(opts.billCode);

  // Fill sale date
  if (opts.saleDate) {
    await page.getByTestId("input-saleDate").fill(opts.saleDate);
  }

  // Select product
  if (opts.productIndex !== undefined) {
    await page.getByTestId("product-select-0").selectOption({ index: opts.productIndex + 1 });
  } else {
    await page.getByTestId("product-select-0").selectOption({ index: 1 });
  }

  // Set quantity
  if (opts.quantity) {
    await page.getByTestId("product-qty-0").fill(String(opts.quantity));
  }

  // Fill customer info
  await page.getByTestId("input-customerName").fill(opts.customerName || "Test Customer");
  await page.getByTestId("input-customerPhone").fill(opts.customerPhone || "+919876543210");

  // Upload photo
  if (opts.photoFile) {
    await page.getByTestId("input-billPhoto").setInputFiles(opts.photoFile);
  }
}

// ──────────────────────────────────────────────────────────────────

test.describe("Sales Submission", () => {
  test.beforeAll(() => {
    ensureTestFiles();
  });

  test.beforeEach(async () => {
    resetTestData();
    cleanSalesData();
    await resetRateLimiter();
  });

  // ── Submit sale with all valid fields → status "Pending" ──

  test("submit sale with all valid fields → status Pending", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "MB-10001",
      saleDate: "2026-03-25",
      customerName: "Rahul Sharma",
      customerPhone: "+919876543210",
      photoFile: path.join(TEST_FILES_DIR, "receipt.jpg"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("sale-success")).toBeVisible({ timeout: 10000 });

    // Verify sale appears in DB
    const saleStatus = dbQuery(
      "SELECT status FROM sales WHERE bill_code='MB-10001'"
    );
    expect(saleStatus).toBe("PENDING");
  });

  // ── Submit sale → appears in "Pending" tab ──

  test("submitted sale appears in Pending tab", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "MB-10002",
      saleDate: "2026-03-25",
      photoFile: path.join(TEST_FILES_DIR, "receipt.jpg"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("sale-success")).toBeVisible({ timeout: 10000 });

    // Wait for redirect back to list
    await page.waitForSelector('[data-testid="sales-tabs"]', { timeout: 5000 });

    // Click Pending tab
    await page.getByTestId("tab-PENDING").click();
    await expect(page.getByTestId("sales-list")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("MB-10002")).toBeVisible();
  });

  // ── Validation: missing bill code ──

  test("submit sale with missing bill code → validation error", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);
    await page.getByTestId("submit-sale-button").click();

    // Leave billCode empty, fill everything else
    await page.getByTestId("input-saleDate").fill("2026-03-25");
    await page.getByTestId("product-select-0").selectOption({ index: 1 });
    await page.getByTestId("input-customerName").fill("Test");
    await page.getByTestId("input-customerPhone").fill("+919876543210");
    await page.getByTestId("input-billPhoto").setInputFiles(path.join(TEST_FILES_DIR, "receipt.jpg"));

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("error-billCode")).toBeVisible();
  });

  // ── Validation: missing product ──

  test("submit sale with no product selected → validation error", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);
    await page.getByTestId("submit-sale-button").click();

    await page.getByTestId("input-billCode").fill("MB-10003");
    await page.getByTestId("input-saleDate").fill("2026-03-25");
    // Don't select any product
    await page.getByTestId("input-customerName").fill("Test");
    await page.getByTestId("input-customerPhone").fill("+919876543210");
    await page.getByTestId("input-billPhoto").setInputFiles(path.join(TEST_FILES_DIR, "receipt.jpg"));

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("error-items")).toBeVisible();
  });

  // ── Validation: missing customer name ──

  test("submit sale with missing customer name → validation error", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);
    await page.getByTestId("submit-sale-button").click();

    await page.getByTestId("input-billCode").fill("MB-10004");
    await page.getByTestId("input-saleDate").fill("2026-03-25");
    await page.getByTestId("product-select-0").selectOption({ index: 1 });
    await page.getByTestId("input-customerPhone").fill("+919876543210");
    await page.getByTestId("input-billPhoto").setInputFiles(path.join(TEST_FILES_DIR, "receipt.jpg"));

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("error-customerName")).toBeVisible();
  });

  // ── Validation: missing photo ──

  test("submit sale with missing photo → validation error", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);
    await page.getByTestId("submit-sale-button").click();

    await page.getByTestId("input-billCode").fill("MB-10005");
    await page.getByTestId("input-saleDate").fill("2026-03-25");
    await page.getByTestId("product-select-0").selectOption({ index: 1 });
    await page.getByTestId("input-customerName").fill("Test");
    await page.getByTestId("input-customerPhone").fill("+919876543210");
    // Don't upload photo

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("error-billPhoto")).toBeVisible();
  });

  // ── Validation: future date ──

  test("submit sale with future date → validation error", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);
    await page.getByTestId("submit-sale-button").click();

    await page.getByTestId("input-billCode").fill("MB-10006");
    await page.getByTestId("input-saleDate").fill("2030-12-31");
    await page.getByTestId("product-select-0").selectOption({ index: 1 });
    await page.getByTestId("input-customerName").fill("Test");
    await page.getByTestId("input-customerPhone").fill("+919876543210");
    await page.getByTestId("input-billPhoto").setInputFiles(path.join(TEST_FILES_DIR, "receipt.jpg"));

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("error-saleDate")).toBeVisible();
  });

  // ── Validation: duplicate bill code ──

  test("submit sale with duplicate bill code → error", async ({ page }) => {
    // Insert a sale directly in DB
    const memberId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
    const productId = getFirstProductId();
    dbQuery(
      `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at) VALUES (gen_random_uuid(), '${memberId}', 'MB-99999', 10000, 'Existing', '+919999999999', '2026-03-20', 'PENDING', NOW() - interval '1 hour', NOW())`
    );

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "MB-99999",
      saleDate: "2026-03-25",
      photoFile: path.join(TEST_FILES_DIR, "receipt.jpg"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("error-billCode")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("error-billCode")).toContainText("already");
  });

  // ── Validation: invalid bill code format ──

  test("submit sale with invalid bill code format → error", async ({ page }) => {
    // Ensure format setting exists (seed has ^MB-\\d{5,}$)
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "INVALID",
      saleDate: "2026-03-25",
      photoFile: path.join(TEST_FILES_DIR, "receipt.jpg"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("error-billCode")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("error-billCode")).toContainText("format");
  });

  // ── Rate limiting: daily limit ──

  test("rate limiting: submit 6 sales in a day (limit=5) → 6th blocked", async ({ page }) => {
    // Set daily limit to 5
    dbQuery("UPDATE app_settings SET value='5' WHERE key='daily_sale_limit'");
    dbQuery("UPDATE app_settings SET value='0' WHERE key='min_sale_gap_minutes'");

    const memberId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
    const productId = getFirstProductId();

    // Insert 5 sales today
    for (let i = 0; i < 5; i++) {
      dbQuery(
        `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, sale_date, status, created_at, updated_at) VALUES (gen_random_uuid(), '${memberId}', 'MB-8000${i}', 10000, 'Rate Limit Test', '2026-03-25', 'PENDING', NOW(), NOW())`
      );
    }

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "MB-80099",
      saleDate: "2026-03-25",
      photoFile: path.join(TEST_FILES_DIR, "receipt.jpg"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("sale-form-error")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("sale-form-error")).toContainText("maximum");
  });

  // ── Rate limiting: min gap ──

  test("rate limiting: submit 2 sales within min gap → 2nd blocked", async ({ page }) => {
    dbQuery("UPDATE app_settings SET value='60' WHERE key='min_sale_gap_minutes'");

    const memberId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
    // Insert a sale just now
    dbQuery(
      `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, sale_date, status, created_at, updated_at) VALUES (gen_random_uuid(), '${memberId}', 'MB-90001', 10000, 'Gap Test', '2026-03-25', 'PENDING', NOW(), NOW())`
    );

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "MB-90002",
      saleDate: "2026-03-25",
      photoFile: path.join(TEST_FILES_DIR, "receipt.jpg"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("sale-form-error")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("sale-form-error")).toContainText("wait");
  });

  // ── File upload: JPG accepted ──

  test("file upload: JPG accepted", async ({ page }) => {
    dbQuery("UPDATE app_settings SET value='0' WHERE key='min_sale_gap_minutes'");
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "MB-20001",
      saleDate: "2026-03-25",
      photoFile: path.join(TEST_FILES_DIR, "receipt.jpg"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("sale-success")).toBeVisible({ timeout: 10000 });
  });

  // ── File upload: PNG accepted ──

  test("file upload: PNG accepted", async ({ page }) => {
    dbQuery("UPDATE app_settings SET value='0' WHERE key='min_sale_gap_minutes'");
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "MB-20002",
      saleDate: "2026-03-25",
      photoFile: path.join(TEST_FILES_DIR, "receipt.png"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("sale-success")).toBeVisible({ timeout: 10000 });
  });

  // ── File upload: PDF accepted ──

  test("file upload: PDF accepted", async ({ page }) => {
    dbQuery("UPDATE app_settings SET value='0' WHERE key='min_sale_gap_minutes'");
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "MB-20003",
      saleDate: "2026-03-25",
      photoFile: path.join(TEST_FILES_DIR, "receipt.pdf"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("sale-success")).toBeVisible({ timeout: 10000 });
  });

  // ── File upload: .exe renamed to .jpg → rejected (magic byte check) ──

  test("file upload: .exe renamed to .jpg → rejected (magic byte check)", async ({ page }) => {
    dbQuery("UPDATE app_settings SET value='0' WHERE key='min_sale_gap_minutes'");
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "MB-20004",
      saleDate: "2026-03-25",
      photoFile: path.join(TEST_FILES_DIR, "fake.jpg"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("error-billPhoto")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("error-billPhoto")).toContainText("Invalid file type");
  });

  // ── File upload: >5MB rejected ──

  test("file upload: >5MB file → rejected (size limit)", async ({ page }) => {
    dbQuery("UPDATE app_settings SET value='0' WHERE key='min_sale_gap_minutes'");
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    await submitSaleViaForm(page, {
      billCode: "MB-20005",
      saleDate: "2026-03-25",
      photoFile: path.join(TEST_FILES_DIR, "large.jpg"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("error-billPhoto")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("error-billPhoto")).toContainText("5MB");
  });

  // ── Multi-product: add 3 products → total calculates correctly ──

  test("multi-product sale: add 3 products → total calculates correctly", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);
    await page.getByTestId("submit-sale-button").click();
    await expect(page.getByTestId("sale-form")).toBeVisible();

    // Wait for products to load
    await page.waitForFunction(() => {
      const sel = document.querySelector('[data-testid="product-select-0"]') as HTMLSelectElement;
      return sel && sel.options.length > 1;
    });

    // Select first product, qty 2
    await page.getByTestId("product-select-0").selectOption({ index: 1 });
    await page.getByTestId("product-qty-0").fill("2");

    // Add second product
    await page.getByTestId("add-product-button").click();
    await page.getByTestId("product-select-1").selectOption({ index: 2 });
    await page.getByTestId("product-qty-1").fill("1");

    // Add third product
    await page.getByTestId("add-product-button").click();
    await page.getByTestId("product-select-2").selectOption({ index: 3 });
    await page.getByTestId("product-qty-2").fill("1");

    // Verify total exists and shows a non-zero value
    const totalText = await page.getByTestId("sale-total").textContent();
    expect(totalText).toMatch(/₹[\d,]+\.\d{2}/);
    expect(totalText).not.toBe("₹0.00");
  });

  // ── Remove product from multi-product sale → total recalculates ──

  test("remove product from multi-product sale → total recalculates", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);
    await page.getByTestId("submit-sale-button").click();

    await page.waitForFunction(() => {
      const sel = document.querySelector('[data-testid="product-select-0"]') as HTMLSelectElement;
      return sel && sel.options.length > 1;
    });

    // Select first product
    await page.getByTestId("product-select-0").selectOption({ index: 1 });

    // Add second product
    await page.getByTestId("add-product-button").click();
    await page.getByTestId("product-select-1").selectOption({ index: 2 });

    const totalBefore = await page.getByTestId("sale-total").textContent();

    // Remove second product
    await page.getByTestId("product-remove-1").click();

    const totalAfter = await page.getByTestId("sale-total").textContent();
    expect(totalAfter).not.toBe(totalBefore);
  });

  // ── Tab filters: pending tab shows only pending sales ──

  test("tab filters: pending tab shows only pending sales", async ({ page }) => {
    const memberId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
    // Insert sales with different statuses
    dbQuery(`INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, sale_date, status, created_at, updated_at) VALUES (gen_random_uuid(), '${memberId}', 'MB-TAB01', 10000, 'Pending Sale', '2026-03-20', 'PENDING', NOW() - interval '2 hours', NOW())`);
    dbQuery(`INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, sale_date, status, created_at, updated_at) VALUES (gen_random_uuid(), '${memberId}', 'MB-TAB02', 10000, 'Approved Sale', '2026-03-20', 'APPROVED', NOW() - interval '2 hours', NOW())`);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);
    await page.waitForSelector('[data-testid="sales-tabs"]');

    // All tab should show both
    await expect(page.getByText("MB-TAB01")).toBeVisible();
    await expect(page.getByText("MB-TAB02")).toBeVisible();

    // Pending tab shows only pending
    await page.getByTestId("tab-PENDING").click();
    await expect(page.getByText("MB-TAB01")).toBeVisible();
    await expect(page.getByText("MB-TAB02")).not.toBeVisible();
  });

  // ── Tab filters: approved tab shows only approved sales ──

  test("tab filters: approved tab shows only approved sales", async ({ page }) => {
    const memberId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
    dbQuery(`INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, sale_date, status, created_at, updated_at) VALUES (gen_random_uuid(), '${memberId}', 'MB-TAB03', 10000, 'Pending', '2026-03-20', 'PENDING', NOW() - interval '2 hours', NOW())`);
    dbQuery(`INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, sale_date, status, created_at, updated_at) VALUES (gen_random_uuid(), '${memberId}', 'MB-TAB04', 10000, 'Approved', '2026-03-20', 'APPROVED', NOW() - interval '2 hours', NOW())`);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);
    await page.waitForSelector('[data-testid="sales-tabs"]');

    await page.getByTestId("tab-APPROVED").click();
    await expect(page.getByText("MB-TAB04")).toBeVisible();
    await expect(page.getByText("MB-TAB03")).not.toBeVisible();
  });

  // ── Hindi: all sale form labels in Hindi when language is Hindi ──

  test("hindi: sale form labels in Hindi when language is Hindi", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    // Switch to Hindi
    await page.getByTestId("language-switcher").click();

    // Open form
    await page.getByTestId("submit-sale-button").click();
    await expect(page.getByTestId("sale-form")).toBeVisible();

    // Check Hindi labels
    await expect(page.getByTestId("label-billCode")).toContainText("बिल कोड");
    await expect(page.getByTestId("label-saleDate")).toContainText("बिक्री तिथि");
    await expect(page.getByTestId("label-products")).toContainText("उत्पाद");
    await expect(page.getByTestId("label-customerName")).toContainText("ग्राहक का नाम");
    await expect(page.getByTestId("label-customerPhone")).toContainText("ग्राहक का फ़ोन");
    await expect(page.getByTestId("label-billPhoto")).toContainText("बिल फ़ोटो");
    await expect(page.getByTestId("label-total")).toContainText("कुल");
  });

  // ── Mobile: form renders correctly on small screen ──

  test("mobile: form renders correctly on small screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    // Sales page title visible
    await expect(page.getByTestId("sales-title")).toBeVisible();

    // Submit sale button visible
    await expect(page.getByTestId("submit-sale-button")).toBeVisible();

    // Open form
    await page.getByTestId("submit-sale-button").click();
    await expect(page.getByTestId("sale-form")).toBeVisible();

    // All form fields visible
    await expect(page.getByTestId("input-billCode")).toBeVisible();
    await expect(page.getByTestId("input-saleDate")).toBeVisible();
    await expect(page.getByTestId("product-select-0")).toBeVisible();
    await expect(page.getByTestId("input-customerName")).toBeVisible();
    await expect(page.getByTestId("input-customerPhone")).toBeVisible();
    await expect(page.getByTestId("input-billPhoto")).toBeVisible();
    await expect(page.getByTestId("submit-sale-form")).toBeVisible();
  });

  // ── Sale detail view: shows all info including photo thumbnail ──

  test("sale detail view shows all info including photo", async ({ page }) => {
    dbQuery("UPDATE app_settings SET value='0' WHERE key='min_sale_gap_minutes'");

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await goToSalesPage(page);

    // Submit a sale first
    await submitSaleViaForm(page, {
      billCode: "MB-30001",
      saleDate: "2026-03-25",
      customerName: "Detail Test Customer",
      customerPhone: "+919111222333",
      photoFile: path.join(TEST_FILES_DIR, "receipt.jpg"),
    });

    await page.getByTestId("submit-sale-form").click();
    await expect(page.getByTestId("sale-success")).toBeVisible({ timeout: 10000 });

    // Wait for list to reload
    await page.waitForSelector('[data-testid="sales-list"]', { timeout: 5000 });

    // Click on the sale card
    await page.getByText("MB-30001").click();
    await expect(page.getByTestId("sale-detail")).toBeVisible();

    // Verify details
    await expect(page.getByTestId("sale-detail-billcode")).toContainText("MB-30001");
    await expect(page.getByTestId("sale-detail-status")).toBeVisible();
    await expect(page.getByTestId("sale-detail-items-table")).toBeVisible();
    await expect(page.getByTestId("sale-detail-photo")).toBeVisible();
  });
});
