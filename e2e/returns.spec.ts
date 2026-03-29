import { test, expect } from "@playwright/test";
import {
  resetTestData,
  login,
  dbQuery,
  resetRateLimiter,
  ensureRootMember,
} from "./helpers";

const ADMIN_EMAIL = "admin@artilligence.com";
const ADMIN_PASSWORD = "admin123456";
const MEMBER_PASSWORD = "member123456";

// bcrypt hash of 'member123456'
const MEMBER_PW_HASH =
  "\\$2b\\$12\\$F5IoN0XE1jXRqfkQZUOkTu7XF/C6Smg/clgs6z7ijVsDyyLi6VWM.";

function cleanSalesData() {
  dbQuery("DELETE FROM audit_logs");
  dbQuery("DELETE FROM wallet_transactions");
  dbQuery("DELETE FROM commissions");
  dbQuery("DELETE FROM notifications");
  dbQuery("DELETE FROM sale_flags");
  dbQuery("DELETE FROM sale_items");
  dbQuery("DELETE FROM sales");
}

function getRootMemberId(): string {
  return dbQuery("SELECT id FROM users WHERE email='root@artilligence.com'");
}

function getAdminId(): string {
  return dbQuery("SELECT id FROM users WHERE email='admin@artilligence.com'");
}

// Insert an APPROVED sale with commissions already calculated
function insertApprovedSaleWithCommissions(opts: {
  billCode: string;
  memberId: string;
  totalAmount?: number;
  customerName?: string;
}): string {
  const amount = opts.totalAmount || 10000;
  dbQuery(
    `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, approved_by, approved_at, created_at, updated_at)
     VALUES (gen_random_uuid(), '${opts.memberId}', '${opts.billCode}', ${amount}, '${opts.customerName || "Test Customer"}', '+919876543210', '2026-03-25', 'APPROVED', '${getAdminId()}', NOW(), NOW(), NOW())`
  );
  const saleId = dbQuery(`SELECT id FROM sales WHERE bill_code='${opts.billCode}'`);
  // Add a sale item
  const productId = dbQuery("SELECT id FROM products WHERE is_active=true ORDER BY name LIMIT 1");
  const price = dbQuery(`SELECT price FROM products WHERE id='${productId}'`);
  dbQuery(
    `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
     VALUES (gen_random_uuid(), '${saleId}', '${productId}', 1, ${price}, ${price})`
  );
  return saleId;
}

// Setup tree chain: root -> child1 -> seller, with wallets
// Returns IDs. Commissions on a 10000 sale by seller: child1 gets L1=10%=1000, root gets L2=6%=600
function setupTreeForReturns(): { sellerId: string; child1Id: string; rootId: string } {
  const rootId = getRootMemberId();

  const child1Exists = dbQuery("SELECT COUNT(*) FROM users WHERE email='ret-child1@test.com'");
  if (parseInt(child1Exists) === 0) {
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
       VALUES (gen_random_uuid(), 'ret-child1@test.com', '${MEMBER_PW_HASH}', 'Return Child One', '+919211000001', 'MEMBER', '${rootId}', '${rootId}', 0, 1, '/${rootId}/', 'RETCHILD1', 'ACTIVE', true, NOW(), NOW())`
    );
  }
  const child1Id = dbQuery("SELECT id FROM users WHERE email='ret-child1@test.com'");
  dbQuery(
    `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
     VALUES (gen_random_uuid(), '${child1Id}', 0, 0, 0, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`
  );

  const sellerExists = dbQuery("SELECT COUNT(*) FROM users WHERE email='ret-seller@test.com'");
  if (parseInt(sellerExists) === 0) {
    dbQuery(
      `INSERT INTO users (id, email, password_hash, name, phone, role, sponsor_id, parent_id, position, depth, path, referral_code, status, has_completed_onboarding, created_at, updated_at)
       VALUES (gen_random_uuid(), 'ret-seller@test.com', '${MEMBER_PW_HASH}', 'Return Seller', '+919211000002', 'MEMBER', '${child1Id}', '${child1Id}', 0, 2, '/${rootId}/${child1Id}/', 'RETSELLER', 'ACTIVE', true, NOW(), NOW())`
    );
  }
  const sellerId = dbQuery("SELECT id FROM users WHERE email='ret-seller@test.com'");
  dbQuery(
    `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
     VALUES (gen_random_uuid(), '${sellerId}', 0, 0, 0, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`
  );

  dbQuery(
    `INSERT INTO wallets (id, user_id, total_earned, pending, paid_out, created_at, updated_at)
     VALUES (gen_random_uuid(), '${rootId}', 0, 0, 0, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`
  );

  // Reset all wallet balances
  dbQuery("UPDATE wallets SET total_earned=0, pending=0, paid_out=0");

  return { sellerId, child1Id, rootId };
}

// Approve a sale via API to generate commissions properly
async function approveSaleViaAPI(saleId: string) {
  const res = await fetch(`http://localhost:3005/api/admin/sales/${saleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve" }),
  });
  // The API requires auth — let's do it directly in DB + commission engine
  // Instead, insert commissions manually based on the tree
}

// Insert an approved sale AND generate commissions in DB (simulating what the commission engine does)
function insertApprovedSaleWithDBCommissions(opts: {
  billCode: string;
  sellerId: string;
  child1Id: string;
  rootId: string;
  totalAmount?: number;
}): string {
  const amount = opts.totalAmount || 10000;
  const saleId = insertApprovedSaleWithCommissions({
    billCode: opts.billCode,
    memberId: opts.sellerId,
    totalAmount: amount,
  });

  // L1 commission: child1 gets 10% = 1000
  const l1Amount = (amount * 10) / 100;
  dbQuery(
    `INSERT INTO commissions (id, sale_id, beneficiary_id, source_member_id, level, percentage, amount, type, created_at)
     VALUES (gen_random_uuid(), '${saleId}', '${opts.child1Id}', '${opts.sellerId}', 1, 10.00, ${l1Amount}, 'EARNING', NOW())`
  );

  // L2 commission: root gets 6% = 600
  const l2Amount = (amount * 6) / 100;
  dbQuery(
    `INSERT INTO commissions (id, sale_id, beneficiary_id, source_member_id, level, percentage, amount, type, created_at)
     VALUES (gen_random_uuid(), '${saleId}', '${opts.rootId}', '${opts.sellerId}', 2, 6.00, ${l2Amount}, 'EARNING', NOW())`
  );

  // Credit wallets
  dbQuery(
    `UPDATE wallets SET pending = pending + ${l1Amount}, total_earned = total_earned + ${l1Amount} WHERE user_id='${opts.child1Id}'`
  );
  dbQuery(
    `UPDATE wallets SET pending = pending + ${l2Amount}, total_earned = total_earned + ${l2Amount} WHERE user_id='${opts.rootId}'`
  );

  // Create wallet transactions
  const c1Id = dbQuery(
    `SELECT id FROM commissions WHERE sale_id='${saleId}' AND beneficiary_id='${opts.child1Id}' AND type='EARNING'`
  );
  const w1Id = dbQuery(`SELECT id FROM wallets WHERE user_id='${opts.child1Id}'`);
  dbQuery(
    `INSERT INTO wallet_transactions (id, wallet_id, type, amount, description, reference_id, created_at)
     VALUES (gen_random_uuid(), '${w1Id}', 'COMMISSION', ${l1Amount}, 'Level 1 commission from sale ${opts.billCode}', '${c1Id}', NOW())`
  );

  const c2Id = dbQuery(
    `SELECT id FROM commissions WHERE sale_id='${saleId}' AND beneficiary_id='${opts.rootId}' AND type='EARNING'`
  );
  const w2Id = dbQuery(`SELECT id FROM wallets WHERE user_id='${opts.rootId}'`);
  dbQuery(
    `INSERT INTO wallet_transactions (id, wallet_id, type, amount, description, reference_id, created_at)
     VALUES (gen_random_uuid(), '${w2Id}', 'COMMISSION', ${l2Amount}, 'Level 2 commission from sale ${opts.billCode}', '${c2Id}', NOW())`
  );

  return saleId;
}

// Helper: navigate to admin sales approved tab and wait for data to be visible
async function goToApprovedSalesTab(page: any, billCode: string) {
  // Fresh navigation each retry (avoids DOM detach issues from page.reload)
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`/admin/sales?_t=${Date.now()}`);
    await page.waitForSelector('[data-testid="sales-tabs"]', { timeout: 15000 });
    await page.getByTestId("tab-approved").click();
    await page.waitForSelector(
      '[data-testid="sales-table"], [data-testid="sales-empty"]',
      { timeout: 10000 }
    );
    const hasText = await page.getByText(billCode).isVisible().catch(() => false);
    if (hasText) return;
    await page.waitForTimeout(1000);
  }
  await expect(page.getByText(billCode)).toBeVisible({ timeout: 5000 });
}

// ──────────────────────────────────────────────────────────────────

test.describe("Sale Returns + Commission Reversal", () => {
  test.beforeEach(async () => {
    cleanSalesData();
    resetTestData();
    await resetRateLimiter();
  });

  // ── 1. Admin marks approved sale as returned → confirmation dialog ──

  test("admin sees Return button for approved sale and opens confirmation dialog", async ({
    page,
  }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT001",
      sellerId,
      child1Id,
      rootId,
    });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT001");

    // Click Return button in the table
    await page.getByTestId(`return-sale-${saleId}`).click();

    // Confirmation modal appears
    await expect(page.getByTestId("return-modal")).toBeVisible();
    await expect(page.getByTestId("return-modal-title")).toContainText("Return Sale");

    // Preview shows affected members
    await page.waitForSelector('[data-testid="return-preview"]', { timeout: 10000 });
    await expect(page.getByTestId("preview-row-1")).toBeVisible();
    await expect(page.getByTestId("preview-row-2")).toBeVisible();

    // Confirm button is disabled without reason
    await expect(page.getByTestId("confirm-return")).toBeDisabled();
  });

  // ── 2. After return: sale status "Returned", reversal records created ──

  test("completing return changes sale status to RETURNED and creates reversal records", async ({
    page,
  }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT010",
      sellerId,
      child1Id,
      rootId,
    });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT010");

    // Open return modal
    await page.getByTestId(`return-sale-${saleId}`).click();
    await expect(page.getByTestId("return-modal")).toBeVisible();

    // Enter reason and confirm
    await page.getByTestId("return-reason-input").fill("Customer returned product defective");
    await page.getByTestId("confirm-return").click();

    // Modal closes
    await expect(page.getByTestId("return-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify sale status in DB
    const result = dbQuery(`SELECT status, return_reason FROM sales WHERE id='${saleId}'`);
    const [status, returnReason] = result.split("|");
    expect(status).toBe("RETURNED");
    expect(returnReason).toBe("Customer returned product defective");

    // Verify REVERSAL commission records created
    const reversalCount = dbQuery(
      `SELECT COUNT(*) FROM commissions WHERE sale_id='${saleId}' AND type='REVERSAL'`
    );
    expect(parseInt(reversalCount)).toBe(2); // L1 + L2

    // Verify reversal amounts are negative
    const reversalAmounts = dbQuery(
      `SELECT amount FROM commissions WHERE sale_id='${saleId}' AND type='REVERSAL' ORDER BY level`
    );
    const amounts = reversalAmounts.split("\n");
    expect(parseFloat(amounts[0])).toBe(-1000); // L1 reversed
    expect(parseFloat(amounts[1])).toBe(-600); // L2 reversed
  });

  // ── 3. Wallet.pending and wallet.total_earned decreased for each beneficiary ──

  test("wallet balances decreased after return for each beneficiary", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT020",
      sellerId,
      child1Id,
      rootId,
      totalAmount: 10000,
    });

    // Verify pre-return balances
    const child1PendingBefore = dbQuery(
      `SELECT pending FROM wallets WHERE user_id='${child1Id}'`
    );
    expect(parseFloat(child1PendingBefore)).toBe(1000);
    const rootPendingBefore = dbQuery(
      `SELECT pending FROM wallets WHERE user_id='${rootId}'`
    );
    expect(parseFloat(rootPendingBefore)).toBe(600);

    const saleId = dbQuery("SELECT id FROM sales WHERE bill_code='MB-RT020'");

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT020");

    await page.getByTestId(`return-sale-${saleId}`).click();
    await expect(page.getByTestId("return-modal")).toBeVisible();
    await page.getByTestId("return-reason-input").fill("Product return");
    await page.getByTestId("confirm-return").click();
    await expect(page.getByTestId("return-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify wallets after return
    const child1Pending = dbQuery(`SELECT pending FROM wallets WHERE user_id='${child1Id}'`);
    const child1Total = dbQuery(`SELECT total_earned FROM wallets WHERE user_id='${child1Id}'`);
    expect(parseFloat(child1Pending)).toBe(0);
    expect(parseFloat(child1Total)).toBe(0);

    const rootPending = dbQuery(`SELECT pending FROM wallets WHERE user_id='${rootId}'`);
    const rootTotal = dbQuery(`SELECT total_earned FROM wallets WHERE user_id='${rootId}'`);
    expect(parseFloat(rootPending)).toBe(0);
    expect(parseFloat(rootTotal)).toBe(0);
  });

  // ── 4. Wallet transactions show COMMISSION_REVERSAL entries ──

  test("COMMISSION_REVERSAL wallet transactions created after return", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT030",
      sellerId,
      child1Id,
      rootId,
    });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT030");

    await page.getByTestId(`return-sale-${saleId}`).click();
    await expect(page.getByTestId("return-modal")).toBeVisible();
    await page.getByTestId("return-reason-input").fill("Return reason");
    await page.getByTestId("confirm-return").click();
    await expect(page.getByTestId("return-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify COMMISSION_REVERSAL wallet transactions
    const child1WalletId = dbQuery(`SELECT id FROM wallets WHERE user_id='${child1Id}'`);
    const child1ReversalTx = dbQuery(
      `SELECT type, amount FROM wallet_transactions WHERE wallet_id='${child1WalletId}' AND type='COMMISSION_REVERSAL'`
    );
    expect(child1ReversalTx).toContain("COMMISSION_REVERSAL");
    expect(child1ReversalTx).toContain("-1000");

    const rootWalletId = dbQuery(`SELECT id FROM wallets WHERE user_id='${rootId}'`);
    const rootReversalTx = dbQuery(
      `SELECT type, amount FROM wallet_transactions WHERE wallet_id='${rootWalletId}' AND type='COMMISSION_REVERSAL'`
    );
    expect(rootReversalTx).toContain("COMMISSION_REVERSAL");
    expect(rootReversalTx).toContain("-600");
  });

  // ── 5. Notifications sent to affected members ──

  test("notifications sent to affected members after return", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT040",
      sellerId,
      child1Id,
      rootId,
    });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT040");

    await page.getByTestId(`return-sale-${saleId}`).click();
    await expect(page.getByTestId("return-modal")).toBeVisible();
    await page.getByTestId("return-reason-input").fill("Product defect");
    await page.getByTestId("confirm-return").click();
    await expect(page.getByTestId("return-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify notifications for child1
    const child1Notifs = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${child1Id}' AND title LIKE '%reversed%'`
    );
    expect(child1Notifs).toContain("reversed");

    // Verify notifications for root
    const rootNotifs = dbQuery(
      `SELECT title FROM notifications WHERE user_id='${rootId}' AND title LIKE '%reversed%'`
    );
    expect(rootNotifs).toContain("reversed");
  });

  // ── 6. Negative pending: member had ₹0 pending → pending goes to -₹X ──

  test("negative pending: member had ₹0 pending → pending goes negative after return", async ({
    page,
  }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT050",
      sellerId,
      child1Id,
      rootId,
      totalAmount: 10000,
    });

    // Simulate that child1 had all their pending paid out
    dbQuery(
      `UPDATE wallets SET pending=0, paid_out=1000 WHERE user_id='${child1Id}'`
    );

    const saleId = dbQuery("SELECT id FROM sales WHERE bill_code='MB-RT050'");

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT050");

    await page.getByTestId(`return-sale-${saleId}`).click();
    await expect(page.getByTestId("return-modal")).toBeVisible();
    await page.getByTestId("return-reason-input").fill("Returned item");
    await page.getByTestId("confirm-return").click();
    await expect(page.getByTestId("return-modal")).not.toBeVisible({ timeout: 10000 });

    // child1: pending was 0, reversal of 1000 → pending = -1000
    const child1Pending = dbQuery(`SELECT pending FROM wallets WHERE user_id='${child1Id}'`);
    expect(parseFloat(child1Pending)).toBe(-1000);

    // Wallet invariant: total_earned = pending + paid_out
    const child1Total = dbQuery(`SELECT total_earned FROM wallets WHERE user_id='${child1Id}'`);
    const child1PaidOut = dbQuery(`SELECT paid_out FROM wallets WHERE user_id='${child1Id}'`);
    expect(parseFloat(child1Total)).toBeCloseTo(
      parseFloat(child1Pending) + parseFloat(child1PaidOut),
      2
    );
  });

  // ─�� 7. Member sees returned sale in Returned tab ──

  test("member sees returned sale in Returned tab with return reason", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT060",
      sellerId,
      child1Id,
      rootId,
    });

    // Return the sale via DB (simulating admin action)
    dbQuery(`UPDATE sales SET status='RETURNED', return_reason='Defective product' WHERE id='${saleId}'`);

    // Login as seller and check Returned tab
    await login(page, "ret-seller@test.com", MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await page.goto("/dashboard/sales");
    await page.waitForSelector('[data-testid="sales-page"]', { timeout: 15000 });

    // Click Returned tab
    await page.getByTestId("tab-RETURNED").click();
    await page.waitForTimeout(1000);

    // Should see the returned sale
    await expect(page.getByText("MB-RT060")).toBeVisible();
    await expect(page.getByTestId("sale-return-reason")).toBeVisible();
    await expect(page.getByTestId("sale-return-reason")).toContainText("Defective product");
  });

  // ── 8. Member sees reversal in wallet history ──

  test("member sees COMMISSION_REVERSAL in wallet transaction history", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT070",
      sellerId,
      child1Id,
      rootId,
    });

    // Perform return via admin UI
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT070");
    await page.getByTestId(`return-sale-${saleId}`).click();
    await expect(page.getByTestId("return-modal")).toBeVisible();
    await page.getByTestId("return-reason-input").fill("Returned by customer");
    await page.getByTestId("confirm-return").click();
    await expect(page.getByTestId("return-modal")).not.toBeVisible({ timeout: 10000 });

    // Clear cookies and login as root member (L2 beneficiary)
    await page.context().clearCookies();
    await login(page, "root@artilligence.com", MEMBER_PASSWORD);
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await page.goto("/dashboard/wallet");
    await page.waitForSelector('[data-testid="wallet-page"]', { timeout: 15000 });

    // Should see transactions including COMMISSION_REVERSAL
    await expect(page.getByTestId("transactions-list")).toBeVisible();

    // Check that there's a COMMISSION_REVERSAL entry
    const reversalBadges = page.locator('[data-testid^="transaction-type-"]', {
      hasText: "Commission Reversal",
    });
    await expect(reversalBadges.first()).toBeVisible();

    // Check wallet amounts reflect reversal (pending = 0 since earned 600 then reversed 600)
    await expect(page.getByTestId("wallet-pending-amount")).toContainText("0");
  });

  // ── 9. Audit log entries for return + reversal ──

  test("audit log entries created for SALE_RETURNED and COMMISSIONS_REVERSED", async ({
    page,
  }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT080",
      sellerId,
      child1Id,
      rootId,
    });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT080");

    await page.getByTestId(`return-sale-${saleId}`).click();
    await expect(page.getByTestId("return-modal")).toBeVisible();
    await page.getByTestId("return-reason-input").fill("Customer return");
    await page.getByTestId("confirm-return").click();
    await expect(page.getByTestId("return-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify audit log entries in DB
    const saleReturnedLog = dbQuery(
      `SELECT action FROM audit_logs WHERE entity_id='${saleId}' AND action='SALE_RETURNED'`
    );
    expect(saleReturnedLog).toBe("SALE_RETURNED");

    const commissionsReversedLog = dbQuery(
      `SELECT action FROM audit_logs WHERE entity_id='${saleId}' AND action='COMMISSIONS_REVERSED'`
    );
    expect(commissionsReversedLog).toBe("COMMISSIONS_REVERSED");
  });

  // ── 10. Returned sale cannot be returned or approved again ──

  test("returned sale cannot be returned again — no Return button shown", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT090",
      sellerId,
      child1Id,
      rootId,
    });

    // Mark as returned
    dbQuery(
      `UPDATE sales SET status='RETURNED', return_reason='Already returned', returned_at=NOW() WHERE id='${saleId}'`
    );

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 15000 });

    // Go to Returned tab with retry (fresh navigation each attempt)
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(`/admin/sales?_t=${Date.now()}`);
      await page.waitForSelector('[data-testid="sales-tabs"]', { timeout: 15000 });
      await page.getByTestId("tab-returned").click();
      await page.waitForSelector('[data-testid="sales-table"], [data-testid="sales-empty"]', { timeout: 10000 });
      const hasText = await page.getByText("MB-RT090").isVisible().catch(() => false);
      if (hasText) break;
      await page.waitForTimeout(1000);
    }
    await expect(page.getByText("MB-RT090")).toBeVisible({ timeout: 5000 });

    // No Return button should be visible for returned sale
    await expect(page.getByTestId(`return-sale-${saleId}`)).not.toBeVisible();

    // View the detail
    await page.getByTestId(`view-sale-${saleId}`).click();
    await expect(page.getByTestId("sale-detail-modal")).toBeVisible();

    // Status should show RETURNED
    await expect(page.getByTestId("detail-status")).toContainText("RETURNED");

    // No Return button in detail
    await expect(page.getByTestId("detail-return-button")).not.toBeVisible();

    // Return reason should be visible
    await expect(page.getByTestId("detail-return-reason")).toContainText("Already returned");
  });

  // ── 11. Returned sale API rejects duplicate return ──

  test("API rejects return on already-returned sale", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT095",
      sellerId,
      child1Id,
      rootId,
    });

    // Return once via DB
    dbQuery(
      `UPDATE sales SET status='RETURNED', return_reason='First return', returned_at=NOW() WHERE id='${saleId}'`
    );

    // Try to return via API — should fail
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });

    const response = await page.request.patch(`/api/admin/sales/${saleId}`, {
      data: { action: "return", reason: "Second return attempt" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("already returned");
  });

  // ── 12. Return from detail modal (not table row) ──

  test("admin returns sale from detail modal view", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT100",
      sellerId,
      child1Id,
      rootId,
    });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT100");

    // Open sale detail
    await page.getByTestId(`view-sale-${saleId}`).click();
    await expect(page.getByTestId("sale-detail-modal")).toBeVisible();

    // Click Return Sale button in detail modal
    await page.getByTestId("detail-return-button").click();

    // Return modal should appear
    await expect(page.getByTestId("return-modal")).toBeVisible();

    // Fill reason and confirm
    await page.getByTestId("return-reason-input").fill("Detail view return");
    await page.getByTestId("confirm-return").click();
    await expect(page.getByTestId("return-modal")).not.toBeVisible({ timeout: 10000 });

    // Verify in DB
    const status = dbQuery(`SELECT status FROM sales WHERE id='${saleId}'`);
    expect(status).toBe("RETURNED");
  });

  // ── 13. Sale shows in Returned tab after return ──

  test("returned sale appears in Returned tab in admin", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT110",
      sellerId,
      child1Id,
      rootId,
    });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT110");

    // Return it
    await page.getByTestId(`return-sale-${saleId}`).click();
    await expect(page.getByTestId("return-modal")).toBeVisible();
    await page.getByTestId("return-reason-input").fill("Test return");
    await page.getByTestId("confirm-return").click();
    await expect(page.getByTestId("return-modal")).not.toBeVisible({ timeout: 10000 });

    // Sale should now be gone from Approved tab
    await page.waitForTimeout(1000);

    // Switch to Returned tab
    await page.getByTestId("tab-returned").click();
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 10000 });
    await expect(page.getByText("MB-RT110")).toBeVisible();

    // Status badge should show RETURNED
    const statusBadge = page.getByTestId(`sale-status-${saleId}`);
    await expect(statusBadge).toContainText("RETURNED");
  });

  // ── 14. Cancel return modal ──

  test("cancel return modal does not change sale status", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT120",
      sellerId,
      child1Id,
      rootId,
    });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT120");

    // Open return modal
    await page.getByTestId(`return-sale-${saleId}`).click();
    await expect(page.getByTestId("return-modal")).toBeVisible();

    // Cancel
    await page.getByTestId("cancel-return").click();
    await expect(page.getByTestId("return-modal")).not.toBeVisible();

    // Sale still APPROVED in DB
    const status = dbQuery(`SELECT status FROM sales WHERE id='${saleId}'`);
    expect(status).toBe("APPROVED");
  });

  // ── 15. Detail modal shows reversal commissions after return ──

  test("detail modal shows both EARNING and REVERSAL commissions after return", async ({
    page,
  }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT130",
      sellerId,
      child1Id,
      rootId,
    });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });
    await goToApprovedSalesTab(page, "MB-RT130");

    // Return it
    await page.getByTestId(`return-sale-${saleId}`).click();
    await expect(page.getByTestId("return-modal")).toBeVisible();
    await page.getByTestId("return-reason-input").fill("Product return");
    await page.getByTestId("confirm-return").click();
    await expect(page.getByTestId("return-modal")).not.toBeVisible({ timeout: 10000 });

    // Navigate to Returned tab and view detail
    await page.getByTestId("tab-returned").click();
    await page.waitForSelector('[data-testid="sales-table"]', { timeout: 10000 });
    await page.getByTestId(`view-sale-${saleId}`).click();
    await expect(page.getByTestId("sale-detail-modal")).toBeVisible();

    // Should see commissions table with both EARNING and REVERSAL types
    await expect(page.getByTestId("detail-commissions")).toBeVisible();
    const earningBadges = page.locator('[data-testid^="commission-type-"]', {
      hasText: "EARNING",
    });
    const reversalBadges = page.locator('[data-testid^="commission-type-"]', {
      hasText: "REVERSAL",
    });
    await expect(earningBadges.first()).toBeVisible();
    await expect(reversalBadges.first()).toBeVisible();
  });

  // ── 16. Pending sale cannot be returned ──

  test("pending sale cannot be returned via API", async ({ page }) => {
    const memberId = getRootMemberId();
    dbQuery(
      `INSERT INTO sales (id, member_id, bill_code, total_amount, customer_name, customer_phone, sale_date, status, created_at, updated_at)
       VALUES (gen_random_uuid(), '${memberId}', 'MB-RT140', 5000, 'Test Customer', '+919876543210', '2026-03-25', 'PENDING', NOW(), NOW())`
    );
    const saleId = dbQuery("SELECT id FROM sales WHERE bill_code='MB-RT140'");

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });

    const response = await page.request.patch(`/api/admin/sales/${saleId}`, {
      data: { action: "return", reason: "Testing" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Only approved sales can be returned");
  });

  // ── 17. Return requires reason ──

  test("return without reason is rejected by API", async ({ page }) => {
    const { sellerId, child1Id, rootId } = setupTreeForReturns();
    const saleId = insertApprovedSaleWithDBCommissions({
      billCode: "MB-RT150",
      sellerId,
      child1Id,
      rootId,
    });

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL("**/admin**", { timeout: 10000 });

    const response = await page.request.patch(`/api/admin/sales/${saleId}`, {
      data: { action: "return", reason: "" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Return reason is required");
  });
});
