import { test, expect, Page } from "@playwright/test";
import {
  resetTestData,
  login,
  dbQuery,
  resetRateLimiter,
  ensureRootMember,
  registerMember,
} from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const MEMBER_EMAIL = "root@artilligence.com";
const MEMBER_PASSWORD = "member123456";

const MEMBER_PW_HASH =
  "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

function getRootMemberId(): string {
  return dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
}

function getAdminId(): string {
  return dbQuery("SELECT id FROM users WHERE email='admin@artilligence.com'");
}

function cleanNotifications() {
  dbQuery("DELETE FROM notifications");
}

function cleanAnnouncements() {
  dbQuery("DELETE FROM announcements");
}

function insertNotification(opts: {
  userId: string;
  title: string;
  titleHi?: string;
  body?: string;
  bodyHi?: string;
  link?: string;
  isRead?: boolean;
}) {
  const isRead = opts.isRead ? "true" : "false";
  dbQuery(
    `INSERT INTO notifications (id, user_id, title, title_hi, body, body_hi, link, is_read, created_at)
     VALUES (gen_random_uuid(), '${opts.userId}', '${opts.title}', ${opts.titleHi ? `'${opts.titleHi}'` : "NULL"}, ${opts.body ? `'${opts.body}'` : "NULL"}, ${opts.bodyHi ? `'${opts.bodyHi}'` : "NULL"}, ${opts.link ? `'${opts.link}'` : "NULL"}, ${isRead}, NOW())`
  );
}

function getNotificationCount(userId: string): number {
  return parseInt(dbQuery(`SELECT COUNT(*) FROM notifications WHERE user_id='${userId}'`));
}

function getUnreadCount(userId: string): number {
  return parseInt(dbQuery(`SELECT COUNT(*) FROM notifications WHERE user_id='${userId}' AND is_read=false`));
}

// ── BELL ICON + DROPDOWN TESTS ──

test.describe("Notification Bell — Member", () => {
  test.beforeEach(async () => {
    cleanNotifications();
    cleanAnnouncements();
    ensureRootMember();
    await resetRateLimiter();
  });

  test("bell icon visible with no badge when no unread notifications", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });
    const bell = page.locator('[data-testid="notification-bell"]');
    await expect(bell).toBeVisible();
    const badge = page.locator('[data-testid="notification-badge"]');
    await expect(badge).not.toBeVisible();
  });

  test("bell icon shows correct unread count badge", async ({ page }) => {
    const memberId = getRootMemberId();
    insertNotification({ userId: memberId, title: "Notif 1" });
    insertNotification({ userId: memberId, title: "Notif 2" });
    insertNotification({ userId: memberId, title: "Notif 3", isRead: true });

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });

    const badge = page.locator('[data-testid="notification-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("2");
  });

  test("dropdown shows latest 5 notifications", async ({ page }) => {
    const memberId = getRootMemberId();
    for (let i = 1; i <= 7; i++) {
      insertNotification({ userId: memberId, title: `Test Notification ${i}` });
    }

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });

    await page.click('[data-testid="notification-bell"]');
    const dropdown = page.locator('[data-testid="notification-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Should show exactly 5 items (limit=5)
    const items = dropdown.locator('[data-testid^="notification-item-"]');
    await expect(items).toHaveCount(5);
  });

  test("dropdown shows empty state when no notifications", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });

    await page.click('[data-testid="notification-bell"]');
    const empty = page.locator('[data-testid="dropdown-empty"]');
    await expect(empty).toBeVisible();
  });

  test("click notification → marks as read and navigates", async ({ page }) => {
    const memberId = getRootMemberId();
    insertNotification({
      userId: memberId,
      title: "Sale approved test",
      link: "/dashboard/sales",
    });

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });

    // Badge should show 1
    await expect(page.locator('[data-testid="notification-badge"]')).toHaveText("1");

    await page.click('[data-testid="notification-bell"]');
    await page.waitForSelector('[data-testid="notification-dropdown"]');

    // Click the notification
    const item = page.locator('[data-testid^="notification-item-"]').first();
    await item.click();

    // Should navigate to sales page
    await page.waitForURL("**/dashboard/sales**", { timeout: 10000 });

    // Badge should disappear (0 unread)
    await expect(page.locator('[data-testid="notification-badge"]')).not.toBeVisible();
  });

  test("'View all notifications' link navigates to notifications page", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });

    await page.click('[data-testid="notification-bell"]');
    await page.waitForSelector('[data-testid="notification-dropdown"]');
    await page.click('[data-testid="view-all-notifications"]');

    await page.waitForURL("**/dashboard/notifications**", { timeout: 10000 });
    await expect(page.locator('[data-testid="notifications-page"]')).toBeVisible();
  });
});

// ── BELL ICON — ADMIN ──

test.describe("Notification Bell — Admin", () => {
  test.beforeEach(async () => {
    cleanNotifications();
    await resetRateLimiter();
  });

  test("bell icon visible in admin header", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForSelector('[data-testid="admin-header"]', { timeout: 15000 });
    await expect(page.locator('[data-testid="notification-bell"]')).toBeVisible();
  });
});

// ── FULL NOTIFICATIONS PAGE ──

test.describe("Notifications Page", () => {
  test.beforeEach(async () => {
    cleanNotifications();
    ensureRootMember();
    await resetRateLimiter();
  });

  test("shows all notifications with read/unread state", async ({ page }) => {
    const memberId = getRootMemberId();
    insertNotification({ userId: memberId, title: "Read Notification", isRead: true });
    insertNotification({ userId: memberId, title: "Unread Notification", isRead: false });

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/notifications");
    await page.waitForSelector('[data-testid="notifications-page"]', { timeout: 15000 });

    const rows = page.locator('[data-testid^="notification-row-"]');
    await expect(rows).toHaveCount(2);

    // Unread notification has blue dot indicator
    const unreadDots = page.locator('[data-testid^="unread-indicator-"]');
    await expect(unreadDots).toHaveCount(1);
  });

  test("filter Unread shows only unread notifications", async ({ page }) => {
    const memberId = getRootMemberId();
    insertNotification({ userId: memberId, title: "Read One", isRead: true });
    insertNotification({ userId: memberId, title: "Unread One", isRead: false });
    insertNotification({ userId: memberId, title: "Unread Two", isRead: false });

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/notifications");
    await page.waitForSelector('[data-testid="notifications-page"]', { timeout: 15000 });

    // All tab shows 3
    await expect(page.locator('[data-testid^="notification-row-"]')).toHaveCount(3);

    // Click unread filter
    await page.click('[data-testid="filter-unread"]');
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid^="notification-row-"]')).toHaveCount(2);
  });

  test("mark single notification as read", async ({ page }) => {
    const memberId = getRootMemberId();
    insertNotification({ userId: memberId, title: "Mark Me Read" });

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/notifications");
    await page.waitForSelector('[data-testid="notifications-page"]', { timeout: 15000 });

    // Click the mark-read button
    const markBtn = page.locator('[data-testid^="mark-read-"]').first();
    await expect(markBtn).toBeVisible();
    await markBtn.click();

    // Wait for unread indicator to disappear
    await expect(page.locator('[data-testid^="unread-indicator-"]')).toHaveCount(0);

    // DB should confirm
    expect(getUnreadCount(memberId)).toBe(0);
  });

  test("mark all as read", async ({ page }) => {
    const memberId = getRootMemberId();
    insertNotification({ userId: memberId, title: "Unread A" });
    insertNotification({ userId: memberId, title: "Unread B" });
    insertNotification({ userId: memberId, title: "Unread C" });

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/notifications");
    await page.waitForSelector('[data-testid="notifications-page"]', { timeout: 15000 });

    await page.click('[data-testid="mark-all-read"]');

    // All unread indicators should disappear
    await expect(page.locator('[data-testid^="unread-indicator-"]')).toHaveCount(0);

    // Mark all button should also disappear
    await expect(page.locator('[data-testid="mark-all-read"]')).not.toBeVisible();

    // Verify in DB
    expect(getUnreadCount(memberId)).toBe(0);
  });

  test("empty state when no notifications", async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/notifications");
    await page.waitForSelector('[data-testid="notifications-page"]', { timeout: 15000 });

    await expect(page.locator('[data-testid="notifications-empty"]')).toBeVisible();
  });

  test("click notification navigates to link", async ({ page }) => {
    const memberId = getRootMemberId();
    insertNotification({
      userId: memberId,
      title: "Go to wallet",
      link: "/dashboard/wallet",
    });

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/notifications");
    await page.waitForSelector('[data-testid="notifications-page"]', { timeout: 15000 });

    await page.locator('[data-testid^="notification-row-"]').first().click();
    await page.waitForURL("**/dashboard/wallet**", { timeout: 10000 });
  });
});

// ── NOTIFICATION TRIGGERS ──

test.describe("Notification Triggers", () => {
  test.beforeEach(async () => {
    resetTestData();
    cleanAnnouncements();
    await resetRateLimiter();
    // Ensure at least one product exists
    const productCount = parseInt(dbQuery("SELECT COUNT(*) FROM products WHERE is_active=true"));
    if (productCount === 0) {
      dbQuery(
        `INSERT INTO products (id, name, name_hi, description, price, sku, category, is_active, created_at, updated_at)
         VALUES (gen_random_uuid(), 'Test Battery', 'टेस्ट बैटरी', 'Test product', 5000, 'TB-001', 'Batteries', true, NOW(), NOW())`
      );
    }
  });

  test("approve sale → member gets notification", async ({ page }) => {
    const memberId = getRootMemberId();

    // Insert a pending sale
    dbQuery(
      `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
       VALUES (gen_random_uuid(), '${memberId}', 'MB-NOTIF-01', 10000, 'Notif Customer', '+919876543210', '2026-03-25', 'PENDING', NOW(), NOW())`
    );
    const saleId = dbQuery("SELECT id FROM sales WHERE bill_code='MB-NOTIF-01'");
    const productId = dbQuery("SELECT id FROM products WHERE is_active=true ORDER BY name LIMIT 1");
    const price = dbQuery(`SELECT price FROM products WHERE id='${productId}'`);
    dbQuery(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
       VALUES (gen_random_uuid(), '${saleId}', '${productId}', 1, ${price}, ${price})`
    );

    // Admin approves
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    // Find and approve the sale
    await page.locator(`[data-testid="approve-sale-${saleId}"]`).click();

    // Wait for status change
    await page.waitForTimeout(1500);

    // Check member got notification
    const count = getNotificationCount(memberId);
    expect(count).toBeGreaterThanOrEqual(1);
    const title = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${memberId}' ORDER BY created_at DESC LIMIT 1`
    );
    expect(title).toContain("MB-NOTIF-01");
    expect(title).toContain("approved");
  });

  test("reject sale → member gets notification", async ({ page }) => {
    const memberId = getRootMemberId();

    dbQuery(
      `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
       VALUES (gen_random_uuid(), '${memberId}', 'MB-NOTIF-02', 8000, 'Reject Customer', '+919876543211', '2026-03-25', 'PENDING', NOW(), NOW())`
    );
    const saleId = dbQuery("SELECT id FROM sales WHERE bill_code='MB-NOTIF-02'");
    const productId = dbQuery("SELECT id FROM products WHERE is_active=true ORDER BY name LIMIT 1");
    const price = dbQuery(`SELECT price FROM products WHERE id='${productId}'`);
    dbQuery(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
       VALUES (gen_random_uuid(), '${saleId}', '${productId}', 1, ${price}, ${price})`
    );

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/sales");
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 15000 });

    await page.locator(`[data-testid="reject-sale-${saleId}"]`).click();

    // Fill rejection reason
    await page.waitForSelector('[data-testid="reject-modal"]', { timeout: 5000 });
    await page.fill('[data-testid="rejection-reason-input"]', 'Invalid bill code format');
    await page.click('[data-testid="confirm-reject"]');

    await page.waitForTimeout(1500);

    const title = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${memberId}' ORDER BY created_at DESC LIMIT 1`
    );
    expect(title).toContain("MB-NOTIF-02");
    expect(title).toContain("rejected");
  });

  test("new team member → parent gets notification", async ({ page }) => {
    const memberId = getRootMemberId();
    const beforeCount = getNotificationCount(memberId);

    // Register a new member via UI
    await registerMember(page, "ROOT01", {
      name: "Notification Test Member",
      email: "notiftest@test.com",
      phone: "9876500001",
      password: "member123456",
    });

    await page.waitForURL("**/login**", { timeout: 15000 });

    // Root member should now have a "new team member" notification
    const afterCount = getNotificationCount(memberId);
    expect(afterCount).toBe(beforeCount + 1);
    const title = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${memberId}' ORDER BY created_at DESC LIMIT 1`
    );
    expect(title).toContain("Notification Test Member");
  });

  test("payout → member gets notification", async ({ page }) => {
    const memberId = getRootMemberId();

    // Ensure wallet row exists and has pending balance
    const walletExists = parseInt(dbQuery(`SELECT COUNT(*) FROM wallets WHERE user_id='${memberId}'`));
    if (walletExists === 0) {
      dbQuery(
        `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, updated_at)
         VALUES (gen_random_uuid(), '${memberId}', 1000, 1000, 0, NOW())`
      );
    } else {
      dbQuery(`UPDATE wallets SET total_earned=1000, pending=1000, paid_out=0 WHERE user_id='${memberId}'`);
    }

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/wallets");
    await page.waitForSelector('[data-testid="wallets-table"]', { timeout: 15000 });

    // Find root member and click payout
    await page.locator(`[data-testid="payout-btn-${memberId}"]`).click();

    // Fill payout amount
    await page.waitForSelector('[data-testid="payout-modal"]', { timeout: 5000 });
    await page.fill('[data-testid="payout-amount-input"]', '500');
    await page.click('[data-testid="payout-confirm"]');

    // Wait for modal to close (indicates success)
    await page.waitForSelector('[data-testid="payout-modal"]', { state: "hidden", timeout: 10000 });

    const title = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${memberId}' ORDER BY created_at DESC LIMIT 1`
    );
    expect(title).toContain("Payout");
    expect(title).toContain("500");
  });
});

// ── POLLING TEST ──

test.describe("Notification Polling", () => {
  test.beforeEach(async () => {
    cleanNotifications();
    ensureRootMember();
    await resetRateLimiter();
  });

  test("badge updates within 35s when new notification is created", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });

    // No badge initially
    await expect(page.locator('[data-testid="notification-badge"]')).not.toBeVisible();

    // Insert a notification via DB
    const memberId = getRootMemberId();
    insertNotification({ userId: memberId, title: "Polling test notification" });

    // Wait for polling to pick it up (polling interval is 30s, wait up to 40s)
    await expect(page.locator('[data-testid="notification-badge"]')).toBeVisible({
      timeout: 40000,
    });
    await expect(page.locator('[data-testid="notification-badge"]')).toHaveText("1");
  });
});

// ── ADMIN ANNOUNCEMENTS CRUD ──

test.describe("Admin Announcements", () => {
  test.beforeEach(async () => {
    cleanAnnouncements();
    cleanNotifications();
    ensureRootMember();
    await resetRateLimiter();
  });

  test("page loads with empty state", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/announcements");
    await page.waitForSelector('[data-testid="admin-announcements-page"]', { timeout: 15000 });
    await expect(page.locator('[data-testid="announcements-empty"]')).toBeVisible();
  });

  test("create announcement — validates required fields", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/announcements");
    await page.waitForSelector('[data-testid="admin-announcements-page"]', { timeout: 15000 });

    await page.click('[data-testid="create-announcement-btn"]');
    await page.waitForSelector('[data-testid="announcement-form"]', { timeout: 5000 });

    // Submit empty form
    await page.click('[data-testid="submit-announcement"]');

    // Should show error
    await expect(page.locator('[data-testid="form-error"]')).toBeVisible();
  });

  test("create announcement → appears in list and notifies all members", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/announcements");
    await page.waitForSelector('[data-testid="admin-announcements-page"]', { timeout: 15000 });

    await page.click('[data-testid="create-announcement-btn"]');
    await page.waitForSelector('[data-testid="announcement-form"]', { timeout: 5000 });

    await page.fill('[data-testid="input-title-en"]', 'Monthly Target Update');
    await page.fill('[data-testid="input-title-hi"]', 'मासिक लक्ष्य अपडेट');
    await page.fill('[data-testid="input-content-en"]', 'All members should aim for 10 sales this month.');
    await page.fill('[data-testid="input-content-hi"]', 'सभी सदस्यों को इस महीने 10 बिक्री का लक्ष्य रखना चाहिए।');
    await page.click('[data-testid="submit-announcement"]');

    // Form should close and announcement appears in list
    await page.waitForSelector('[data-testid="announcement-form"]', { state: 'hidden', timeout: 5000 });

    const cards = page.locator('[data-testid^="announcement-"]').filter({ hasText: 'Monthly Target Update' });
    await expect(cards.first()).toBeVisible();

    // Verify all active members got notified
    const memberId = getRootMemberId();
    const notifCount = getNotificationCount(memberId);
    expect(notifCount).toBeGreaterThanOrEqual(1);
    const title = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${memberId}' ORDER BY created_at DESC LIMIT 1`
    );
    expect(title).toContain("Monthly Target Update");
  });

  test("pin announcement → shows pinned badge", async ({ page }) => {
    // Create announcement first
    dbQuery(
      `INSERT INTO announcements (id, title_en, title_hi, content_en, content_hi, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Pin Test', 'पिन टेस्ट', 'Test content for pinning', 'पिन करने के लिए टेस्ट', false, true, NOW(), NOW())`
    );

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/announcements");
    await page.waitForSelector('[data-testid="admin-announcements-page"]', { timeout: 15000 });

    const card = page.locator('[data-testid^="announcement-"]').filter({ hasText: 'Pin Test' }).first();
    await expect(card).toBeVisible();

    // Click pin
    await card.locator('[data-testid^="toggle-pin-"]').click();
    await page.waitForTimeout(500);

    // Reload and verify pinned badge
    await page.reload();
    await page.waitForSelector('[data-testid="admin-announcements-page"]', { timeout: 15000 });

    const pinnedBadge = page.locator('[data-testid^="pinned-badge-"]');
    await expect(pinnedBadge).toBeVisible();
  });

  test("unpin announcement → pinned badge removed", async ({ page }) => {
    dbQuery(
      `INSERT INTO announcements (id, title_en, content_en, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Unpin Test', 'Content', true, true, NOW(), NOW())`
    );

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/announcements");
    await page.waitForSelector('[data-testid="admin-announcements-page"]', { timeout: 15000 });

    const card = page.locator('[data-testid^="announcement-"]').filter({ hasText: 'Unpin Test' }).first();
    await card.locator('[data-testid^="toggle-pin-"]').click();
    await page.waitForTimeout(500);

    await page.reload();
    await page.waitForSelector('[data-testid="admin-announcements-page"]', { timeout: 15000 });

    await expect(page.locator('[data-testid^="pinned-badge-"]')).not.toBeVisible();
  });

  test("deactivate announcement → shows inactive badge", async ({ page }) => {
    dbQuery(
      `INSERT INTO announcements (id, title_en, content_en, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Deactivate Test', 'Content', false, true, NOW(), NOW())`
    );

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/announcements");
    await page.waitForSelector('[data-testid="admin-announcements-page"]', { timeout: 15000 });

    const card = page.locator('[data-testid^="announcement-"]').filter({ hasText: 'Deactivate Test' }).first();
    await card.locator('[data-testid^="toggle-active-"]').click();
    await page.waitForTimeout(500);

    await page.reload();
    await page.waitForSelector('[data-testid="admin-announcements-page"]', { timeout: 15000 });

    const inactiveBadge = page.locator('[data-testid^="inactive-badge-"]');
    await expect(inactiveBadge).toBeVisible();
  });

  test("edit announcement → changes saved", async ({ page }) => {
    dbQuery(
      `INSERT INTO announcements (id, title_en, content_en, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Edit Me', 'Original content', false, true, NOW(), NOW())`
    );

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await page.goto("/admin/announcements");
    await page.waitForSelector('[data-testid="admin-announcements-page"]', { timeout: 15000 });

    const card = page.locator('[data-testid^="announcement-"]').filter({ hasText: 'Edit Me' }).first();
    await card.locator('[data-testid^="edit-"]').click();

    await page.waitForSelector('[data-testid="announcement-form"]', { timeout: 5000 });
    await page.fill('[data-testid="input-title-en"]', 'Edited Title');
    await page.fill('[data-testid="input-content-en"]', 'Updated content');
    await page.click('[data-testid="submit-announcement"]');

    await page.waitForSelector('[data-testid="announcement-form"]', { state: 'hidden', timeout: 5000 });

    const updatedCard = page.locator('[data-testid^="announcement-"]').filter({ hasText: 'Edited Title' });
    await expect(updatedCard.first()).toBeVisible();
  });

  test("admin nav has announcements link", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForSelector('[data-testid="admin-sidebar"]', { timeout: 15000 });
    const navLink = page.locator('[data-testid="nav-megaphone"]');
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveText("Announcements");
  });
});

// ── MEMBER ANNOUNCEMENTS PAGE ──

test.describe("Member Announcements", () => {
  test.beforeEach(async () => {
    cleanAnnouncements();
    ensureRootMember();
    await resetRateLimiter();
  });

  test("member sees active announcements, pinned first", async ({ page }) => {
    dbQuery(
      `INSERT INTO announcements (id, title_en, content_en, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Regular Post', 'Regular content', false, true, NOW(), NOW())`
    );
    dbQuery(
      `INSERT INTO announcements (id, title_en, content_en, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Pinned Post', 'Pinned content', true, true, NOW(), NOW())`
    );
    dbQuery(
      `INSERT INTO announcements (id, title_en, content_en, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Inactive Post', 'Inactive content', false, false, NOW(), NOW())`
    );

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/announcements");
    await page.waitForSelector('[data-testid="member-announcements-page"]', { timeout: 15000 });

    // Should see 2 active announcements, not the inactive one
    const cards = page.locator('[data-testid^="announcement-card-"]');
    await expect(cards).toHaveCount(2);

    // First one should be pinned
    const pinLabels = page.locator('[data-testid^="pin-label-"]');
    await expect(pinLabels).toHaveCount(1);

    // Pinned should be first
    const firstCard = cards.first();
    await expect(firstCard.locator('[data-testid^="pin-label-"]')).toBeVisible();
  });

  test("deactivated announcement not visible to members", async ({ page }) => {
    dbQuery(
      `INSERT INTO announcements (id, title_en, content_en, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Hidden Post', 'Should not see', false, false, NOW(), NOW())`
    );

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/announcements");
    await page.waitForSelector('[data-testid="member-announcements-page"]', { timeout: 15000 });

    await expect(page.locator('[data-testid="announcements-empty"]')).toBeVisible();
  });

  test("member sees announcement in Hindi when language is hi", async ({ page }) => {
    dbQuery(
      `INSERT INTO announcements (id, title_en, title_hi, content_en, content_hi, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'English Title', 'हिंदी शीर्षक', 'English content', 'हिंदी सामग्री', false, true, NOW(), NOW())`
    );

    // Set member language to Hindi
    dbQuery(`UPDATE users SET "preferredLanguage"='hi' WHERE email='root@artilligence.com'`);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/announcements");
    await page.waitForSelector('[data-testid="member-announcements-page"]', { timeout: 15000 });

    await expect(page.locator('text=हिंदी शीर्षक')).toBeVisible();
    await expect(page.locator('text=हिंदी सामग्री')).toBeVisible();

    // Reset to English
    dbQuery(`UPDATE users SET "preferredLanguage"='en' WHERE email='root@artilligence.com'`);
  });
});

// ── DASHBOARD PINNED WIDGET ──

test.describe("Dashboard Pinned Announcements Widget", () => {
  test.beforeEach(async () => {
    cleanAnnouncements();
    cleanNotifications();
    ensureRootMember();
    await resetRateLimiter();
  });

  test("pinned announcements visible on dashboard home", async ({ page }) => {
    dbQuery(
      `INSERT INTO announcements (id, title_en, content_en, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Dashboard Pinned', 'Important update for dashboard', true, true, NOW(), NOW())`
    );

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });

    const widget = page.locator('[data-testid="pinned-announcements-widget"]');
    await expect(widget).toBeVisible();
    await expect(widget.locator('text=Dashboard Pinned')).toBeVisible();
  });

  test("no widget when no pinned announcements", async ({ page }) => {
    dbQuery(
      `INSERT INTO announcements (id, title_en, content_en, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Not Pinned', 'Regular', false, true, NOW(), NOW())`
    );

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });

    await expect(page.locator('[data-testid="pinned-announcements-widget"]')).not.toBeVisible();
  });

  test("view all announcements link works", async ({ page }) => {
    dbQuery(
      `INSERT INTO announcements (id, title_en, content_en, is_pinned, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Link Test', 'Content', true, true, NOW(), NOW())`
    );

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });

    await page.click('[data-testid="view-all-announcements-link"]');
    await page.waitForURL("**/dashboard/announcements**", { timeout: 10000 });
  });
});

// ── HINDI NOTIFICATIONS ──

test.describe("Hindi Notifications", () => {
  test.beforeEach(async () => {
    cleanNotifications();
    ensureRootMember();
    await resetRateLimiter();
  });

  test("notification titles shown in Hindi when language is hi", async ({ page }) => {
    const memberId = getRootMemberId();
    insertNotification({
      userId: memberId,
      title: "Sale approved",
      titleHi: "बिक्री स्वीकृत",
      body: "Your sale was approved",
      bodyHi: "आपकी बिक्री स्वीकृत हो गई",
    });

    dbQuery(`UPDATE users SET "preferredLanguage"='hi' WHERE email='root@artilligence.com'`);

    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/notifications");
    await page.waitForSelector('[data-testid="notifications-page"]', { timeout: 15000 });

    await expect(page.getByRole('heading', { name: 'बिक्री स्वीकृत' })).toBeVisible();
    await expect(page.locator('text=आपकी बिक्री स्वीकृत हो गई')).toBeVisible();

    // Reset
    dbQuery(`UPDATE users SET "preferredLanguage"='en' WHERE email='root@artilligence.com'`);
  });
});

// ── NOTIFICATION CLEANUP ──

test.describe("Notification Cleanup", () => {
  test.beforeEach(async () => {
    cleanNotifications();
    ensureRootMember();
    await resetRateLimiter();
  });

  test("notifications older than 90 days are auto-deleted", async ({ page }) => {
    const memberId = getRootMemberId();

    // Insert old notification (91 days ago)
    dbQuery(
      `INSERT INTO notifications (id, user_id, title, is_read, created_at)
       VALUES (gen_random_uuid(), '${memberId}', 'Old notification', false, NOW() - INTERVAL '91 days')`
    );
    // Insert recent notification
    insertNotification({ userId: memberId, title: "Recent notification" });

    const beforeCount = getNotificationCount(memberId);
    expect(beforeCount).toBe(2);

    // Trigger the cleanup by hitting the unread-count endpoint
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.waitForSelector('[data-testid="dashboard-home"]', { timeout: 15000 });

    // The unread-count endpoint runs cleanup opportunistically
    // Wait for the polling to trigger
    await page.waitForTimeout(2000);

    // After cleanup, old notification should be gone
    const afterCount = getNotificationCount(memberId);
    expect(afterCount).toBe(1);

    const remainingTitle = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${memberId}'`
    );
    expect(remainingTitle).toBe("Recent notification");
  });
});
