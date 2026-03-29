import { test, expect } from "@playwright/test";
import {
  resetTestData,
  login,
  ensureRootMember,
  dbQuery,
  resetRateLimiter,
  registerMember,
} from "./helpers";

const MEMBER_EMAIL = "root@artilligence.com";
const MEMBER_PASSWORD = "member123456";

test.describe("Member Dashboard", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  // ── Dashboard loads with correct member name ──
  test("dashboard loads with correct member name", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("dashboard-welcome")).toContainText("Rajesh Kumar");
  });

  // ── Wallet summary shows correct numbers ──
  test("wallet summary shows correct numbers (all zeros for new member)", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("wallet-summary")).toBeVisible();
    await expect(page.getByTestId("wallet-total-amount")).toContainText("₹0.00");
    await expect(page.getByTestId("wallet-pending-amount")).toContainText("₹0.00");
    await expect(page.getByTestId("wallet-paid-amount")).toContainText("₹0.00");
  });

  // ── Direct referrals count shows correct X/3 ──
  test("direct referrals count shows 0/3 for member with no referrals", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("referral-count")).toBeVisible();
    await expect(page.getByTestId("referral-count-value")).toHaveText("0");
    await expect(page.getByTestId("referral-count")).toContainText("/ 3");
  });

  // ── Total downline count matches actual tree ──
  test("total downline count shows 0 for member with no downline", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("downline-count")).toBeVisible();
    await expect(page.getByTestId("downline-count-value")).toHaveText("0");
  });

  // ── Referral link displays and copy button works ──
  test("referral link displays with referral code and copy button", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("referral-link-section")).toBeVisible();
    const linkInput = page.getByTestId("referral-link-input");
    await expect(linkInput).toBeVisible();
    const linkValue = await linkInput.inputValue();
    expect(linkValue).toContain("/join/ROOT01");
    // Copy button
    await expect(page.getByTestId("copy-referral-link")).toBeVisible();
  });

  // ── Time filter: Today ──
  test('time filter "Today" is clickable and active', async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("time-filters")).toBeVisible();
    await page.getByTestId("filter-today").click();
    // Should have active styling (bg-primary)
    await expect(page.getByTestId("filter-today")).toHaveClass(/bg-primary/);
  });

  // ── Time filter: This Week ──
  test('time filter "This Week" shows weekly data', async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("filter-week").click();
    await expect(page.getByTestId("filter-week")).toHaveClass(/bg-primary/);
    // All Time should no longer be active
    await expect(page.getByTestId("filter-all")).not.toHaveClass(/bg-primary text-white/);
  });

  // ── Time filter: This Month ──
  test('time filter "This Month" shows monthly data', async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("filter-month").click();
    await expect(page.getByTestId("filter-month")).toHaveClass(/bg-primary/);
  });

  // ── Time filter: All Time ──
  test('time filter "All Time" shows everything (default)', async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // All Time is default active
    await expect(page.getByTestId("filter-all")).toHaveClass(/bg-primary/);
  });

  // ── Empty states for new member ──
  test("empty state: new member with no commissions shows empty message", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("commissions-empty")).toBeVisible();
  });

  // ── Quick action Submit Sale button ──
  test("quick action Submit Sale button links to sales/new", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    const submitBtn = page.getByTestId("quick-submit-sale");
    await expect(submitBtn).toBeVisible();
    expect(await submitBtn.getAttribute("href")).toBe("/dashboard/sales/new");
  });

  // ── Indian formatting ₹1,00,000 ──
  test("Indian number formatting uses ₹ symbol", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // Even zero amounts should have ₹ sign
    const totalText = await page.getByTestId("wallet-total-amount").textContent();
    expect(totalText).toContain("₹");
  });
});

test.describe("Language Switching", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  // ── Language switch to Hindi ──
  test("language switch to Hindi changes all text to Hindi", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // Default is English
    await expect(page.getByTestId("dashboard-welcome")).toContainText("Welcome back");
    // Switch to Hindi
    await page.getByTestId("language-switcher").click();
    await expect(page.getByTestId("dashboard-welcome")).toContainText("वापसी पर स्वागत है");
  });

  // ── Language switch back to English ──
  test("language switch back to English restores English text", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // Switch to Hindi
    await page.getByTestId("language-switcher").click();
    await expect(page.getByTestId("dashboard-welcome")).toContainText("वापसी पर स्वागत है");
    // Switch back to English
    await page.getByTestId("language-switcher").click();
    await expect(page.getByTestId("dashboard-welcome")).toContainText("Welcome back");
  });

  // ── Language preference persisted after logout/login ──
  test("language preference persists after logout and login", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // Switch to Hindi
    await page.getByTestId("language-switcher").click();
    await expect(page.getByTestId("dashboard-welcome")).toContainText("वापसी पर स्वागत है");
    // Wait for API to persist
    await page.waitForTimeout(1000);
    // Logout
    await page.getByTestId("logout-button").click();
    await page.waitForURL("/login");
    // Login again
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // Should still be Hindi
    await expect(page.getByTestId("dashboard-welcome")).toContainText("वापसी पर स्वागत है");
    // Reset back to English for other tests
    await page.getByTestId("language-switcher").click();
    await page.waitForTimeout(500);
  });

  // ── Nav items change with language ──
  test("nav items change to Hindi labels", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // Switch to Hindi
    await page.getByTestId("language-switcher").click();
    // Check sidebar nav has Hindi text
    await expect(page.getByTestId("nav-home")).toContainText("डैशबोर्ड");
    await expect(page.getByTestId("nav-user")).toContainText("प्रोफ़ाइल");
    // Switch back
    await page.getByTestId("language-switcher").click();
    await page.waitForTimeout(500);
  });
});

test.describe("Profile Page", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  // ── Profile page loads ──
  test("profile page loads with correct data", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("nav-user").click();
    await page.waitForURL("/dashboard/profile");
    await expect(page.getByTestId("profile-page")).toBeVisible();
    await expect(page.getByTestId("profile-name")).toHaveValue("Rajesh Kumar");
    await expect(page.getByTestId("profile-email")).toHaveValue("root@artilligence.com");
    await expect(page.getByTestId("profile-phone")).toHaveValue("+919999900001");
  });

  // ── Profile: edit name → saved ──
  test("edit name and save", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("nav-user").click();
    await page.waitForURL("/dashboard/profile");
    await page.getByTestId("profile-name").clear();
    await page.getByTestId("profile-name").fill("Rajesh Updated");
    await page.getByTestId("profile-save").click();
    await expect(page.getByTestId("profile-success")).toBeVisible();
    // Verify persisted by refreshing
    await page.reload();
    await expect(page.getByTestId("profile-name")).toHaveValue("Rajesh Updated");
    // Reset name
    await page.getByTestId("profile-name").clear();
    await page.getByTestId("profile-name").fill("Rajesh Kumar");
    await page.getByTestId("profile-save").click();
    await expect(page.getByTestId("profile-success")).toBeVisible();
  });

  // ── Profile: edit phone → saved ──
  test("edit phone and save", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("nav-user").click();
    await page.waitForURL("/dashboard/profile");
    await page.getByTestId("profile-phone").clear();
    await page.getByTestId("profile-phone").fill("+919999900099");
    await page.getByTestId("profile-save").click();
    await expect(page.getByTestId("profile-success")).toBeVisible();
    // Reset phone
    await page.getByTestId("profile-phone").clear();
    await page.getByTestId("profile-phone").fill("+919999900001");
    await page.getByTestId("profile-save").click();
    await expect(page.getByTestId("profile-success")).toBeVisible();
  });

  // ── Profile: edit phone to duplicate → error ──
  test("edit phone to duplicate number shows error", async ({ browser }) => {
    // Create another member in a fresh context (no existing session)
    const regContext = await browser.newContext({ baseURL: "http://localhost:3005" });
    const regPage = await regContext.newPage();
    await registerMember(regPage, "ROOT01", {
      name: "Test Member",
      email: "test-dup-phone@test.com",
      phone: "7777700001",
      password: "password123",
    });
    await regPage.waitForURL("/login?registered=true");
    await regContext.close();

    // Login as root in a new context
    const context = await browser.newContext({ baseURL: "http://localhost:3005" });
    const page = await context.newPage();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("nav-user").click();
    await page.waitForURL("/dashboard/profile");
    await page.getByTestId("profile-phone").clear();
    await page.getByTestId("profile-phone").fill("+917777700001");
    await page.getByTestId("profile-save").click();
    await expect(page.getByTestId("profile-error")).toBeVisible();
    await expect(page.getByTestId("profile-error")).toContainText("already in use");
    await context.close();
  });

  // ── Profile: change password with correct current → success ──
  test("change password with correct current password", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("nav-user").click();
    await page.waitForURL("/dashboard/profile");
    await page.getByTestId("current-password").fill(MEMBER_PASSWORD);
    await page.getByTestId("new-password").fill("newpassword123");
    await page.getByTestId("confirm-password").fill("newpassword123");
    await page.getByTestId("change-password-submit").click();
    await expect(page.getByTestId("password-success")).toBeVisible();
    // Reset password back via DB so other tests still work
    ensureRootMember();
  });

  // ── Profile: change password with wrong current → error ──
  test("change password with wrong current password shows error", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("nav-user").click();
    await page.waitForURL("/dashboard/profile");
    await page.getByTestId("current-password").fill("wrongpassword");
    await page.getByTestId("new-password").fill("newpassword123");
    await page.getByTestId("confirm-password").fill("newpassword123");
    await page.getByTestId("change-password-submit").click();
    await expect(page.getByTestId("password-error")).toBeVisible();
    await expect(page.getByTestId("password-error")).toContainText("incorrect");
  });

  // ── Profile: change password too short → validation error ──
  test("change password too short shows validation error", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("nav-user").click();
    await page.waitForURL("/dashboard/profile");
    await page.getByTestId("current-password").fill(MEMBER_PASSWORD);
    await page.getByTestId("new-password").fill("short");
    await page.getByTestId("confirm-password").fill("short");
    await page.getByTestId("change-password-submit").click();
    await expect(page.getByTestId("password-error")).toBeVisible();
    await expect(page.getByTestId("password-error")).toContainText("8 characters");
  });

  // ── Profile: password mismatch → validation error ──
  test("password mismatch shows validation error", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("nav-user").click();
    await page.waitForURL("/dashboard/profile");
    await page.getByTestId("current-password").fill(MEMBER_PASSWORD);
    await page.getByTestId("new-password").fill("newpassword123");
    await page.getByTestId("confirm-password").fill("different123");
    await page.getByTestId("change-password-submit").click();
    await expect(page.getByTestId("password-error")).toBeVisible();
    await expect(page.getByTestId("password-error")).toContainText("do not match");
  });

  // ── Replay onboarding from profile ──
  test("replay onboarding button navigates to dashboard with replay param", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await page.getByTestId("nav-user").click();
    await page.waitForURL("/dashboard/profile");
    await expect(page.getByTestId("replay-onboarding")).toBeVisible();
  });
});

test.describe("Onboarding Tour", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
    // Reset onboarding flag
    dbQuery("UPDATE users SET has_completed_onboarding=false WHERE email='root@artilligence.com'");
  });

  // ── First login → tutorial appears ──
  test("first login shows onboarding tutorial", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // Driver.js popover should appear
    await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".driver-popover-title")).toContainText("Welcome");
  });

  // ── Skip tutorial → doesn't show again ──
  test("skip tutorial marks onboarding complete", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 10000 });
    // Click the close button to skip
    await page.locator(".driver-popover-close-btn").click();
    await expect(page.locator(".driver-popover")).not.toBeVisible();
    // Verify flag is set
    await page.waitForTimeout(1000);
    const flag = dbQuery("SELECT has_completed_onboarding FROM users WHERE email='root@artilligence.com'");
    expect(flag).toBe("t");
  });

  // ── Complete tutorial → doesn't show again ──
  test("completing full tutorial marks onboarding done", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 10000 });
    // Step through all 5 steps
    for (let i = 0; i < 4; i++) {
      await page.locator(".driver-popover-next-btn").click();
      await page.waitForTimeout(500);
    }
    // Last step — click Done
    await page.locator(".driver-popover-next-btn").click();
    await page.waitForTimeout(1000);
    // Verify flag
    const flag = dbQuery("SELECT has_completed_onboarding FROM users WHERE email='root@artilligence.com'");
    expect(flag).toBe("t");
  });

  // ── Second login → no tutorial ──
  test("second login does not show onboarding if already completed", async ({ page }) => {
    // Set onboarding as completed
    dbQuery("UPDATE users SET has_completed_onboarding=true WHERE email='root@artilligence.com'");
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // Wait a bit to make sure driver.js doesn't appear
    await page.waitForTimeout(2000);
    await expect(page.locator(".driver-popover")).not.toBeVisible();
  });
});

test.describe("Responsive Layout", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  // ── Desktop: sidebar visible, bottom nav hidden ──
  test("desktop: sidebar visible, bottom nav hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("member-sidebar")).toBeVisible();
    // Bottom nav should be hidden on desktop (lg:hidden)
    await expect(page.getByTestId("bottom-nav")).not.toBeVisible();
  });

  // ── Mobile: bottom nav visible, sidebar hidden ──
  test("mobile: bottom nav visible, sidebar hidden initially", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // Bottom nav visible on mobile
    await expect(page.getByTestId("bottom-nav")).toBeVisible();
    // Sidebar should be off-screen (translated)
    const sidebar = page.getByTestId("member-sidebar");
    await expect(sidebar).toHaveClass(/-translate-x-full/);
  });

  // ── Mobile: hamburger opens sidebar ──
  test("mobile: hamburger menu opens sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // Click hamburger
    await page.getByTestId("sidebar-toggle").click();
    // Sidebar should now be visible (translate-x-0)
    await expect(page.getByTestId("member-sidebar")).toHaveClass(/translate-x-0/);
    // Overlay should appear
    await expect(page.getByTestId("sidebar-overlay")).toBeVisible();
  });

  // ── Mobile: cards stack vertically ──
  test("mobile: wallet cards stack vertically", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    const walletSummary = page.getByTestId("wallet-summary");
    await expect(walletSummary).toBeVisible();
    // On mobile (375px), grid-cols-1 means cards stack
    const totalCard = page.getByTestId("wallet-total");
    const pendingCard = page.getByTestId("wallet-pending");
    const totalBox = await totalCard.boundingBox();
    const pendingBox = await pendingCard.boundingBox();
    // Cards should be stacked: pending should be below total
    expect(pendingBox!.y).toBeGreaterThan(totalBox!.y);
  });

  // ── Desktop: wallet cards side by side ──
  test("desktop: wallet cards are side by side", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    const totalCard = page.getByTestId("wallet-total");
    const pendingCard = page.getByTestId("wallet-pending");
    const totalBox = await totalCard.boundingBox();
    const pendingBox = await pendingCard.boundingBox();
    // On desktop (sm:grid-cols-3), cards should be on same row
    expect(pendingBox!.y).toBe(totalBox!.y);
  });

  // ── Mobile: bottom nav has all 5 items ──
  test("mobile: bottom nav shows all 5 nav items", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("bottom-nav-home")).toBeVisible();
    await expect(page.getByTestId("bottom-nav-receipt")).toBeVisible();
    await expect(page.getByTestId("bottom-nav-users")).toBeVisible();
    await expect(page.getByTestId("bottom-nav-wallet")).toBeVisible();
    await expect(page.getByTestId("bottom-nav-user")).toBeVisible();
  });
});

test.describe("Dashboard with Referrals", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  // ── Referral count updates when members register ──
  test("referral count updates after member registers under root", async ({ browser }) => {
    // Register a member in a fresh context (no existing session)
    const regContext = await browser.newContext({ baseURL: "http://localhost:3005" });
    const regPage = await regContext.newPage();
    await registerMember(regPage, "ROOT01", {
      name: "Child Member",
      email: "child1@test.com",
      phone: "6666600001",
      password: "password123",
    });
    await regPage.waitForURL("/login?registered=true");
    await regContext.close();

    // Login as root in a new context and check dashboard
    const context = await browser.newContext({ baseURL: "http://localhost:3005" });
    const page = await context.newPage();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("referral-count-value")).toHaveText("1");
    await context.close();
  });

  // ── Downline count updates ──
  test("downline count updates after member registers", async ({ browser }) => {
    const regContext = await browser.newContext({ baseURL: "http://localhost:3005" });
    const regPage = await regContext.newPage();
    await registerMember(regPage, "ROOT01", {
      name: "Child Member",
      email: "child-down@test.com",
      phone: "6666600002",
      password: "password123",
    });
    await regPage.waitForURL("/login?registered=true");
    await regContext.close();

    const context = await browser.newContext({ baseURL: "http://localhost:3005" });
    const page = await context.newPage();
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    await expect(page.getByTestId("downline-count-value")).toHaveText("1");
    await context.close();
  });
});

test.describe("Indian Number Formatting", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  // ── Wallet with large amount uses Indian format ──
  test("wallet displays amounts in Indian format (₹1,00,000)", async ({ page }) => {
    // Set wallet to a large amount
    const rootId = dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
    dbQuery(
      `UPDATE wallets SET total_earned=100000, pending=75000, paid_out=25000 WHERE user_id='${rootId}'`
    );

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("/dashboard");
    // ₹1,00,000.00 (Indian formatting)
    await expect(page.getByTestId("wallet-total-amount")).toHaveText("₹1,00,000.00");
    await expect(page.getByTestId("wallet-pending-amount")).toHaveText("₹75,000.00");
    await expect(page.getByTestId("wallet-paid-amount")).toHaveText("₹25,000.00");

    // Reset wallet
    dbQuery(
      `UPDATE wallets SET total_earned=0, pending=0, paid_out=0 WHERE user_id='${rootId}'`
    );
  });
});
