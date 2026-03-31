import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Docker Deployment Tests (Task 34)
 *
 * These tests verify the production Docker setup works correctly.
 * They run against the production Docker compose (not dev).
 *
 * Prerequisites:
 *   APP_PORT=3007 docker compose up -d --build
 *   docker compose --profile seed run --rm seed
 */

const PROJECT_DIR = "/home/deathstar/2026/Projects/JanFebMarApr/Artilligence";
const DOCKER_PORT = process.env.DOCKER_APP_PORT || "3007";
const BASE_URL = `http://localhost:${DOCKER_PORT}`;

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const ROOT_EMAIL = "root@artilligence.com";
const ROOT_PASSWORD = "member123456";

function dockerExec(cmd: string): string {
  return execSync(cmd, { cwd: PROJECT_DIR, encoding: "utf-8", timeout: 30000 }).trim();
}

function dbQuery(sql: string): string {
  const escaped = sql.replace(/"/g, '\\"');
  const result = execSync(
    `docker compose exec -T db psql -U artilligence -d artilligence -t -A -c "${escaped}" 2>&1`,
    { cwd: PROJECT_DIR, encoding: "utf-8" }
  ).trim();
  if (result.startsWith("ERROR:") || result.includes("\nERROR:")) {
    throw new Error(`SQL error: ${result}`);
  }
  return result;
}

async function resetRateLimiter() {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/dev/reset`, { method: "POST" });
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}

test.describe("Docker Deployment", () => {
  test.beforeEach(async () => {
    await resetRateLimiter();
  });

  // ──────────────────────────────────────────────────────────
  // 1. Container Status
  // ──────────────────────────────────────────────────────────
  test.describe("Container Status", () => {
    test("docker compose up → app and db containers are running", () => {
      const ps = dockerExec("docker compose ps --format json");
      const lines = ps.split("\n").filter(Boolean);
      const containers = lines.map((l) => JSON.parse(l));

      const app = containers.find(
        (c: { Service: string }) => c.Service === "app"
      );
      const db = containers.find(
        (c: { Service: string }) => c.Service === "db"
      );

      expect(app).toBeTruthy();
      expect(db).toBeTruthy();
      expect(app.State).toBe("running");
      expect(db.State).toBe("running");
    });

    test("app container uses production target (NODE_ENV=production)", () => {
      const nodeEnv = dockerExec(
        "docker compose exec -T app sh -c 'echo $NODE_ENV'"
      );
      expect(nodeEnv).toBe("production");
    });

    test("app container is healthy", () => {
      const ps = dockerExec("docker compose ps --format json");
      const lines = ps.split("\n").filter(Boolean);
      const containers = lines.map((l) => JSON.parse(l));
      const app = containers.find(
        (c: { Service: string }) => c.Service === "app"
      );
      expect(app.Health).toBe("healthy");
    });

    test("db container is healthy", () => {
      const ps = dockerExec("docker compose ps --format json");
      const lines = ps.split("\n").filter(Boolean);
      const containers = lines.map((l) => JSON.parse(l));
      const db = containers.find(
        (c: { Service: string }) => c.Service === "db"
      );
      expect(db.Health).toBe("healthy");
    });
  });

  // ──────────────────────────────────────────────────────────
  // 2. Health Check
  // ──────────────────────────────────────────────────────────
  test.describe("Health Check", () => {
    test("GET /api/health returns 200 with healthy status", async () => {
      const res = await fetch(`${BASE_URL}/api/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("healthy");
      expect(body.database).toBe("connected");
      expect(body.timestamp).toBeTruthy();
    });

    test("health check verifies database connectivity", async () => {
      const res = await fetch(`${BASE_URL}/api/health`);
      const body = await res.json();
      expect(body.database).toBe("connected");
    });
  });

  // ──────────────────────────────────────────────────────────
  // 3. Network Security
  // ──────────────────────────────────────────────────────────
  test.describe("Network Security", () => {
    test("database port is NOT exposed to external network", () => {
      const ps = dockerExec("docker compose ps --format json");
      const lines = ps.split("\n").filter(Boolean);
      const containers = lines.map((l) => JSON.parse(l));
      const db = containers.find(
        (c: { Service: string }) => c.Service === "db"
      );

      // The Ports field should NOT contain a host mapping (0.0.0.0:xxxx->5432)
      const ports = String(db.Ports || "");
      expect(ports).not.toContain("0.0.0.0");
      expect(ports).not.toMatch(/\d+->5432/);
    });

    test("app is accessible on the configured port", async () => {
      const res = await fetch(`${BASE_URL}/api/health`);
      expect(res.status).toBe(200);
    });
  });

  // ──────────────────────────────────────────────────────────
  // 4. Authentication in Docker
  // ──────────────────────────────────────────────────────────
  test.describe("Authentication in Docker", () => {
    test("admin can login via UI", async ({ browser }) => {
      await resetRateLimiter();
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();

      await page.goto("/login");
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });
      await page.fill('input[name="email"]', ADMIN_EMAIL);
      await page.fill('input[name="password"]', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("**/admin**", { timeout: 15000 });

      expect(page.url()).toContain("/admin");
      await context.close();
    });

    test("member can login via UI", async ({ browser }) => {
      await resetRateLimiter();
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();

      await page.goto("/login");
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });
      await page.fill('input[name="email"]', ROOT_EMAIL);
      await page.fill('input[name="password"]', ROOT_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("**/dashboard**", { timeout: 15000 });

      expect(page.url()).toContain("/dashboard");
      await context.close();
    });

    test("member can register via UI", async ({ browser }) => {
      await resetRateLimiter();
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();

      const ts = Date.now();
      await page.goto("/join/ROOT01");
      await page.waitForSelector('input[name="name"]', { timeout: 10000 });
      await page.fill('input[name="name"]', `Docker Test ${ts}`);
      await page.fill('input[name="email"]', `docker-${ts}@test.com`);
      await page.fill('input[name="phone"]', `98765${String(ts).slice(-5)}`);
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");
      await page.click('button[type="submit"]');
      await page.waitForURL("**/login**", { timeout: 15000 });

      // Verify user was created in the database
      const count = dbQuery(
        `SELECT COUNT(*) FROM users WHERE email='docker-${ts}@test.com'`
      );
      expect(parseInt(count)).toBe(1);

      // Clean up
      dbQuery(`DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE email='docker-${ts}@test.com')`);
      dbQuery(`DELETE FROM users WHERE email='docker-${ts}@test.com'`);

      await context.close();
    });
  });

  // ──────────────────────────────────────────────────────────
  // 5. File Upload + Volume
  // ──────────────────────────────────────────────────────────
  test.describe("File Upload + Volume Persistence", () => {
    test("file upload works (bill photo via sale submission)", async ({
      browser,
    }) => {
      // Restart app to clear in-memory rate limits (dev/reset not available in production)
      dockerExec("docker compose restart app");
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/health`);
          if (res.ok) break;
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 2000));
      }

      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();

      // Login as root member
      await page.goto("/login");
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });
      await page.fill('input[name="email"]', ROOT_EMAIL);
      await page.fill('input[name="password"]', ROOT_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("**/dashboard**", { timeout: 15000 });

      // Navigate to sales page
      await page.goto("/dashboard/sales");
      await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });

      // Click submit sale button
      await page.click('[data-testid="submit-sale-button"]');
      await page.waitForSelector('[data-testid="sale-form"]', { timeout: 10000 });

      // Fill sale form
      const billCode = `MB-${Date.now()}`;
      await page.fill('[data-testid="input-billCode"]', billCode);
      await page.fill('[data-testid="input-customerName"]', "Docker Upload Test");
      await page.fill('[data-testid="input-customerPhone"]', "9876500099");
      await page.fill('[data-testid="input-saleDate"]', "2026-03-30");

      // Add a product
      const productSelect = page.locator('[data-testid="product-select-0"]');
      await productSelect.selectOption({ index: 1 });
      await page.fill('[data-testid="product-qty-0"]', "1");

      // Create a test image for upload
      const tmpImage = path.join("/tmp", `test-bill-${Date.now()}.png`);
      // Minimal valid PNG (1x1 red pixel)
      const pngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
        "base64"
      );
      fs.writeFileSync(tmpImage, pngBuffer);

      // Upload bill photo
      const fileInput = page.locator('[data-testid="input-billPhoto"]');
      await fileInput.setInputFiles(tmpImage);

      // Submit the sale
      await page.click('[data-testid="submit-sale-form"]');

      // Wait for success
      await page.waitForSelector('[data-testid="sale-success"], [data-testid="sales-table"]', {
        timeout: 15000,
      });

      // Verify sale was created with bill photo
      const photoPath = dbQuery(
        `SELECT bill_photo_path FROM sales WHERE bill_code='${billCode}'`
      );
      expect(photoPath).toBeTruthy();
      expect(photoPath.length).toBeGreaterThan(0);

      // Verify the uploaded file exists inside the container
      const fileExists = dockerExec(
        `docker compose exec -T app sh -c "test -f /app${photoPath} && echo yes || echo no"`
      );
      expect(fileExists).toBe("yes");

      // Clean up local temp file
      fs.unlinkSync(tmpImage);

      // Clean up test sale
      dbQuery(`DELETE FROM sale_flags WHERE sale_id IN (SELECT id FROM sales WHERE bill_code='${billCode}')`);
      dbQuery(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE bill_code='${billCode}')`);
      dbQuery(`DELETE FROM sales WHERE bill_code='${billCode}'`);

      await context.close();
    });
  });

  // ──────────────────────────────────────────────────────────
  // 6. Database Persistence
  // ──────────────────────────────────────────────────────────
  test.describe("Persistence Across Restart", () => {
    test("database data persists across container restart", async () => {
      // Insert a marker row
      const marker = `persist-test-${Date.now()}`;
      dbQuery(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('${marker}', 'test', NOW()) ON CONFLICT (key) DO UPDATE SET value='test'`
      );

      // Verify marker exists
      const before = dbQuery(
        `SELECT value FROM app_settings WHERE key='${marker}'`
      );
      expect(before).toBe("test");

      // Restart containers
      dockerExec("docker compose restart");
      // Wait for app to come back
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/health`);
          if (res.ok) break;
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Verify data persisted
      const after = dbQuery(
        `SELECT value FROM app_settings WHERE key='${marker}'`
      );
      expect(after).toBe("test");

      // Clean up
      dbQuery(`DELETE FROM app_settings WHERE key='${marker}'`);
    });

    test("uploaded photos persist across container restart", async () => {
      // Create a test file in the uploads volume
      dockerExec(
        'docker compose exec -T app sh -c "echo test-persist > /app/uploads/persist-test.txt"'
      );

      // Verify file exists
      const before = dockerExec(
        'docker compose exec -T app sh -c "cat /app/uploads/persist-test.txt"'
      );
      expect(before).toBe("test-persist");

      // Restart the app container only
      dockerExec("docker compose restart app");
      // Wait for app to come back
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/health`);
          if (res.ok) break;
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Verify file still exists
      const after = dockerExec(
        'docker compose exec -T app sh -c "cat /app/uploads/persist-test.txt"'
      );
      expect(after).toBe("test-persist");

      // Clean up
      dockerExec(
        'docker compose exec -T app sh -c "rm /app/uploads/persist-test.txt"'
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // 7. Migrations
  // ──────────────────────────────────────────────────────────
  test.describe("Migrations", () => {
    test("migrations ran automatically on container start", () => {
      const logs = dockerExec("docker compose logs app");
      expect(logs).toContain("Migrations complete.");
    });

    test("all migration tables exist in database", () => {
      const tables = [
        "users",
        "sales",
        "sale_items",
        "products",
        "commissions",
        "commission_settings",
        "wallets",
        "wallet_transactions",
        "sale_flags",
        "notifications",
        "announcements",
        "audit_logs",
        "commission_rate_history",
        "app_settings",
        "report_jobs",
      ];

      for (const table of tables) {
        const exists = dbQuery(
          `SELECT COUNT(*) FROM information_schema.tables WHERE table_name='${table}'`
        );
        expect(parseInt(exists), `Table '${table}' should exist`).toBe(1);
      }
    });

    test("prisma migrations table shows all migrations applied", () => {
      const count = dbQuery(
        "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL"
      );
      expect(parseInt(count)).toBeGreaterThan(0);

      // No failed migrations
      const failed = dbQuery(
        "SELECT COUNT(*) FROM _prisma_migrations WHERE rolled_back_at IS NOT NULL"
      );
      expect(parseInt(failed)).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // 8. Environment Variables
  // ──────────────────────────────────────────────────────────
  test.describe("Environment Variables", () => {
    test("NEXTAUTH_SECRET is set in the container", () => {
      const secret = dockerExec(
        "docker compose exec -T app sh -c 'echo $NEXTAUTH_SECRET'"
      );
      expect(secret.length).toBeGreaterThan(0);
    });

    test("DATABASE_URL is set and points to the db service", () => {
      const url = dockerExec(
        "docker compose exec -T app sh -c 'echo $DATABASE_URL'"
      );
      expect(url).toContain("@db:");
      expect(url).toContain("postgresql://");
    });

    test("NEXTAUTH_URL is set", () => {
      const url = dockerExec(
        "docker compose exec -T app sh -c 'echo $NEXTAUTH_URL'"
      );
      expect(url).toContain("http");
    });

    test("NODE_ENV is production", () => {
      const env = dockerExec(
        "docker compose exec -T app sh -c 'echo $NODE_ENV'"
      );
      expect(env).toBe("production");
    });
  });

  // ──────────────────────────────────────────────────────────
  // 9. Seed Data Verification
  // ──────────────────────────────────────────────────────────
  test.describe("Seed Data", () => {
    test("admin account exists", () => {
      const count = dbQuery(
        `SELECT COUNT(*) FROM users WHERE email='${ADMIN_EMAIL}' AND role='ADMIN'`
      );
      expect(parseInt(count)).toBe(1);
    });

    test("root member exists with wallet", () => {
      const count = dbQuery(
        `SELECT COUNT(*) FROM users WHERE email='${ROOT_EMAIL}' AND role='MEMBER'`
      );
      expect(parseInt(count)).toBe(1);

      const walletCount = dbQuery(
        `SELECT COUNT(*) FROM wallets w JOIN users u ON w.user_id=u.id WHERE u.email='${ROOT_EMAIL}'`
      );
      expect(parseInt(walletCount)).toBe(1);
    });

    test("commission settings exist (7 levels)", () => {
      const count = dbQuery("SELECT COUNT(*) FROM commission_settings");
      expect(parseInt(count)).toBe(7);
    });

    test("products exist", () => {
      const count = dbQuery("SELECT COUNT(*) FROM products");
      expect(parseInt(count)).toBeGreaterThanOrEqual(7);
    });

    test("app settings exist", () => {
      const count = dbQuery("SELECT COUNT(*) FROM app_settings");
      expect(parseInt(count)).toBeGreaterThanOrEqual(4);
    });
  });

  // ──────────────────────────────────────────────────────────
  // 10. Production Build Optimizations
  // ──────────────────────────────────────────────────────────
  test.describe("Production Build", () => {
    test("standalone output is used (server.js exists)", () => {
      const exists = dockerExec(
        'docker compose exec -T app sh -c "test -f /app/server.js && echo yes || echo no"'
      );
      expect(exists).toBe("yes");
    });

    test("uploads directory exists and is writable", () => {
      const result = dockerExec(
        'docker compose exec -T app sh -c "touch /app/uploads/.test && rm /app/uploads/.test && echo ok"'
      );
      expect(result).toBe("ok");
    });

    test(".env.example file exists in project", () => {
      const exists = fs.existsSync(
        path.join(PROJECT_DIR, ".env.example")
      );
      expect(exists).toBe(true);
    });

    test("deployment documentation exists", () => {
      const exists = fs.existsSync(
        path.join(PROJECT_DIR, "docs", "deployment.md")
      );
      expect(exists).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // 11. Full Stack Smoke Test
  // ──────────────────────────────────────────────────────────
  test.describe("Full Stack Smoke Test", () => {
    test("admin can view members list", async ({ browser }) => {
      // Restart app to clear in-memory rate limits
      dockerExec("docker compose restart app");
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/health`);
          if (res.ok) break;
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();

      await page.goto("/login");
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });
      await page.fill('input[name="email"]', ADMIN_EMAIL);
      await page.fill('input[name="password"]', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("**/admin**", { timeout: 15000 });

      // Visit members page
      await page.goto("/admin/members");
      await page.waitForSelector('[data-testid="members-table"], [data-testid="members-page"]', {
        timeout: 15000,
      });

      // Should see at least root member
      const rows = page.locator("tbody tr");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(1);

      await context.close();
    });

    test("login page renders correctly in production build", async ({
      browser,
    }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();

      await page.goto("/login");
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });

      // Check form elements are present
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // CSS is loaded (check a basic styled element)
      const button = page.locator('button[type="submit"]');
      const bg = await button.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor
      );
      // Should have some color (not transparent)
      expect(bg).not.toBe("rgba(0, 0, 0, 0)");

      await context.close();
    });

    test("member dashboard loads with data", async ({ browser }) => {
      // Restart app to clear in-memory rate limits
      dockerExec("docker compose restart app");
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/health`);
          if (res.ok) break;
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();

      await page.goto("/login");
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });
      await page.fill('input[name="email"]', ROOT_EMAIL);
      await page.fill('input[name="password"]', ROOT_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("**/dashboard**", { timeout: 15000 });

      // Dashboard should render (check any dashboard element)
      await page.waitForSelector('[data-testid="dashboard-home"], [data-testid="dashboard-shell"]', {
        timeout: 15000,
      });

      await context.close();
    });
  });
});
