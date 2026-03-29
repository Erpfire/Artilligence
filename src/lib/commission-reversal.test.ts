import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { reverseCommissions } from "./commission-reversal";
import {
  buildMemberChain,
  createSale,
  createWallet,
  createCommission,
} from "@/test/factories";

describe("reverseCommissions", () => {
  it("creates negative commission records for each original commission", async () => {
    // Original sale had 1 commission: L1 = ₹1,000
    // Reversal should create: [{level:1, amount:-1000, type:REVERSAL}]
    const [root, seller] = buildMemberChain(2);
    const sale = createSale({ memberId: seller.id });
    const originalCommission = createCommission({
      saleId: sale.id,
      beneficiaryId: root.id,
      sourceMemberId: seller.id,
      level: 1,
      amount: new Decimal("1000.00"),
      type: "EARNING",
    });

    const result = await reverseCommissions(sale.id);

    expect(result.reversals).toHaveLength(1);
    expect(result.reversals[0]).toMatchObject({
      level: 1,
      amount: new Decimal("-1000.00"),
      type: "REVERSAL",
      beneficiaryId: root.id,
    });
  });

  it("deducts from wallet.pending for each beneficiary", async () => {
    // pending was ₹5,000, reversal ₹1,000 → pending now ₹4,000
    const [root, seller] = buildMemberChain(2);
    const sale = createSale({ memberId: seller.id });
    const wallet = createWallet({
      userId: root.id,
      pending: new Decimal("5000.00"),
      totalEarned: new Decimal("5000.00"),
    });
    createCommission({
      saleId: sale.id,
      beneficiaryId: root.id,
      sourceMemberId: seller.id,
      amount: new Decimal("1000.00"),
    });

    await reverseCommissions(sale.id);

    // Wallet pending should decrease by 1000
    expect(wallet.pending).toEqual(new Decimal("4000.00"));
  });

  it("deducts from wallet.total_earned for each beneficiary", async () => {
    // total_earned was ₹10,000, reversal ₹1,000 → total_earned now ₹9,000
    const [root, seller] = buildMemberChain(2);
    const sale = createSale({ memberId: seller.id });
    const wallet = createWallet({
      userId: root.id,
      totalEarned: new Decimal("10000.00"),
      pending: new Decimal("5000.00"),
      paidOut: new Decimal("5000.00"),
    });
    createCommission({
      saleId: sale.id,
      beneficiaryId: root.id,
      sourceMemberId: seller.id,
      amount: new Decimal("1000.00"),
    });

    await reverseCommissions(sale.id);

    expect(wallet.totalEarned).toEqual(new Decimal("9000.00"));
  });

  it("handles negative pending balance (already paid out)", async () => {
    // pending was ₹0 (all paid out), reversal ₹1,000 → pending now -₹1,000
    const [root, seller] = buildMemberChain(2);
    const sale = createSale({ memberId: seller.id });
    const wallet = createWallet({
      userId: root.id,
      totalEarned: new Decimal("5000.00"),
      pending: new Decimal("0.00"),
      paidOut: new Decimal("5000.00"),
    });
    createCommission({
      saleId: sale.id,
      beneficiaryId: root.id,
      sourceMemberId: seller.id,
      amount: new Decimal("1000.00"),
    });

    await reverseCommissions(sale.id);

    expect(wallet.pending).toEqual(new Decimal("-1000.00"));
  });

  it("maintains wallet invariant after reversal", async () => {
    // total_earned = pending + paid_out (even with negative pending)
    const [root, seller] = buildMemberChain(2);
    const sale = createSale({ memberId: seller.id });
    const wallet = createWallet({
      userId: root.id,
      totalEarned: new Decimal("5000.00"),
      pending: new Decimal("500.00"),
      paidOut: new Decimal("4500.00"),
    });
    createCommission({
      saleId: sale.id,
      beneficiaryId: root.id,
      sourceMemberId: seller.id,
      amount: new Decimal("1000.00"),
    });

    await reverseCommissions(sale.id);

    // total_earned = 5000 - 1000 = 4000
    // pending = 500 - 1000 = -500
    // paid_out unchanged = 4500
    // invariant: 4000 = -500 + 4500 ✓
    expect(wallet.totalEarned).toEqual(wallet.pending.add(wallet.paidOut));
  });

  it("creates COMMISSION_REVERSAL wallet transactions", async () => {
    // type=COMMISSION_REVERSAL, amount negative, description includes sale bill code
    const [root, seller] = buildMemberChain(2);
    const sale = createSale({ memberId: seller.id, billCode: "MB-99999" });
    createCommission({
      saleId: sale.id,
      beneficiaryId: root.id,
      sourceMemberId: seller.id,
      amount: new Decimal("1000.00"),
    });

    const result = await reverseCommissions(sale.id);

    expect(result.reversals[0].transaction).toBeDefined();
    expect(result.reversals[0].transaction.type).toBe("COMMISSION_REVERSAL");
    expect(result.reversals[0].transaction.amount).toEqual(new Decimal("-1000.00"));
    expect(result.reversals[0].transaction.description).toContain("MB-99999");
  });

  it("creates notifications for each affected member", async () => {
    // "Commission of ₹X reversed due to sale return"
    const members = buildMemberChain(4);
    const seller = members[3];
    const sale = createSale({ memberId: seller.id });
    // 3 original commissions for 3 upline members
    for (let i = 0; i < 3; i++) {
      createCommission({
        saleId: sale.id,
        beneficiaryId: members[2 - i].id,
        sourceMemberId: seller.id,
        level: i + 1,
        amount: new Decimal("1000.00"),
      });
    }

    const result = await reverseCommissions(sale.id);

    expect(result.reversals).toHaveLength(3);
    for (const reversal of result.reversals) {
      expect(reversal.notification).toBeDefined();
      expect(reversal.notification.title).toContain("reversed");
    }
  });

  it("does not reverse commissions for already-returned sale", async () => {
    // sale already RETURNED → error or no-op
    const [root, seller] = buildMemberChain(2);
    const sale = createSale({
      memberId: seller.id,
      status: "RETURNED",
      returnedAt: new Date("2026-01-20"),
    });

    await expect(reverseCommissions(sale.id)).rejects.toThrow(/already returned/i);
  });

  it("wraps everything in a database transaction (atomicity)", async () => {
    // if one wallet deduction fails → entire reversal rolled back
    const members = buildMemberChain(4);
    const seller = members[3];
    const sale = createSale({ memberId: seller.id });

    // When reversal fails midway, nothing should be persisted
    // The stub throws "Not implemented" — in GREEN phase we'll test
    // that partial failures don't leave stale state
    await expect(reverseCommissions(sale.id)).rejects.toThrow();
  });

  it("returns summary of all reversals made", async () => {
    // [{beneficiary, level, amount_reversed}]
    const members = buildMemberChain(4);
    const seller = members[3];
    const sale = createSale({ memberId: seller.id, totalAmount: new Decimal("10000.00") });
    const amounts = [1000, 600, 400];
    for (let i = 0; i < 3; i++) {
      createCommission({
        saleId: sale.id,
        beneficiaryId: members[2 - i].id,
        sourceMemberId: seller.id,
        level: i + 1,
        amount: new Decimal(amounts[i].toString()),
      });
    }

    const result = await reverseCommissions(sale.id);

    expect(result.reversals).toHaveLength(3);
    expect(result.reversals[0]).toHaveProperty("beneficiaryId");
    expect(result.reversals[0]).toHaveProperty("level");
    expect(result.reversals[0]).toHaveProperty("amount");
    // Total reversed should match total original
    const totalReversed = result.reversals.reduce(
      (sum: Decimal, r: { amount: Decimal }) => sum.add(r.amount),
      new Decimal("0")
    );
    expect(totalReversed).toEqual(new Decimal("-2000.00"));
  });
});
