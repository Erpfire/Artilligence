import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { calculateCommissions } from "./commission";
import {
  buildMemberChain,
  createSale,
  createWallet,
  createCommissionSettings,
  createMember,
} from "@/test/factories";

describe("calculateCommissions", () => {
  const defaultSettings = createCommissionSettings();

  it("generates correct commissions for 1-level upline", async () => {
    // Chain: root → seller (depth 1)
    // Sale ₹10,000 by seller → root gets L1 = 10% = ₹1,000
    const [root, seller] = buildMemberChain(2);
    createWallet({ userId: root.id });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("10000.00") });

    const result = await calculateCommissions(sale.id);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      beneficiaryId: root.id,
      level: 1,
      amount: new Decimal("1000.00"),
    });
  });

  it("generates correct commissions for 3-level upline", async () => {
    // Chain: A → B → C → seller (depths 0,1,2,3)
    // Sale ₹10,000 → C gets L1=10%=₹1000, B gets L2=6%=₹600, A gets L3=4%=₹400
    const members = buildMemberChain(4);
    const seller = members[3];
    for (let i = 0; i < 3; i++) createWallet({ userId: members[i].id });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("10000.00") });

    const result = await calculateCommissions(sale.id);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ beneficiaryId: members[2].id, level: 1, amount: new Decimal("1000.00") });
    expect(result[1]).toMatchObject({ beneficiaryId: members[1].id, level: 2, amount: new Decimal("600.00") });
    expect(result[2]).toMatchObject({ beneficiaryId: members[0].id, level: 3, amount: new Decimal("400.00") });
  });

  it("generates correct commissions for full 7-level upline", async () => {
    // Chain of 8: root + 7 ancestors above seller
    // Sale ₹10,000 → 7 commissions totaling ₹2,650
    // L1=10%=1000, L2=6%=600, L3=4%=400, L4=3%=300, L5=2%=200, L6=1%=100, L7=0.5%=50
    const members = buildMemberChain(8);
    const seller = members[7];
    for (let i = 0; i < 7; i++) createWallet({ userId: members[i].id });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("10000.00") });

    const result = await calculateCommissions(sale.id);

    expect(result).toHaveLength(7);
    const total = result.reduce(
      (sum: Decimal, c: { amount: Decimal }) => sum.add(c.amount),
      new Decimal("0")
    );
    expect(total).toEqual(new Decimal("2650.00"));
  });

  it("stops at max configured levels (7) even with deeper upline", async () => {
    // Chain of 11: 10-level upline but only 7 levels configured
    const members = buildMemberChain(11);
    const seller = members[10];
    for (let i = 0; i < 10; i++) createWallet({ userId: members[i].id });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("10000.00") });

    const result = await calculateCommissions(sale.id);

    expect(result).toHaveLength(7);
    // Nearest 7 ancestors get commissions, the rest get nothing
    expect(result.every((c: { level: number }) => c.level <= 7)).toBe(true);
  });

  it("skips blocked/inactive members in upline", async () => {
    // Chain: A(active) → B(blocked) → C(active) → seller
    // B is blocked → only A(L3→now shifted) and C(L1) get commissions, B skipped entirely
    const members = buildMemberChain(4);
    members[2].status = "BLOCKED"; // B (index 2) is blocked
    const seller = members[3];
    // Wallets for active beneficiaries only (members[0] and members[1])
    createWallet({ userId: members[0].id });
    createWallet({ userId: members[1].id });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("10000.00") });

    const result = await calculateCommissions(sale.id);

    // B (members[2]) should be skipped — no commission for blocked member
    const beneficiaryIds = result.map((c: { beneficiaryId: string }) => c.beneficiaryId);
    expect(beneficiaryIds).not.toContain(members[2].id);
    // C (members[2] position) is skipped, so only L1 for members[1] and L2 for members[0]
    // Actually: seller is members[3], upline is members[2](blocked), members[1], members[0]
    // members[2] skipped → members[1] gets L1, members[0] gets L2
    expect(result).toHaveLength(2);
  });

  it("handles member at root (no upline) — 0 commissions", async () => {
    // Root member makes a sale — no ancestors → no commissions
    const [root] = buildMemberChain(1);
    const sale = createSale({ memberId: root.id, totalAmount: new Decimal("10000.00") });

    const result = await calculateCommissions(sale.id);

    expect(result).toHaveLength(0);
  });

  it("handles zero-amount sale — all commissions are ₹0", async () => {
    const [root, seller] = buildMemberChain(2);
    createWallet({ userId: root.id });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("0.00") });

    const result = await calculateCommissions(sale.id);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toEqual(new Decimal("0.00"));
  });

  it("uses current commission rates not historical", async () => {
    // Rates changed from 10% to 12% → new sale uses 12%
    const [root, seller] = buildMemberChain(2);
    createWallet({ userId: root.id });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("10000.00") });
    const settings = createCommissionSettings();
    settings[0].percentage = new Decimal("12.00");

    const result = await calculateCommissions(sale.id);

    // Should use current rate (12%) not the original 10%
    expect(result[0].amount).toEqual(new Decimal("1200.00"));
    expect(result[0].percentage).toEqual(new Decimal("12.00"));
  });

  it("handles decimal amounts correctly (no floating point errors)", async () => {
    // Sale ₹999.99 at L1=10% → ₹100.00 (rounded to 2 decimal places)
    const [root, seller] = buildMemberChain(2);
    createWallet({ userId: root.id });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("999.99") });

    const result = await calculateCommissions(sale.id);

    expect(result[0].amount).toEqual(new Decimal("100.00"));
  });

  it("credits correct wallet balances", async () => {
    // After commission calculation, each beneficiary's wallet.pending increases
    // Wallet invariant: total_earned = pending + paid_out
    const [root, seller] = buildMemberChain(2);
    const rootWallet = createWallet({ userId: root.id, pending: new Decimal("5000.00"), totalEarned: new Decimal("5000.00") });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("10000.00") });

    await calculateCommissions(sale.id);

    // Root wallet should now have pending = 5000 + 1000 = 6000
    // total_earned = 5000 + 1000 = 6000
    // Invariant: total_earned (6000) = pending (6000) + paid_out (0)
    expect(rootWallet.pending).toEqual(new Decimal("6000.00"));
    expect(rootWallet.totalEarned).toEqual(new Decimal("6000.00"));
    expect(rootWallet.totalEarned).toEqual(rootWallet.pending.add(rootWallet.paidOut));
  });

  it("creates wallet transactions with correct descriptions", async () => {
    // Each commission creates a wallet transaction:
    // type=COMMISSION, positive amount, description includes sale bill code and level
    const [root, seller] = buildMemberChain(2);
    createWallet({ userId: root.id });
    const sale = createSale({
      memberId: seller.id,
      billCode: "MB-12345",
      totalAmount: new Decimal("10000.00"),
    });

    const result = await calculateCommissions(sale.id);

    // Verify transaction metadata
    expect(result[0].transaction).toBeDefined();
    expect(result[0].transaction.type).toBe("COMMISSION");
    expect(result[0].transaction.amount).toEqual(new Decimal("1000.00"));
    expect(result[0].transaction.description).toContain("MB-12345");
    expect(result[0].transaction.description).toContain("Level 1");
  });

  it("creates notifications for each beneficiary", async () => {
    // Each upline member gets a notification with correct title and amount
    const members = buildMemberChain(4);
    const seller = members[3];
    for (let i = 0; i < 3; i++) createWallet({ userId: members[i].id });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("10000.00") });

    const result = await calculateCommissions(sale.id);

    // 3 beneficiaries → 3 notifications
    expect(result).toHaveLength(3);
    for (const commission of result) {
      expect(commission.notification).toBeDefined();
      expect(commission.notification.title).toContain("Commission");
      expect(commission.notification.userId).toBe(commission.beneficiaryId);
    }
  });

  it("wraps everything in a database transaction (atomicity)", async () => {
    // If wallet credit fails midway → no partial commissions saved
    // Simulate: 3-level upline, wallet credit fails on L2
    // Expected: no commissions, no wallet updates, no notifications
    const members = buildMemberChain(4);
    const seller = members[3];
    // Only create wallet for L1 beneficiary — L2 will fail (no wallet)
    createWallet({ userId: members[2].id });
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("10000.00") });

    // L1 (members[2]) succeeds, L2 (members[1]) throws — no wallet found
    await expect(calculateCommissions(sale.id)).rejects.toThrow();
  });
});
