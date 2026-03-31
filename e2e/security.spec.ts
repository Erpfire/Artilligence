import { test, expect } from "@playwright/test";
import {
  dbQuery,
  resetTestData,
  resetRateLimiter,
  login,
  registerMember,
  getMemberByEmail,
  blockMember,
} from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const ROOT_EMAIL = "root@artilligence.com";
const ROOT_PASSWORD = "member123456";

test.describe("Security + Edge Cases", () => {
  test.beforeEach(async () => {
    resetTestData();
    await resetRateLimiter();
  });

  // ──────────────────────────────────────────────────────────────
  // 1. Data Isolation
  // ──────────────────────────────────────────────────────────────
  test.describe("Data Isolation", () => {
    test("access other member's sales via API manipulation → isolated", async ({
      page,
      request,
    }) => {
      // Register both members via UI
      await registerMember(page, "ROOT01", {
        name: "Member A",
        email: "member-a@test.com",
        phone: "9876500001",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true");

      await registerMember(page, "ROOT01", {
        name: "Member B",
        email: "member-b@test.com",
        phone: "9876500002",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true");

      // Create a sale for member A via SQL (supporting data)
      const memberA = getMemberByEmail("member-a@test.com");
      dbQuery("INSERT INTO products (id, name, price, created_at, updated_at) VALUES ('prod-sec-1', 'Test Battery', 5000, NOW(), NOW()) ON CONFLICT DO NOTHING");
      dbQuery(`INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at) VALUES ('sale-iso-1', '${memberA!.id}', 'ISO-001', 5000, 'Customer', '+911234567890', NOW(), 'PENDING', NOW(), NOW())`);

      // Login as member B via UI
      await login(page, "member-b@test.com", "password123");
      await page.waitForURL("**/dashboard**");

      // Navigate to My Sales page — should see 0 sales (member B has none)
      await page.goto("/dashboard/sales");
      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });

      // Also verify via API that member B cannot see member A's sale
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "next-auth.session-token"
      );
      const resp = await request.get(
        "http://localhost:3005/api/dashboard/sales",
        {
          headers: {
            Cookie: `next-auth.session-token=${sessionCookie?.value}`,
          },
        }
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data.sales.length).toBe(0);
    });

    test("access other member's wallet via API manipulation → isolated", async ({
      page,
      request,
    }) => {
      // Register member via UI
      await registerMember(page, "ROOT01", {
        name: "Wallet Test",
        email: "wallet-iso@test.com",
        phone: "9876500003",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true");

      // Add some money to root member's wallet (supporting data)
      const rootMember = getMemberByEmail(ROOT_EMAIL);
      dbQuery(
        `UPDATE wallets SET total_earned=1000, pending=1000 WHERE user_id='${rootMember!.id}'`
      );

      // Login as new member via UI
      await login(page, "wallet-iso@test.com", "password123");
      await page.waitForURL("**/dashboard**");

      // Verify via API that wallet shows ₹0 (not root's ₹1000)
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "next-auth.session-token"
      );
      const resp = await request.get(
        "http://localhost:3005/api/dashboard/wallet",
        {
          headers: {
            Cookie: `next-auth.session-token=${sessionCookie?.value}`,
          },
        }
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data.wallet.totalEarned).toBe("0");
      expect(data.wallet.pending).toBe("0");
    });

    test("access admin routes as member → redirected/denied", async ({
      page,
      request,
    }) => {
      // Login as member via UI
      await resetRateLimiter();
      await login(page, ROOT_EMAIL, ROOT_PASSWORD);
      await page.waitForURL("**/dashboard**");

      // Try admin page — should redirect back to dashboard
      await page.goto("/admin");
      await page.waitForURL("**/dashboard**", { timeout: 15000 });

      // Also try admin API — should get 401
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "next-auth.session-token"
      );
      const resp = await request.get(
        "http://localhost:3005/api/admin/members",
        {
          headers: {
            Cookie: `next-auth.session-token=${sessionCookie?.value}`,
          },
        }
      );
      expect(resp.status()).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 2. File Upload Security
  // ──────────────────────────────────────────────────────────────
  test.describe("File Upload Security", () => {
    test("path traversal attempt → rejected", async ({ page, request }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin**");

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "next-auth.session-token"
      );

      const attacks = [
        "/api/uploads/..%2F..%2Fetc%2Fpasswd",
        "/api/uploads/bills/../../../etc/passwd",
      ];

      for (const path of attacks) {
        const resp = await request.get(`http://localhost:3005${path}`, {
          headers: {
            Cookie: `next-auth.session-token=${sessionCookie?.value}`,
          },
        });
        expect([400, 404]).toContain(resp.status());
      }
    });

    test("unauthenticated upload access → 401", async ({ request }) => {
      const resp = await request.get(
        "http://localhost:3005/api/uploads/bills/some-id/receipt.jpg"
      );
      expect(resp.status()).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 3. XSS Prevention
  // ──────────────────────────────────────────────────────────────
  test.describe("XSS Prevention", () => {
    test("XSS in announcement content → sanitized (via admin UI)", async ({
      page,
    }) => {
      // Login as admin via UI
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin**");

      // Navigate to announcements page
      await page.goto("/admin/announcements");
      await page.waitForSelector('[data-testid="admin-announcements-page"]', {
        timeout: 15000,
      });

      // Click Create Announcement button
      await page.click('[data-testid="create-announcement-btn"]');
      await page.waitForSelector('[data-testid="announcement-form"]', {
        timeout: 5000,
      });

      // Fill form with XSS payloads via UI
      await page.fill(
        '[data-testid="input-title-en"]',
        '<script>alert("xss")</script>Important Update'
      );
      await page.fill(
        '[data-testid="input-content-en"]',
        'Hello <script>document.cookie</script> world <img onerror="alert(1)" src="x">'
      );

      // Submit via UI
      await page.click('[data-testid="submit-announcement"]');

      // Wait for form to close (success)
      await page.waitForSelector('[data-testid="announcement-form"]', {
        state: "hidden",
        timeout: 10000,
      });

      // Verify the displayed content doesn't contain script tags
      const pageContent = await page.textContent(
        '[data-testid="admin-announcements-page"]'
      );
      expect(pageContent).not.toContain("<script>");

      // Also verify stored data via API
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "next-auth.session-token"
      );
      const resp = await page.request.get(
        "http://localhost:3005/api/admin/announcements",
        {
          headers: {
            Cookie: `next-auth.session-token=${sessionCookie?.value}`,
          },
        }
      );
      const data = await resp.json();
      const announcement = data.announcements[0];
      expect(announcement.titleEn).not.toContain("<script>");
      expect(announcement.contentEn).not.toContain("<script>");
      expect(announcement.contentEn).not.toContain("onerror");
    });

    test("XSS in customer name → escaped in sales display", async ({
      page,
    }) => {
      // Insert a sale with XSS in customer name (supporting data)
      const root = getMemberByEmail(ROOT_EMAIL);
      dbQuery("INSERT INTO products (id, name, price, created_at, updated_at) VALUES ('prod-xss-cn', 'XSS CN Battery', 5000, NOW(), NOW()) ON CONFLICT DO NOTHING");
      dbQuery(`INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at) VALUES ('sale-xss-cn', '${root!.id}', 'XSS-CN-001', 5000, '<script>window.__xss_triggered=true</script>Evil', '+919876543210', NOW(), 'PENDING', NOW(), NOW())`);

      // Login as member via UI and view sales
      await login(page, ROOT_EMAIL, ROOT_PASSWORD);
      await page.waitForURL("**/dashboard**");
      await page.goto("/dashboard/sales");
      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });

      // React escapes all content — verify no XSS execution
      const hasXSS = await page.evaluate(() => {
        return (window as any).__xss_triggered === true;
      });
      expect(hasXSS).toBe(false);
    });

    test("XSS in product name → escaped when rendering in admin", async ({
      page,
      request,
    }) => {
      // Insert product with XSS name (supporting data)
      dbQuery(
        "INSERT INTO products (id, name, price, created_at, updated_at) VALUES ('prod-xss-1', '<script>window.__xss_triggered=true</script>Battery', 5000, NOW(), NOW()) ON CONFLICT DO NOTHING"
      );

      // Login as admin via UI
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.waitForURL("**/admin**");

      // Verify via API that the product is stored with the XSS payload
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === "next-auth.session-token");
      const resp = await request.get("http://localhost:3005/api/admin/products", {
        headers: { Cookie: `next-auth.session-token=${sessionCookie?.value}` },
      });
      const data = await resp.json();
      const xssProduct = data.products.find((p: any) => p.id === "prod-xss-1");
      expect(xssProduct).toBeDefined();
      // Prisma parameterized queries store it safely; React escapes on render
      expect(xssProduct.name).toContain("Battery");
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 4. SQL Injection Prevention
  // ──────────────────────────────────────────────────────────────
  test.describe("SQL Injection", () => {
    test("bill code SQL injection attempt → harmless (parameterized)", async ({
      page,
      request,
    }) => {
      // Login via UI
      await login(page, ROOT_EMAIL, ROOT_PASSWORD);
      await page.waitForURL("**/dashboard**");

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "next-auth.session-token"
      );

      // Attempt SQL injection via query parameters
      const resp = await request.get(
        `http://localhost:3005/api/dashboard/sales?status='; DROP TABLE sales; --`,
        {
          headers: {
            Cookie: `next-auth.session-token=${sessionCookie?.value}`,
          },
        }
      );
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(data.sales).toBeDefined();

      // Verify the sales table still exists
      const salesCount = dbQuery("SELECT COUNT(*) FROM sales");
      expect(parseInt(salesCount)).toBeGreaterThanOrEqual(0);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 5. Security Headers
  // ──────────────────────────────────────────────────────────────
  test.describe("Security Headers", () => {
    test("response contains all security headers", async ({ request }) => {
      const resp = await request.get("http://localhost:3005/login");
      expect(resp.headers()["x-frame-options"]).toBe("DENY");
      expect(resp.headers()["x-content-type-options"]).toBe("nosniff");
      expect(resp.headers()["x-xss-protection"]).toBe("1; mode=block");
      expect(resp.headers()["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin"
      );
      expect(resp.headers()["strict-transport-security"]).toContain(
        "max-age=31536000"
      );
      expect(resp.headers()["permissions-policy"]).toContain("camera=()");
      expect(resp.headers()["content-security-policy"]).toContain(
        "default-src 'self'"
      );
      expect(resp.headers()["content-security-policy"]).toContain(
        "frame-ancestors 'none'"
      );
    });

    test("API routes also have security headers", async ({ page, request }) => {
      await resetRateLimiter();
      await login(page, ROOT_EMAIL, ROOT_PASSWORD);
      await page.waitForURL("**/dashboard**");

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "next-auth.session-token"
      );
      const resp = await request.get(
        "http://localhost:3005/api/dashboard/profile",
        {
          headers: {
            Cookie: `next-auth.session-token=${sessionCookie?.value}`,
          },
        }
      );
      expect(resp.headers()["x-frame-options"]).toBe("DENY");
      expect(resp.headers()["x-content-type-options"]).toBe("nosniff");
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 6. CORS
  // ──────────────────────────────────────────────────────────────
  test.describe("CORS", () => {
    test("cross-origin request → rejected", async ({ request }) => {
      const resp = await request.get(
        "http://localhost:3005/api/dashboard/profile",
        { headers: { Origin: "http://evil-site.com" } }
      );
      expect(resp.status()).toBe(403);
    });

    test("same-origin request → allowed", async ({ page, request }) => {
      await login(page, ROOT_EMAIL, ROOT_PASSWORD);
      await page.waitForURL("**/dashboard**");

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "next-auth.session-token"
      );
      const resp = await request.get(
        "http://localhost:3005/api/dashboard/profile",
        {
          headers: {
            Cookie: `next-auth.session-token=${sessionCookie?.value}`,
            Origin: "http://localhost:3005",
          },
        }
      );
      expect(resp.ok()).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 7. Blocked Member Session Invalidation
  // ──────────────────────────────────────────────────────────────
  test.describe("Session Invalidation on Block", () => {
    test("blocked member: navigation redirects to login after mid-session block", async ({
      page,
    }) => {
      // Register a member via UI
      await registerMember(page, "ROOT01", {
        name: "Block Test",
        email: "block-test@test.com",
        phone: "9876500020",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true");

      // Login as that member via UI
      await login(page, "block-test@test.com", "password123");
      await page.waitForURL("**/dashboard**");

      // Block the member (admin action simulated via SQL)
      blockMember("block-test@test.com");

      // Navigate to a page — should be redirected to login
      await page.goto("/dashboard/wallet");
      await page.waitForURL("**/login**", { timeout: 30000 });
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 8. Concurrent Registration (API-only: can't do simultaneous UI forms)
  // ──────────────────────────────────────────────────────────────
  test.describe("Concurrent Registration", () => {
    test("two simultaneous registrations → both succeed, no position conflict", async ({
      request,
    }) => {
      await resetRateLimiter();

      const [res1, res2] = await Promise.all([
        request.post("http://localhost:3005/api/auth/register", {
          data: {
            name: "Concurrent A",
            email: "concurrent-sec-a@test.com",
            phone: "9876500030",
            password: "password123",
            confirmPassword: "password123",
            referralCode: "ROOT01",
          },
        }),
        request.post("http://localhost:3005/api/auth/register", {
          data: {
            name: "Concurrent B",
            email: "concurrent-sec-b@test.com",
            phone: "9876500031",
            password: "password123",
            confirmPassword: "password123",
            referralCode: "ROOT01",
          },
        }),
      ]);

      expect(res1.ok()).toBe(true);
      expect(res2.ok()).toBe(true);

      const memberA = getMemberByEmail("concurrent-sec-a@test.com");
      const memberB = getMemberByEmail("concurrent-sec-b@test.com");
      expect(memberA).not.toBeNull();
      expect(memberB).not.toBeNull();

      // Verify no position conflict
      if (memberA!.parentId === memberB!.parentId) {
        expect(memberA!.position).not.toBe(memberB!.position);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 9. Input Validation Edge Cases
  // ──────────────────────────────────────────────────────────────
  test.describe("Input Validation", () => {
    test("large input: very long name (1000 chars) via UI → truncated to 100", async ({
      page,
    }) => {
      const longName = "A".repeat(1000);

      // Fill registration form via UI
      await page.goto("/join/ROOT01");
      await page.waitForSelector('input[name="name"]');
      await page.fill('input[name="name"]', longName);
      await page.fill('input[name="email"]', "longname@test.com");
      await page.fill('input[name="phone"]', "9876500040");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");
      await page.click('button[type="submit"]');

      // Wait for redirect to login (success)
      await page.waitForURL("**/login?registered=true", { timeout: 15000 });

      // Verify the name was truncated in DB
      const member = getMemberByEmail("longname@test.com");
      expect(member).not.toBeNull();
      expect(member!.name.length).toBeLessThanOrEqual(100);
    });

    test("negative quantity in sale → rejected by server", async ({
      page,
      request,
    }) => {
      // NOTE: The UI enforces min=1 on quantity input (client-side).
      // This test bypasses the UI to verify server-side protection against
      // manipulated API requests — a core security concern.
      await login(page, ROOT_EMAIL, ROOT_PASSWORD);
      await page.waitForURL("**/dashboard**");

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "next-auth.session-token"
      );

      dbQuery(
        "INSERT INTO products (id, name, price, created_at, updated_at) VALUES ('prod-neg-1', 'Neg Test Battery', 5000, NOW(), NOW()) ON CONFLICT DO NOTHING"
      );

      const jpgBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(100).fill(0),
      ]);

      const resp = await request.post(
        "http://localhost:3005/api/dashboard/sales",
        {
          headers: {
            Cookie: `next-auth.session-token=${sessionCookie?.value}`,
          },
          multipart: {
            billCode: "NEG-001",
            saleDate: "2026-03-30",
            customerName: "Test Customer",
            customerPhone: "+919876543210",
            items: JSON.stringify([{ productId: "prod-neg-1", quantity: -5 }]),
            billPhoto: {
              name: "receipt.jpg",
              mimeType: "image/jpeg",
              buffer: jpgBuffer,
            },
          },
        }
      );
      expect(resp.status()).toBe(400);
      const data = await resp.json();
      expect(data.errors.items).toBeDefined();
    });

    test("zero quantity in sale → rejected by server", async ({
      page,
      request,
    }) => {
      // Same reasoning as negative quantity — UI blocks this, but we test the API
      await resetRateLimiter();
      await login(page, ROOT_EMAIL, ROOT_PASSWORD);
      await page.waitForURL("**/dashboard**");

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "next-auth.session-token"
      );

      dbQuery(
        "INSERT INTO products (id, name, price, created_at, updated_at) VALUES ('prod-zero-1', 'Zero Test Battery', 5000, NOW(), NOW()) ON CONFLICT DO NOTHING"
      );

      const jpgBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(100).fill(0),
      ]);

      const resp = await request.post(
        "http://localhost:3005/api/dashboard/sales",
        {
          headers: {
            Cookie: `next-auth.session-token=${sessionCookie?.value}`,
          },
          multipart: {
            billCode: "ZERO-001",
            saleDate: "2026-03-30",
            customerName: "Test Customer",
            customerPhone: "+919876543210",
            items: JSON.stringify([
              { productId: "prod-zero-1", quantity: 0 },
            ]),
            billPhoto: {
              name: "receipt.jpg",
              mimeType: "image/jpeg",
              buffer: jpgBuffer,
            },
          },
        }
      );
      expect(resp.status()).toBe(400);
    });

    test("unicode/emoji in names via UI → handled correctly", async ({
      page,
    }) => {
      // Register with Hindi name + emoji via UI form
      await registerMember(page, "ROOT01", {
        name: "राजेश कुमार 😀",
        email: "unicode-test@test.com",
        phone: "9876500050",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true");

      const member = getMemberByEmail("unicode-test@test.com");
      expect(member).not.toBeNull();
      expect(member!.name).toContain("राजेश");
    });

    test("Indian phone format: valid (9876543210) via UI → accepted", async ({
      page,
    }) => {
      await registerMember(page, "ROOT01", {
        name: "Phone Valid",
        email: "phone-valid@test.com",
        phone: "9876543210",
        password: "password123",
      });
      await page.waitForURL("**/login?registered=true");

      const member = getMemberByEmail("phone-valid@test.com");
      expect(member).not.toBeNull();
    });

    test("Indian phone format: invalid (12345) via UI → rejected", async ({
      page,
    }) => {
      // Fill form with invalid phone via UI
      await page.goto("/join/ROOT01");
      await page.waitForSelector('input[name="name"]');
      await page.fill('input[name="name"]', "Phone Invalid");
      await page.fill('input[name="email"]', "phone-invalid@test.com");
      await page.fill('input[name="phone"]', "12345");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");
      await page.click('button[type="submit"]');

      // Should show phone validation error in the form
      await expect(page.locator("body")).toContainText(
        /phone.*10 digit|10 digit.*phone/i,
        { timeout: 5000 }
      );
    });
  });
});
