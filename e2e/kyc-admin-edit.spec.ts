import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import {
  dbQuery,
  login,
  resetTestData,
  resetRateLimiter,
  registerMember,
  getMemberByEmail,
  ensureRootMember,
} from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";

// Create a small test image (1x1 JPEG) for file upload tests
const TEST_IMAGE_DIR = path.join(__dirname, "fixtures");
const TEST_IMAGE_PATH = path.join(TEST_IMAGE_DIR, "test-photo.jpg");
const TEST_PDF_PATH = path.join(TEST_IMAGE_DIR, "test-doc.pdf");

function ensureTestFixtures() {
  if (!fs.existsSync(TEST_IMAGE_DIR)) {
    fs.mkdirSync(TEST_IMAGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    // Minimal valid JPEG (1x1 pixel)
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
      0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
      0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
      0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
      0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
      0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
      0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
      0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
      0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
      0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
      0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
      0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
      0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
      0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
      0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
      0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
      0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01,
      0x00, 0x00, 0x3f, 0x00, 0x7b, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xff, 0xd9,
    ]);
    fs.writeFileSync(TEST_IMAGE_PATH, jpegBytes);
  }
  if (!fs.existsSync(TEST_PDF_PATH)) {
    // Minimal valid PDF
    const pdfContent = `%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF`;
    fs.writeFileSync(TEST_PDF_PATH, pdfContent);
  }
}

function cleanupKycTestMembers() {
  dbQuery("DELETE FROM audit_logs WHERE entity='User' AND entity_id IN (SELECT id FROM users WHERE email LIKE 'kyc-%@test.com')");
  dbQuery("DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'kyc-%@test.com')");
  dbQuery("DELETE FROM users WHERE email LIKE 'kyc-%@test.com'");
  ensureRootMember();
  dbQuery("UPDATE users SET status='ACTIVE' WHERE email IN ('root@artilligence.com','admin@artilligence.com')");
}

function getKycFields(email: string) {
  const row = dbQuery(
    `SELECT aadhar_number, pan_number, bank_account_number, bank_ifsc_code, bank_name, aadhar_file_path, pan_file_path, passport_photo_path FROM users WHERE email='${email}'`
  );
  if (!row) return null;
  const [aadharNumber, panNumber, bankAccountNumber, bankIfscCode, bankName, aadharFilePath, panFilePath, passportPhotoPath] = row.split("|");
  return { aadharNumber, panNumber, bankAccountNumber, bankIfscCode, bankName, aadharFilePath, panFilePath, passportPhotoPath };
}

test.describe("KYC Registration & Admin Edit", () => {
  test.beforeAll(async ({ browser }) => {
    ensureTestFixtures();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("http://localhost:3005/login", { timeout: 30000 });
    await page.waitForSelector('button[type="submit"]', { timeout: 30000 });
    await ctx.close();
  });

  test.beforeEach(async () => {
    await resetRateLimiter();
    cleanupKycTestMembers();
  });

  test.afterAll(() => {
    cleanupKycTestMembers();
  });

  // ── Registration WITHOUT KYC (backward compat) ──────────

  test.describe("Registration without KYC", () => {
    test("registration works without filling KYC fields", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "No KYC Member",
        email: "kyc-none@test.com",
        phone: "9876540001",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });
      await expect(page.locator(".text-success")).toContainText("Account created successfully");

      const member = getMemberByEmail("kyc-none@test.com");
      expect(member).not.toBeNull();

      const kyc = getKycFields("kyc-none@test.com");
      expect(kyc).not.toBeNull();
      expect(kyc!.aadharNumber).toBeFalsy();
      expect(kyc!.panNumber).toBeFalsy();
      expect(kyc!.bankAccountNumber).toBeFalsy();
    });
  });

  // ── Registration WITH KYC fields ────────────────────────

  test.describe("Registration with KYC", () => {
    test("KYC section is hidden by default, toggles on click", async ({ page }) => {
      await page.goto("/join/ROOT01");
      await expect(page.locator("text=KYC & Bank Details")).toBeVisible();

      // Aadhar input should NOT be visible
      await expect(page.locator('#aadharNumber')).not.toBeVisible();

      // Click to expand
      await page.click("text=KYC & Bank Details");
      await expect(page.locator('#aadharNumber')).toBeVisible();
      await expect(page.locator('#panNumber')).toBeVisible();
      await expect(page.locator('#bankAccountNumber')).toBeVisible();
    });

    test("register with aadhar, PAN and bank details", async ({ page }) => {
      await page.goto("/join/ROOT01");
      await page.fill('input[name="name"]', "KYC Full Member");
      await page.fill('input[name="email"]', "kyc-full@test.com");
      await page.fill('input[name="phone"]', "9876540002");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");

      // Expand KYC section
      await page.click("text=KYC & Bank Details");
      await page.fill('#aadharNumber', "123456789012");
      await page.fill('#panNumber', "ABCDE1234F");
      await page.fill('#bankAccountNumber', "123456789012345");
      await page.fill('#bankIfscCode', "SBIN0001234");
      await page.fill('#bankName', "State Bank of India");

      await page.click('button[type="submit"]');
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      const kyc = getKycFields("kyc-full@test.com");
      expect(kyc).not.toBeNull();
      expect(kyc!.aadharNumber).toBe("123456789012");
      expect(kyc!.panNumber).toBe("ABCDE1234F");
      expect(kyc!.bankAccountNumber).toBe("123456789012345");
      expect(kyc!.bankIfscCode).toBe("SBIN0001234");
      expect(kyc!.bankName).toBe("State Bank of India");
    });

    test("register with only aadhar (partial KYC)", async ({ page }) => {
      await page.goto("/join/ROOT01");
      await page.fill('input[name="name"]', "Partial KYC");
      await page.fill('input[name="email"]', "kyc-partial@test.com");
      await page.fill('input[name="phone"]', "9876540003");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");

      await page.click("text=KYC & Bank Details");
      await page.fill('#aadharNumber', "111122223333");

      await page.click('button[type="submit"]');
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      const kyc = getKycFields("kyc-partial@test.com");
      expect(kyc!.aadharNumber).toBe("111122223333");
      expect(kyc!.panNumber).toBeFalsy();
      expect(kyc!.bankAccountNumber).toBeFalsy();
    });

    test("register with file uploads (aadhar + passport photo)", async ({ page }) => {
      await page.goto("/join/ROOT01");
      await page.fill('input[name="name"]', "File Upload Member");
      await page.fill('input[name="email"]', "kyc-files@test.com");
      await page.fill('input[name="phone"]', "9876540004");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");

      await page.click("text=KYC & Bank Details");
      await page.fill('#aadharNumber', "444455556666");

      // Upload files
      await page.locator('#aadharFile').setInputFiles(TEST_IMAGE_PATH);
      await page.locator('#passportPhoto').setInputFiles(TEST_IMAGE_PATH);

      await page.click('button[type="submit"]');
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      const kyc = getKycFields("kyc-files@test.com");
      expect(kyc!.aadharNumber).toBe("444455556666");
      expect(kyc!.aadharFilePath).toContain("/uploads/kyc/");
      expect(kyc!.aadharFilePath).toContain("aadhar");
      expect(kyc!.passportPhotoPath).toContain("/uploads/kyc/");
      expect(kyc!.passportPhotoPath).toContain("passport-photo");
    });
  });

  // ── KYC Validation ──────────────────────────────────────

  test.describe("KYC Validation", () => {
    test("invalid aadhar (not 12 digits) → error", async ({ page }) => {
      await page.goto("/join/ROOT01");
      await page.fill('input[name="name"]', "Bad Aadhar");
      await page.fill('input[name="email"]', "kyc-badaadhar@test.com");
      await page.fill('input[name="phone"]', "9876540005");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");

      await page.click("text=KYC & Bank Details");
      await page.fill('#aadharNumber', "12345"); // Too short

      await page.click('button[type="submit"]');
      await expect(page.locator("text=Aadhar number must be 12 digits")).toBeVisible({ timeout: 10000 });
    });

    test("invalid PAN format → error", async ({ page }) => {
      await page.goto("/join/ROOT01");
      await page.fill('input[name="name"]', "Bad PAN");
      await page.fill('input[name="email"]', "kyc-badpan@test.com");
      await page.fill('input[name="phone"]', "9876540006");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");

      await page.click("text=KYC & Bank Details");
      await page.fill('#panNumber', "INVALID");

      await page.click('button[type="submit"]');
      await expect(page.locator("text=Invalid PAN format")).toBeVisible({ timeout: 10000 });
    });

    test("invalid IFSC code → error", async ({ page }) => {
      await page.goto("/join/ROOT01");
      await page.fill('input[name="name"]', "Bad IFSC");
      await page.fill('input[name="email"]', "kyc-badifsc@test.com");
      await page.fill('input[name="phone"]', "9876540007");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");

      await page.click("text=KYC & Bank Details");
      await page.fill('#bankIfscCode', "BADCODE");

      await page.click('button[type="submit"]');
      await expect(page.locator("text=Invalid IFSC code format")).toBeVisible({ timeout: 10000 });
    });

    test("invalid bank account number (too short) → error", async ({ page }) => {
      await page.goto("/join/ROOT01");
      await page.fill('input[name="name"]', "Bad Bank");
      await page.fill('input[name="email"]', "kyc-badbank@test.com");
      await page.fill('input[name="phone"]', "9876540008");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");

      await page.click("text=KYC & Bank Details");
      await page.fill('#bankAccountNumber', "12345"); // Too short (min 9)

      await page.click('button[type="submit"]');
      await expect(page.locator("text=Bank account number must be 9-18 digits")).toBeVisible({ timeout: 10000 });
    });
  });

  // ── Admin: View KYC Details ─────────────────────────────

  test.describe("Admin View KYC", () => {
    test("member detail shows KYC card with data", async ({ page }) => {
      // Create member with KYC data via API
      await page.goto("/join/ROOT01");
      await page.fill('input[name="name"]', "KYC View Test");
      await page.fill('input[name="email"]', "kyc-view@test.com");
      await page.fill('input[name="phone"]', "9876540010");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");

      await page.click("text=KYC & Bank Details");
      await page.fill('#aadharNumber', "999988887777");
      await page.fill('#panNumber', "XYZAB5678C");
      await page.fill('#bankAccountNumber', "9876543210123");
      await page.fill('#bankIfscCode', "HDFC0001234");
      await page.fill('#bankName', "HDFC Bank");

      await page.click('button[type="submit"]');
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      // Login as admin and navigate to member
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin", { timeout: 15000 });

      const memberId = dbQuery("SELECT id FROM users WHERE email='kyc-view@test.com'");
      await page.goto(`/admin/members/${memberId}`);

      // Check KYC card
      await expect(page.locator('[data-testid="kyc-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="kyc-aadhar"]')).toContainText("999988887777");
      await expect(page.locator('[data-testid="kyc-pan"]')).toContainText("XYZAB5678C");
      await expect(page.locator('[data-testid="kyc-bank-account"]')).toContainText("9876543210123");
      await expect(page.locator('[data-testid="kyc-ifsc"]')).toContainText("HDFC0001234");
      await expect(page.locator('[data-testid="kyc-bank-name"]')).toContainText("HDFC Bank");
    });

    test("member detail shows 'no KYC' when empty", async ({ page }) => {
      // Register without KYC
      await registerMember(page, "ROOT01", {
        name: "No KYC View",
        email: "kyc-empty@test.com",
        phone: "9876540011",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin", { timeout: 15000 });

      const memberId = dbQuery("SELECT id FROM users WHERE email='kyc-empty@test.com'");
      await page.goto(`/admin/members/${memberId}`);

      await expect(page.locator('[data-testid="kyc-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="kyc-card"]')).toContainText("No KYC or bank details provided");
    });
  });

  // ── Admin: Edit Member ──────────────────────────────────

  test.describe("Admin Edit Member", () => {
    test("edit button shows/hides the edit form", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Edit Toggle",
        email: "kyc-toggle@test.com",
        phone: "9876540020",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin", { timeout: 15000 });

      const memberId = dbQuery("SELECT id FROM users WHERE email='kyc-toggle@test.com'");
      await page.goto(`/admin/members/${memberId}`);

      // Edit form should be hidden
      await expect(page.locator('[data-testid="edit-form"]')).not.toBeVisible();

      // Click Edit
      await page.click('[data-testid="edit-member-button"]');
      await expect(page.locator('[data-testid="edit-form"]')).toBeVisible();

      // Click Cancel Edit
      await page.click('[data-testid="edit-member-button"]');
      await expect(page.locator('[data-testid="edit-form"]')).not.toBeVisible();
    });

    test("edit basic member info (name, email, phone)", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Original Name",
        email: "kyc-editbasic@test.com",
        phone: "9876540021",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin", { timeout: 15000 });

      const memberId = dbQuery("SELECT id FROM users WHERE email='kyc-editbasic@test.com'");
      await page.goto(`/admin/members/${memberId}`);

      await page.click('[data-testid="edit-member-button"]');

      // Change name
      await page.fill('[data-testid="edit-name"]', "Updated Name");
      await page.click('[data-testid="save-edit-button"]');

      // Wait for save and refresh
      await expect(page.locator('[data-testid="edit-form"]')).not.toBeVisible({ timeout: 10000 });
      await expect(page.locator('[data-testid="member-name"]')).toContainText("Updated Name");

      // Verify in DB
      const updatedName = dbQuery("SELECT name FROM users WHERE email='kyc-editbasic@test.com'");
      expect(updatedName).toBe("Updated Name");
    });

    test("edit KYC fields via admin", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "KYC Edit Test",
        email: "kyc-adminedit@test.com",
        phone: "9876540022",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin", { timeout: 15000 });

      const memberId = dbQuery("SELECT id FROM users WHERE email='kyc-adminedit@test.com'");
      await page.goto(`/admin/members/${memberId}`);

      await page.click('[data-testid="edit-member-button"]');

      // Fill KYC fields
      await page.fill('[data-testid="edit-aadhar"]', "111122223333");
      await page.fill('[data-testid="edit-pan"]', "ABCDE1234F");
      await page.fill('[data-testid="edit-bank-account"]', "9999888877776666");
      await page.fill('[data-testid="edit-ifsc"]', "ICIC0001234");
      await page.fill('[data-testid="edit-bank-name"]', "ICICI Bank");

      await page.click('[data-testid="save-edit-button"]');

      await expect(page.locator('[data-testid="edit-form"]')).not.toBeVisible({ timeout: 10000 });

      // Verify KYC card shows the new data
      await expect(page.locator('[data-testid="kyc-aadhar"]')).toContainText("111122223333");
      await expect(page.locator('[data-testid="kyc-pan"]')).toContainText("ABCDE1234F");
      await expect(page.locator('[data-testid="kyc-bank-account"]')).toContainText("9999888877776666");
      await expect(page.locator('[data-testid="kyc-ifsc"]')).toContainText("ICIC0001234");
      await expect(page.locator('[data-testid="kyc-bank-name"]')).toContainText("ICICI Bank");

      // Verify in DB
      const kyc = getKycFields("kyc-adminedit@test.com");
      expect(kyc!.aadharNumber).toBe("111122223333");
      expect(kyc!.panNumber).toBe("ABCDE1234F");
      expect(kyc!.bankAccountNumber).toBe("9999888877776666");
      expect(kyc!.bankIfscCode).toBe("ICIC0001234");
      expect(kyc!.bankName).toBe("ICICI Bank");
    });

    test("admin edit with file upload", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "File Edit Test",
        email: "kyc-fileedit@test.com",
        phone: "9876540023",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin", { timeout: 15000 });

      const memberId = dbQuery("SELECT id FROM users WHERE email='kyc-fileedit@test.com'");
      await page.goto(`/admin/members/${memberId}`);

      await page.click('[data-testid="edit-member-button"]');

      // Upload aadhar document
      await page.locator('[data-testid="edit-aadhar-file"]').setInputFiles(TEST_IMAGE_PATH);
      await page.fill('[data-testid="edit-aadhar"]', "555566667777");

      await page.click('[data-testid="save-edit-button"]');
      await expect(page.locator('[data-testid="edit-form"]')).not.toBeVisible({ timeout: 10000 });

      // Verify file was saved
      const kyc = getKycFields("kyc-fileedit@test.com");
      expect(kyc!.aadharFilePath).toContain("/uploads/kyc/");
      expect(kyc!.aadharNumber).toBe("555566667777");
    });

    test("admin edit validation: invalid PAN → error shown", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Admin Val Test",
        email: "kyc-adminval@test.com",
        phone: "9876540024",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin", { timeout: 15000 });

      const memberId = dbQuery("SELECT id FROM users WHERE email='kyc-adminval@test.com'");
      await page.goto(`/admin/members/${memberId}`);

      await page.click('[data-testid="edit-member-button"]');
      await page.fill('[data-testid="edit-pan"]', "BADPAN");
      await page.click('[data-testid="save-edit-button"]');

      await expect(page.locator("text=Invalid PAN format")).toBeVisible({ timeout: 10000 });
    });

    test("admin edit validation: empty name → error shown", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Empty Name Test",
        email: "kyc-emptyname@test.com",
        phone: "9876540025",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin", { timeout: 15000 });

      const memberId = dbQuery("SELECT id FROM users WHERE email='kyc-emptyname@test.com'");
      await page.goto(`/admin/members/${memberId}`);

      await page.click('[data-testid="edit-member-button"]');

      // Clear name via triple-click + delete
      await page.locator('[data-testid="edit-name"]').fill("");

      // Bypass HTML5 required
      await page.evaluate(() => {
        document.querySelector('[data-testid="edit-form"] form')?.setAttribute("novalidate", "");
      });

      await page.click('[data-testid="save-edit-button"]');
      await expect(page.locator("text=Name is required")).toBeVisible({ timeout: 10000 });
    });

    test("admin edit: duplicate email → error", async ({ page }) => {
      // Register two members
      await registerMember(page, "ROOT01", {
        name: "Member A",
        email: "kyc-dupe-a@test.com",
        phone: "9876540026",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      await registerMember(page, "ROOT01", {
        name: "Member B",
        email: "kyc-dupe-b@test.com",
        phone: "9876540027",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin", { timeout: 15000 });

      // Try to change B's email to A's email
      const memberBId = dbQuery("SELECT id FROM users WHERE email='kyc-dupe-b@test.com'");
      await page.goto(`/admin/members/${memberBId}`);

      await page.click('[data-testid="edit-member-button"]');
      await page.fill('[data-testid="edit-email"]', "kyc-dupe-a@test.com");
      await page.click('[data-testid="save-edit-button"]');

      await expect(page.locator("text=Email already in use")).toBeVisible({ timeout: 10000 });
    });

    test("admin edit creates audit log entry", async ({ page }) => {
      await registerMember(page, "ROOT01", {
        name: "Audit Check",
        email: "kyc-audit@test.com",
        phone: "9876540028",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin", { timeout: 15000 });

      const memberId = dbQuery("SELECT id FROM users WHERE email='kyc-audit@test.com'");
      await page.goto(`/admin/members/${memberId}`);

      await page.click('[data-testid="edit-member-button"]');
      await page.fill('[data-testid="edit-name"]', "Audit Updated");
      await page.click('[data-testid="save-edit-button"]');

      await expect(page.locator('[data-testid="edit-form"]')).not.toBeVisible({ timeout: 10000 });

      // Check audit log
      const auditAction = dbQuery(
        `SELECT action FROM audit_logs WHERE entity_id='${memberId}' AND action='MEMBER_UPDATED' ORDER BY created_at DESC LIMIT 1`
      );
      expect(auditAction).toBe("MEMBER_UPDATED");
    });
  });
});
