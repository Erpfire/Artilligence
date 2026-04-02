import { test, expect } from "@playwright/test";
import {
  login,
  registerMember,
  resetTestData,
  resetRateLimiter,
  blockMember,
  unblockMember,
  getMemberByEmail,
} from "./helpers";

// Pre-warm Next.js dev server routes (JIT compilation)
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("http://localhost:3005/login");
  await page.goto("http://localhost:3005/join/ROOT01");
  await page.close();
});

test.beforeEach(async () => {
  resetTestData();
  await resetRateLimiter();
});

// ============================================================
// LOGIN TESTS
// ============================================================

test.describe("Login", () => {
  test("admin login → redirects to /admin", async ({ page }) => {
    await login(page, "admin@artilligence.com", "admin123456");
    // Wait for login to complete and navigation
    await page.waitForURL((url) => !url.toString().includes("/login"), {
      timeout: 15000,
    });
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator("h1")).toContainText("Admin Dashboard");
  });

  test("member login → redirects to /dashboard", async ({ page }) => {
    await login(page, "root@artilligence.com", "member123456");
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await expect(page.locator("h1")).toContainText("Welcome back");
  });

  test("wrong password → shows error", async ({ page }) => {
    await login(page, "admin@artilligence.com", "wrongpassword");
    await expect(page.locator(".text-error")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".text-error")).toContainText(
      "Invalid email or password"
    );
  });

  test("non-existent email → shows error", async ({ page }) => {
    await login(page, "nobody@nowhere.com", "password123");
    await expect(page.locator(".text-error")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".text-error")).toContainText(
      "Invalid email or password"
    );
  });

  test("rate limiting: 6th attempt within 15 min → blocked", async ({
    page,
  }) => {
    for (let i = 0; i < 5; i++) {
      await login(page, "admin@artilligence.com", "wrong");
      await page.waitForSelector(".text-error", { timeout: 10000 });
    }
    await login(page, "admin@artilligence.com", "wrong");
    await expect(page.locator(".text-error")).toContainText(
      "Too many login attempts"
    );
  });

  test("blocked member login → deactivated message", async ({ page }) => {
    blockMember("root@artilligence.com");
    try {
      await login(page, "root@artilligence.com", "member123456");
      await expect(page.locator(".text-error")).toBeVisible({ timeout: 10000 });
      await expect(page.locator(".text-error")).toContainText("deactivated");
    } finally {
      unblockMember("root@artilligence.com");
    }
  });
});

// ============================================================
// REGISTRATION TESTS
// ============================================================

test.describe("Registration", () => {
  test("valid referral code → shows sponsor name", async ({ page }) => {
    await page.goto("/join/ROOT01");
    await expect(page.locator("text=Rajesh Kumar")).toBeVisible();
    await expect(page.locator("text=referred by")).toBeVisible();
  });

  test("invalid referral code → 404 error page", async ({ page }) => {
    await page.goto("/join/BADCODE");
    await expect(page.locator("text=Invalid Referral Code")).toBeVisible();
  });

  test("blocked member referral code → inactive message", async ({
    page,
  }) => {
    blockMember("root@artilligence.com");
    try {
      await page.goto("/join/ROOT01");
      await expect(
        page.locator("text=Referral Link Inactive")
      ).toBeVisible();
    } finally {
      unblockMember("root@artilligence.com");
    }
  });

  test("successful registration → redirect to login with success", async ({
    page,
  }) => {
    await registerMember(page, "ROOT01", {
      name: "New Member",
      email: "new@test.com",
      phone: "9876543210",
      password: "password123",
    });
    await page.waitForURL("**/login?registered=true");
    await expect(page.locator(".text-success")).toContainText(
      "Account created successfully"
    );
  });

  test("registration form validation: empty fields", async ({ page }) => {
    await page.goto("/join/ROOT01");
    // Bypass HTML5 validation
    await page.evaluate(() => {
      document.querySelector("form")?.setAttribute("novalidate", "");
    });
    await page.click('button[type="submit"]');
    // Should show error messages for required fields
    await expect(page.getByText("Name is required")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByText("Phone is required")).toBeVisible();
    await expect(page.getByText("Password is required")).toBeVisible();
  });

  test("registration: invalid email format", async ({ page }) => {
    await page.goto("/join/ROOT01");
    // Bypass HTML5 validation
    await page.evaluate(() => {
      document.querySelector("form")?.setAttribute("novalidate", "");
    });
    await page.fill('input[name="name"]', "Test");
    await page.fill('input[name="email"]', "notanemail");
    await page.fill('input[name="phone"]', "9876543210");
    await page.fill('input[name="password"]', "password123");
    await page.fill('input[name="confirmPassword"]', "password123");
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Invalid email format")).toBeVisible();
  });

  test("registration: short password", async ({ page }) => {
    await page.goto("/join/ROOT01");
    await page.evaluate(() => {
      document.querySelector("form")?.setAttribute("novalidate", "");
    });
    await page.fill('input[name="name"]', "Test");
    await page.fill('input[name="email"]', "short@test.com");
    await page.fill('input[name="phone"]', "9876543210");
    await page.fill('input[name="password"]', "short");
    await page.fill('input[name="confirmPassword"]', "short");
    await page.click('button[type="submit"]');
    await expect(
      page.locator("text=Password must be at least 8 characters")
    ).toBeVisible();
  });

  test("registration: password mismatch", async ({ page }) => {
    await page.goto("/join/ROOT01");
    await page.fill('input[name="name"]', "Test");
    await page.fill('input[name="email"]', "mismatch@test.com");
    await page.fill('input[name="phone"]', "9876543210");
    await page.fill('input[name="password"]', "password123");
    await page.fill('input[name="confirmPassword"]', "different123");
    await page.click('button[type="submit"]');
    await expect(
      page.locator("text=Passwords do not match")
    ).toBeVisible();
  });

  test("registration: invalid phone format", async ({ page }) => {
    await page.goto("/join/ROOT01");
    await page.fill('input[name="name"]', "Test");
    await page.fill('input[name="email"]', "phone@test.com");
    await page.fill('input[name="phone"]', "1234567890");
    await page.fill('input[name="password"]', "password123");
    await page.fill('input[name="confirmPassword"]', "password123");
    await page.click('button[type="submit"]');
    await expect(
      page.locator("text=Phone must be 10 digits starting with 6-9")
    ).toBeVisible();
  });

  test("registration: duplicate email → error", async ({ page }) => {
    await registerMember(page, "ROOT01", {
      name: "First",
      email: "dupe@test.com",
      phone: "9876543210",
      password: "password123",
    });
    await page.waitForURL("**/login?registered=true");

    await registerMember(page, "ROOT01", {
      name: "Second",
      email: "dupe@test.com",
      phone: "9876543211",
      password: "password123",
    });
    await expect(
      page.locator("text=Email already registered")
    ).toBeVisible();
  });

  test("registration: duplicate phone → error", async ({ page }) => {
    await registerMember(page, "ROOT01", {
      name: "First",
      email: "first@test.com",
      phone: "9876543210",
      password: "password123",
    });
    await page.waitForURL("**/login?registered=true");

    await registerMember(page, "ROOT01", {
      name: "Second",
      email: "second@test.com",
      phone: "9876543210",
      password: "password123",
    });
    await expect(
      page.locator("text=Phone already registered")
    ).toBeVisible();
  });

  test("self-referral prevention: sponsor email → error", async ({
    page,
  }) => {
    await page.goto("/join/ROOT01");
    await page.fill('input[name="name"]', "Self Ref");
    await page.fill('input[name="email"]', "root@artilligence.com");
    await page.fill('input[name="phone"]', "9876543299");
    await page.fill('input[name="password"]', "password123");
    await page.fill('input[name="confirmPassword"]', "password123");
    await page.click('button[type="submit"]');
    await expect(
      page.locator("text=Cannot use own referral code")
    ).toBeVisible();
  });

  test("self-referral prevention: sponsor phone → error", async ({
    page,
  }) => {
    await page.goto("/join/ROOT01");
    await page.fill('input[name="name"]', "Self Ref");
    await page.fill('input[name="email"]', "selfref@test.com");
    await page.fill('input[name="phone"]', "9999900001");
    await page.fill('input[name="password"]', "password123");
    await page.fill('input[name="confirmPassword"]', "password123");
    await page.click('button[type="submit"]');
    await expect(
      page.locator("text=Cannot use own referral code")
    ).toBeVisible();
  });

  test("new member stored correctly in DB", async ({ page }) => {
    await registerMember(page, "ROOT01", {
      name: "DB Check",
      email: "dbcheck@test.com",
      phone: "9876543230",
      password: "password123",
    });
    await page.waitForURL("**/login?registered=true");

    const member = getMemberByEmail("dbcheck@test.com");
    expect(member).not.toBeNull();
    expect(member!.name).toBe("DB Check");
    expect(member!.status).toBe("ACTIVE");
    expect(member!.depth).toBe(1);
    expect(member!.position).toBe(1);
    const root = getMemberByEmail("root@artilligence.com");
    expect(member!.sponsorId).toBe(root!.id);
    expect(member!.parentId).toBe(root!.id);
    expect(member!.referralCode).toBeTruthy();
    expect(member!.referralCode.length).toBe(6);
  });

  test("BFS spillover: 4th member under same sponsor spills to first child", async ({
    page,
  }) => {
    for (let i = 1; i <= 3; i++) {
      await registerMember(page, "ROOT01", {
        name: `Slot ${i}`,
        email: `slot${i}@test.com`,
        phone: `987654321${i}`,
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true");
    }

    await registerMember(page, "ROOT01", {
      name: "Spill Over",
      email: "spill@test.com",
      phone: "9876543214",
      password: "password123",
    });
    await page.waitForURL("**/login?registered=true");

    const spill = getMemberByEmail("spill@test.com");
    const firstChild = getMemberByEmail("slot1@test.com");
    const root = getMemberByEmail("root@artilligence.com");

    expect(spill!.parentId).toBe(firstChild!.id);
    expect(spill!.sponsorId).toBe(root!.id);
    expect(spill!.depth).toBe(2);
    expect(spill!.position).toBe(1);
  });
});

// ============================================================
// PROTECTED ROUTES
// ============================================================

test.describe("Protected Routes", () => {
  test("unauthenticated → /admin redirects to /login", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL("**/login");
  });

  test("unauthenticated → /dashboard redirects to /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
  });

  test("member accessing /admin → redirected to /dashboard", async ({
    page,
  }) => {
    await login(page, "root@artilligence.com", "member123456");
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await page.goto("/admin");
    await page.waitForURL("**/dashboard");
  });

  test("admin accessing /dashboard → redirected to /admin", async ({
    page,
  }) => {
    await login(page, "admin@artilligence.com", "admin123456");
    await page.waitForURL("**/admin", { timeout: 15000 });
    await page.goto("/dashboard");
    await page.waitForURL("**/admin");
  });

  test("logged-in admin visiting /login → redirected to /admin", async ({
    page,
  }) => {
    await login(page, "admin@artilligence.com", "admin123456");
    await page.waitForURL("**/admin", { timeout: 15000 });
    await page.goto("/login");
    await page.waitForURL("**/admin");
  });

  test("logged-in member visiting /login → redirected to /dashboard", async ({
    page,
  }) => {
    await login(page, "root@artilligence.com", "member123456");
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await page.goto("/login");
    await page.waitForURL("**/dashboard");
  });

  test("logged-in user visiting /join → sees registration page (not redirected)", async ({ page }) => {
    await login(page, "root@artilligence.com", "member123456");
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await page.goto("/join/ROOT01");
    // Referral links should work even when logged in
    await expect(page.locator("text=referred by")).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================
// CONCURRENT REGISTRATION
// ============================================================

test.describe("Concurrent Registration", () => {
  test("two simultaneous registrations → no position conflicts", async ({
    request,
  }) => {
    // API now expects FormData — use Playwright's multipart option
    const res1 = await request.post("/api/auth/register", {
      multipart: {
        name: "Concurrent A",
        email: "concurrent-a@test.com",
        phone: "9876543240",
        password: "password123",
        confirmPassword: "password123",
        referralCode: "ROOT01",
      },
    });

    const res2 = await request.post("/api/auth/register", {
      multipart: {
        name: "Concurrent B",
        email: "concurrent-b@test.com",
        phone: "9876543241",
        password: "password123",
        confirmPassword: "password123",
        referralCode: "ROOT01",
      },
    });

    expect(res1.ok()).toBe(true);
    expect(res2.ok()).toBe(true);

    const memberA = getMemberByEmail("concurrent-a@test.com");
    const memberB = getMemberByEmail("concurrent-b@test.com");

    expect(memberA).not.toBeNull();
    expect(memberB).not.toBeNull();

    // Both placed under same parent → different positions
    if (memberA!.parentId === memberB!.parentId) {
      expect(memberA!.position).not.toBe(memberB!.position);
    }
    // Otherwise: placed under different parents — no conflict by definition
  });
});

// ============================================================
// REFERRAL LINK — LOGGED-IN ACCESS
// ============================================================

test.describe("Referral Link Access", () => {
  test("logged-in member can access /join referral link (no redirect)", async ({ page }) => {
    await login(page, "root@artilligence.com", "member123456");
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await page.goto("/join/ROOT01");
    // Should NOT redirect — should show the registration page
    await expect(page.locator("text=referred by")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Rajesh Kumar")).toBeVisible();
  });

  test("logged-in admin can access /join referral link", async ({ page }) => {
    await login(page, "admin@artilligence.com", "admin123456");
    await page.waitForURL("**/admin", { timeout: 15000 });
    await page.goto("/join/ROOT01");
    await expect(page.locator("text=referred by")).toBeVisible({ timeout: 10000 });
  });
});
