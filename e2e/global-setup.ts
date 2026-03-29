import { chromium, type FullConfig } from "@playwright/test";
import type { Page, Browser } from "@playwright/test";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const MEMBER_EMAIL = "root@artilligence.com";
const MEMBER_PASSWORD = "member123456";

async function waitForApp(baseURL: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${baseURL}/login`);
      if (response.ok) {
        return;
      }
    } catch {
      // Give the dev server time to finish booting before failing the run.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`App did not become ready at ${baseURL}`);
}

async function resetRateLimiter(baseURL: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(`${baseURL}/api/dev/reset`, { method: "POST" });
      if (response.ok) {
        return;
      }
    } catch {
      // The dev server may still be compiling; retry shortly.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Failed to reset rate limiter during Playwright global setup");
}

async function loginAndWait(
  page: Page,
  baseURL: string,
  email: string,
  password: string,
  destinationPattern: string
) {
  let lastError = "unknown login failure";

  for (let attempt = 0; attempt < 5; attempt++) {
    await resetRateLimiter(baseURL);
    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    try {
      await page.waitForURL(destinationPattern, { timeout: 15000 });
      return;
    } catch {
      const errorText = await page.locator(".text-error").textContent().catch(() => null);
      lastError = errorText?.trim() || lastError;
    }
  }

  throw new Error(`Warmup login failed for ${email}: ${lastError}`);
}

async function warmAdminSales(baseURL: string, browser: Browser) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await loginAndWait(page, baseURL, ADMIN_EMAIL, ADMIN_PASSWORD, "**/admin**");

  await page.goto("/admin/sales");
  await page.waitForSelector('[data-testid="sales-tabs"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="sales-table"], [data-testid="sales-empty"]', {
    timeout: 30000,
  });

  await context.close();
}

async function warmMemberSales(baseURL: string, browser: Browser) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await loginAndWait(page, baseURL, MEMBER_EMAIL, MEMBER_PASSWORD, "**/dashboard");

  await page.goto("/dashboard/sales");
  await page.waitForSelector('[data-testid="sales-page"]', { timeout: 30000 });

  await context.close();
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use?.baseURL ?? "http://localhost:3005");

  await waitForApp(baseURL);
  await resetRateLimiter(baseURL);

  const browser = await chromium.launch({ headless: true });
  try {
    await warmAdminSales(baseURL, browser);
    await resetRateLimiter(baseURL);
    await warmMemberSales(baseURL, browser);
    await resetRateLimiter(baseURL);
  } finally {
    await browser.close();
  }
}
