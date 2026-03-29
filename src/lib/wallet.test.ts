import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  creditWallet,
  debitWallet,
  adjustWallet,
  getWalletSummary,
} from "./wallet";
import {
  createMember,
  createWallet,
  createWalletTransaction,
} from "@/test/factories";

describe("creditWallet", () => {
  it("increases pending by amount", async () => {
    const member = createMember();
    const wallet = createWallet({
      userId: member.id,
      pending: new Decimal("5000.00"),
      totalEarned: new Decimal("5000.00"),
    });

    const result = await creditWallet(member.id, new Decimal("1000.00"), {
      type: "COMMISSION" as const,
      description: "L1 commission from sale MB-001",
      referenceId: "commission-id-1",
    });

    expect(result.wallet.pending).toEqual(new Decimal("6000.00"));
  });

  it("increases total_earned by amount", async () => {
    const member = createMember();
    const wallet = createWallet({
      userId: member.id,
      pending: new Decimal("3000.00"),
      totalEarned: new Decimal("8000.00"),
      paidOut: new Decimal("5000.00"),
    });

    const result = await creditWallet(member.id, new Decimal("2000.00"), {
      type: "COMMISSION" as const,
      description: "L1 commission",
      referenceId: "commission-id-2",
    });

    expect(result.wallet.totalEarned).toEqual(new Decimal("10000.00"));
  });

  it("leaves paid_out unchanged", async () => {
    const member = createMember();
    const wallet = createWallet({
      userId: member.id,
      pending: new Decimal("2000.00"),
      totalEarned: new Decimal("7000.00"),
      paidOut: new Decimal("5000.00"),
    });

    const result = await creditWallet(member.id, new Decimal("1000.00"), {
      type: "COMMISSION" as const,
      description: "L1 commission",
      referenceId: "commission-id-3",
    });

    expect(result.wallet.paidOut).toEqual(new Decimal("5000.00"));
  });

  it("creates wallet transaction record", async () => {
    const member = createMember();
    createWallet({ userId: member.id });

    const result = await creditWallet(member.id, new Decimal("1000.00"), {
      type: "COMMISSION" as const,
      description: "L1 commission from sale MB-002",
      referenceId: "commission-id-4",
    });

    expect(result.transaction).toBeDefined();
    expect(result.transaction.type).toBe("COMMISSION");
    expect(result.transaction.amount).toEqual(new Decimal("1000.00"));
    expect(result.transaction.description).toContain("MB-002");
  });

  it("wallet invariant holds after credit", async () => {
    // total_earned = pending + paid_out
    const member = createMember();
    createWallet({
      userId: member.id,
      pending: new Decimal("3000.00"),
      totalEarned: new Decimal("8000.00"),
      paidOut: new Decimal("5000.00"),
    });

    const result = await creditWallet(member.id, new Decimal("2500.00"), {
      type: "COMMISSION" as const,
      description: "L2 commission",
      referenceId: "commission-id-5",
    });

    expect(result.wallet.totalEarned).toEqual(
      result.wallet.pending.add(result.wallet.paidOut)
    );
  });

  it("handles credit of ₹0 (no-op or allowed with record)", async () => {
    const member = createMember();
    createWallet({
      userId: member.id,
      pending: new Decimal("1000.00"),
      totalEarned: new Decimal("1000.00"),
    });

    const result = await creditWallet(member.id, new Decimal("0.00"), {
      type: "COMMISSION" as const,
      description: "Zero amount commission",
      referenceId: "commission-id-6",
    });

    expect(result.wallet.pending).toEqual(new Decimal("1000.00"));
    expect(result.wallet.totalEarned).toEqual(new Decimal("1000.00"));
  });

  it("handles very large amounts (₹10,00,000+) without overflow", async () => {
    const member = createMember();
    createWallet({ userId: member.id });

    const result = await creditWallet(
      member.id,
      new Decimal("1000000.00"),
      {
        type: "COMMISSION" as const,
        description: "Large commission",
        referenceId: "commission-id-7",
      }
    );

    expect(result.wallet.pending).toEqual(new Decimal("1000000.00"));
    expect(result.wallet.totalEarned).toEqual(new Decimal("1000000.00"));
  });
});

describe("debitWallet", () => {
  it("decreases pending by amount", async () => {
    const member = createMember();
    createWallet({
      userId: member.id,
      pending: new Decimal("5000.00"),
      totalEarned: new Decimal("5000.00"),
    });

    const result = await debitWallet(
      member.id,
      new Decimal("2000.00"),
      "PAYOUT" as const,
      "Monthly payout"
    );

    expect(result.wallet.pending).toEqual(new Decimal("3000.00"));
  });

  it("increases paid_out by amount", async () => {
    const member = createMember();
    createWallet({
      userId: member.id,
      pending: new Decimal("5000.00"),
      totalEarned: new Decimal("5000.00"),
      paidOut: new Decimal("0.00"),
    });

    const result = await debitWallet(
      member.id,
      new Decimal("2000.00"),
      "PAYOUT" as const,
      "Monthly payout"
    );

    expect(result.wallet.paidOut).toEqual(new Decimal("2000.00"));
  });

  it("leaves total_earned unchanged", async () => {
    const member = createMember();
    createWallet({
      userId: member.id,
      pending: new Decimal("5000.00"),
      totalEarned: new Decimal("10000.00"),
      paidOut: new Decimal("5000.00"),
    });

    const result = await debitWallet(
      member.id,
      new Decimal("2000.00"),
      "PAYOUT" as const,
      "Monthly payout"
    );

    expect(result.wallet.totalEarned).toEqual(new Decimal("10000.00"));
  });

  it("rejects if amount > pending balance", async () => {
    const member = createMember();
    createWallet({
      userId: member.id,
      pending: new Decimal("1000.00"),
      totalEarned: new Decimal("5000.00"),
      paidOut: new Decimal("4000.00"),
    });

    await expect(
      debitWallet(member.id, new Decimal("2000.00"), "PAYOUT" as const, "Too much")
    ).rejects.toThrow(/insufficient/i);
  });

  it("rejects if amount <= 0", async () => {
    const member = createMember();
    createWallet({
      userId: member.id,
      pending: new Decimal("5000.00"),
      totalEarned: new Decimal("5000.00"),
    });

    await expect(
      debitWallet(member.id, new Decimal("0.00"), "PAYOUT" as const, "Zero payout")
    ).rejects.toThrow(/positive/i);

    await expect(
      debitWallet(member.id, new Decimal("-100.00"), "PAYOUT" as const, "Negative")
    ).rejects.toThrow(/positive/i);
  });

  it("creates PAYOUT wallet transaction", async () => {
    const member = createMember();
    createWallet({
      userId: member.id,
      pending: new Decimal("5000.00"),
      totalEarned: new Decimal("5000.00"),
    });

    const result = await debitWallet(
      member.id,
      new Decimal("3000.00"),
      "PAYOUT" as const,
      "March payout"
    );

    expect(result.transaction).toBeDefined();
    expect(result.transaction.type).toBe("PAYOUT");
    expect(result.transaction.amount).toEqual(new Decimal("-3000.00"));
    expect(result.transaction.description).toContain("March payout");
  });

  it("wallet invariant holds after payout", async () => {
    const member = createMember();
    createWallet({
      userId: member.id,
      pending: new Decimal("8000.00"),
      totalEarned: new Decimal("10000.00"),
      paidOut: new Decimal("2000.00"),
    });

    const result = await debitWallet(
      member.id,
      new Decimal("3000.00"),
      "PAYOUT" as const,
      "Payout"
    );

    // total_earned (10000) = pending (5000) + paid_out (5000)
    expect(result.wallet.totalEarned).toEqual(
      result.wallet.pending.add(result.wallet.paidOut)
    );
  });

  it("handles exact pending amount (pending becomes 0)", async () => {
    const member = createMember();
    createWallet({
      userId: member.id,
      pending: new Decimal("5000.00"),
      totalEarned: new Decimal("5000.00"),
      paidOut: new Decimal("0.00"),
    });

    const result = await debitWallet(
      member.id,
      new Decimal("5000.00"),
      "PAYOUT" as const,
      "Full payout"
    );

    expect(result.wallet.pending).toEqual(new Decimal("0.00"));
    expect(result.wallet.paidOut).toEqual(new Decimal("5000.00"));
  });
});

describe("adjustWallet", () => {
  it("positive adjustment: increases pending + total_earned", async () => {
    const member = createMember();
    const admin = createMember({ role: "ADMIN" });
    createWallet({
      userId: member.id,
      pending: new Decimal("2000.00"),
      totalEarned: new Decimal("5000.00"),
      paidOut: new Decimal("3000.00"),
    });

    const result = await adjustWallet(
      member.id,
      new Decimal("500.00"),
      "Correction for missed commission",
      admin.id
    );

    expect(result.wallet.pending).toEqual(new Decimal("2500.00"));
    expect(result.wallet.totalEarned).toEqual(new Decimal("5500.00"));
  });

  it("negative adjustment: decreases pending + total_earned", async () => {
    const member = createMember();
    const admin = createMember({ role: "ADMIN" });
    createWallet({
      userId: member.id,
      pending: new Decimal("3000.00"),
      totalEarned: new Decimal("8000.00"),
      paidOut: new Decimal("5000.00"),
    });

    const result = await adjustWallet(
      member.id,
      new Decimal("-1000.00"),
      "Overpayment correction",
      admin.id
    );

    expect(result.wallet.pending).toEqual(new Decimal("2000.00"));
    expect(result.wallet.totalEarned).toEqual(new Decimal("7000.00"));
  });

  it("negative adjustment: can make pending negative", async () => {
    const member = createMember();
    const admin = createMember({ role: "ADMIN" });
    createWallet({
      userId: member.id,
      pending: new Decimal("500.00"),
      totalEarned: new Decimal("5500.00"),
      paidOut: new Decimal("5000.00"),
    });

    const result = await adjustWallet(
      member.id,
      new Decimal("-1000.00"),
      "Large correction",
      admin.id
    );

    expect(result.wallet.pending).toEqual(new Decimal("-500.00"));
  });

  it("rejects if no reason provided", async () => {
    const member = createMember();
    const admin = createMember({ role: "ADMIN" });
    createWallet({ userId: member.id });

    await expect(
      adjustWallet(member.id, new Decimal("100.00"), "", admin.id)
    ).rejects.toThrow(/reason/i);
  });

  it("creates ADJUSTMENT wallet transaction with reason", async () => {
    const member = createMember();
    const admin = createMember({ role: "ADMIN" });
    createWallet({ userId: member.id });

    const result = await adjustWallet(
      member.id,
      new Decimal("750.00"),
      "Manual correction for Q1",
      admin.id
    );

    expect(result.transaction).toBeDefined();
    expect(result.transaction.type).toBe("ADJUSTMENT");
    expect(result.transaction.amount).toEqual(new Decimal("750.00"));
    expect(result.transaction.description).toContain("Manual correction for Q1");
  });

  it("records admin ID as created_by", async () => {
    const member = createMember();
    const admin = createMember({ id: "admin-uuid-001", role: "ADMIN" });
    createWallet({ userId: member.id });

    const result = await adjustWallet(
      member.id,
      new Decimal("200.00"),
      "Admin adjustment",
      admin.id
    );

    expect(result.transaction.createdById).toBe("admin-uuid-001");
  });

  it("wallet invariant holds after adjustment", async () => {
    const member = createMember();
    const admin = createMember({ role: "ADMIN" });
    createWallet({
      userId: member.id,
      pending: new Decimal("4000.00"),
      totalEarned: new Decimal("9000.00"),
      paidOut: new Decimal("5000.00"),
    });

    const result = await adjustWallet(
      member.id,
      new Decimal("-1500.00"),
      "Correction",
      admin.id
    );

    // total_earned (7500) = pending (2500) + paid_out (5000)
    expect(result.wallet.totalEarned).toEqual(
      result.wallet.pending.add(result.wallet.paidOut)
    );
  });
});

describe("getWalletSummary", () => {
  it("returns { totalEarned, pending, paidOut }", async () => {
    const member = createMember();
    createWallet({
      userId: member.id,
      totalEarned: new Decimal("15000.00"),
      pending: new Decimal("5000.00"),
      paidOut: new Decimal("10000.00"),
    });

    const summary = await getWalletSummary(member.id);

    expect(summary).toMatchObject({
      totalEarned: new Decimal("15000.00"),
      pending: new Decimal("5000.00"),
      paidOut: new Decimal("10000.00"),
    });
  });

  it("returns zeros for new wallet", async () => {
    const member = createMember();
    createWallet({ userId: member.id });

    const summary = await getWalletSummary(member.id);

    expect(summary.totalEarned).toEqual(new Decimal("0.00"));
    expect(summary.pending).toEqual(new Decimal("0.00"));
    expect(summary.paidOut).toEqual(new Decimal("0.00"));
  });

  it("reflects all transaction types correctly", async () => {
    // After credit + debit + adjustment → summary matches final state
    const member = createMember();
    createWallet({
      userId: member.id,
      totalEarned: new Decimal("10000.00"),
      pending: new Decimal("3000.00"),
      paidOut: new Decimal("7000.00"),
    });

    // Simulate: credited 10k, paid out 7k, pending 3k
    const summary = await getWalletSummary(member.id);

    expect(summary.totalEarned).toEqual(
      summary.pending.add(summary.paidOut)
    );
  });
});
