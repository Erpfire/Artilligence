import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  detectSaleFlags,
  checkRateLimit,
  validateBillCode,
} from "./fraud-detection";
import {
  createMember,
  createSale,
  createAppSetting,
} from "@/test/factories";

// ─── detectSaleFlags ─────────────────────────────────────────────────

describe("detectSaleFlags", () => {
  it("flags REPEAT_CUSTOMER when same customer name in 3+ sales across different members", async () => {
    // 3 different members sold to "Rahul Sharma"
    const memberA = createMember();
    const memberB = createMember();
    const memberC = createMember();
    createSale({ memberId: memberA.id, customerName: "Rahul Sharma" });
    createSale({ memberId: memberB.id, customerName: "Rahul Sharma" });
    const targetSale = createSale({ memberId: memberC.id, customerName: "Rahul Sharma" });

    const flags = await detectSaleFlags(targetSale.id);

    const repeatFlag = flags.find((f: { type: string }) => f.type === "REPEAT_CUSTOMER");
    expect(repeatFlag).toBeDefined();
    expect(repeatFlag!.severity).toBe("MEDIUM");
  });

  it("no REPEAT_CUSTOMER flag when same name but same member (returning customer)", async () => {
    // Same member sold to "Rahul Sharma" 3 times — legitimate returning customer
    const member = createMember();
    createSale({ memberId: member.id, customerName: "Rahul Sharma" });
    createSale({ memberId: member.id, customerName: "Rahul Sharma" });
    const targetSale = createSale({ memberId: member.id, customerName: "Rahul Sharma" });

    const flags = await detectSaleFlags(targetSale.id);

    const repeatFlag = flags.find((f: { type: string }) => f.type === "REPEAT_CUSTOMER");
    expect(repeatFlag).toBeUndefined();
  });

  it("flags REPEAT_PHONE when same customer phone in 3+ sales across different members", async () => {
    const memberA = createMember();
    const memberB = createMember();
    const memberC = createMember();
    createSale({ memberId: memberA.id, customerPhone: "+919876543210" });
    createSale({ memberId: memberB.id, customerPhone: "+919876543210" });
    const targetSale = createSale({ memberId: memberC.id, customerPhone: "+919876543210" });

    const flags = await detectSaleFlags(targetSale.id);

    const phoneFlag = flags.find((f: { type: string }) => f.type === "REPEAT_PHONE");
    expect(phoneFlag).toBeDefined();
    expect(phoneFlag!.severity).toBe("MEDIUM");
  });

  it("flags HIGH_AMOUNT when sale > 2x average sale amount", async () => {
    // Average sale: ₹5,000 (from 3 prior sales)
    // This sale: ₹12,000 (> 2 * 5000 = 10,000) → flag
    const member = createMember();
    createSale({ memberId: member.id, totalAmount: new Decimal("5000.00") });
    createSale({ memberId: member.id, totalAmount: new Decimal("4000.00") });
    createSale({ memberId: member.id, totalAmount: new Decimal("6000.00") });
    const highSale = createSale({
      memberId: member.id,
      totalAmount: new Decimal("12000.00"),
    });

    const flags = await detectSaleFlags(highSale.id);

    const highFlag = flags.find((f: { type: string }) => f.type === "HIGH_AMOUNT");
    expect(highFlag).toBeDefined();
    expect(highFlag!.severity).toBe("LOW");
  });

  it("no HIGH_AMOUNT flag for first sale ever (no average)", async () => {
    const member = createMember();
    const firstSale = createSale({
      memberId: member.id,
      totalAmount: new Decimal("50000.00"),
    });

    const flags = await detectSaleFlags(firstSale.id);

    const highFlag = flags.find((f: { type: string }) => f.type === "HIGH_AMOUNT");
    expect(highFlag).toBeUndefined();
  });

  it("flags RAPID_SALES when 3+ sales from same member within 1 hour", async () => {
    const member = createMember();
    const now = new Date("2026-01-15T10:00:00Z");
    createSale({
      memberId: member.id,
      createdAt: new Date("2026-01-15T09:10:00Z"),
    });
    createSale({
      memberId: member.id,
      createdAt: new Date("2026-01-15T09:30:00Z"),
    });
    const rapidSale = createSale({
      memberId: member.id,
      createdAt: now,
    });

    const flags = await detectSaleFlags(rapidSale.id);

    const rapidFlag = flags.find((f: { type: string }) => f.type === "RAPID_SALES");
    expect(rapidFlag).toBeDefined();
    expect(rapidFlag!.severity).toBe("HIGH");
  });

  it("flags ROUND_NUMBERS for exact ₹10,000 or ₹50,000", async () => {
    const member = createMember();
    const roundSale = createSale({
      memberId: member.id,
      totalAmount: new Decimal("10000.00"),
    });

    const flags = await detectSaleFlags(roundSale.id);

    const roundFlag = flags.find((f: { type: string }) => f.type === "ROUND_NUMBERS");
    expect(roundFlag).toBeDefined();
    expect(roundFlag!.severity).toBe("LOW");
  });

  it("no ROUND_NUMBERS flag for ₹10,500", async () => {
    const member = createMember();
    const normalSale = createSale({
      memberId: member.id,
      totalAmount: new Decimal("10500.00"),
    });

    const flags = await detectSaleFlags(normalSale.id);

    const roundFlag = flags.find((f: { type: string }) => f.type === "ROUND_NUMBERS");
    expect(roundFlag).toBeUndefined();
  });

  it("flags NEW_MEMBER_HIGH_SALE when member < 7 days old + sale above average", async () => {
    const newMember = createMember({
      createdAt: new Date("2026-01-12"),
    });
    // Average is ₹5,000 based on existing sales
    const otherMember = createMember();
    createSale({ memberId: otherMember.id, totalAmount: new Decimal("5000.00") });
    createSale({ memberId: otherMember.id, totalAmount: new Decimal("5000.00") });

    const highSale = createSale({
      memberId: newMember.id,
      totalAmount: new Decimal("8000.00"),
      createdAt: new Date("2026-01-15"),
    });

    const flags = await detectSaleFlags(highSale.id);

    const newMemberFlag = flags.find(
      (f: { type: string }) => f.type === "NEW_MEMBER_HIGH_SALE"
    );
    expect(newMemberFlag).toBeDefined();
    expect(newMemberFlag!.severity).toBe("MEDIUM");
  });

  it("multiple flags: sale triggers 2 flags → both created", async () => {
    // Round number + rapid sales
    const member = createMember();
    createSale({
      memberId: member.id,
      createdAt: new Date("2026-01-15T09:10:00Z"),
    });
    createSale({
      memberId: member.id,
      createdAt: new Date("2026-01-15T09:30:00Z"),
    });
    const multiSale = createSale({
      memberId: member.id,
      totalAmount: new Decimal("50000.00"),
      createdAt: new Date("2026-01-15T10:00:00Z"),
    });

    const flags = await detectSaleFlags(multiSale.id);

    const types = flags.map((f: { type: string }) => f.type);
    expect(types).toContain("RAPID_SALES");
    expect(types).toContain("ROUND_NUMBERS");
    expect(flags.length).toBeGreaterThanOrEqual(2);
  });

  it("no flags for normal sale → empty result", async () => {
    const member = createMember({
      createdAt: new Date("2025-01-01"), // old member
    });
    // Establish average around ₹5,000
    createSale({ memberId: member.id, totalAmount: new Decimal("5000.00") });
    createSale({ memberId: member.id, totalAmount: new Decimal("5500.00") });

    const normalSale = createSale({
      memberId: member.id,
      totalAmount: new Decimal("4800.00"),
      customerName: "Unique Customer",
      customerPhone: "+919111111111",
      createdAt: new Date("2026-01-20T14:00:00Z"),
    });

    const flags = await detectSaleFlags(normalSale.id);

    expect(flags).toHaveLength(0);
  });
});

// ─── checkRateLimit ──────────────────────────────────────────────────

describe("checkRateLimit", () => {
  it("under daily limit → allowed", async () => {
    const member = createMember();
    // Member has 2 sales today, daily limit is 5
    createSale({ memberId: member.id, createdAt: new Date("2026-01-15T08:00:00Z") });
    createSale({ memberId: member.id, createdAt: new Date("2026-01-15T10:00:00Z") });

    const result = await checkRateLimit(member.id);

    expect(result.allowed).toBe(true);
  });

  it("at daily limit → blocked with message", async () => {
    const member = createMember();
    // Member has hit the daily limit (assume default 5)
    for (let i = 0; i < 5; i++) {
      createSale({
        memberId: member.id,
        createdAt: new Date(`2026-01-15T${(8 + i).toString().padStart(2, "0")}:00:00Z`),
      });
    }

    const result = await checkRateLimit(member.id);

    expect(result.allowed).toBe(false);
    expect(result.message).toMatch(/daily/i);
  });

  it("under weekly limit but at daily limit → blocked (daily takes precedence)", async () => {
    const member = createMember();
    // 5 sales today (at daily limit), but under weekly limit
    for (let i = 0; i < 5; i++) {
      createSale({
        memberId: member.id,
        createdAt: new Date(`2026-01-15T${(8 + i).toString().padStart(2, "0")}:00:00Z`),
      });
    }

    const result = await checkRateLimit(member.id);

    expect(result.allowed).toBe(false);
    expect(result.message).toMatch(/daily/i);
  });

  it("at weekly limit → blocked with message", async () => {
    const member = createMember();
    // Spread sales across the week to hit weekly limit (assume default 20)
    for (let day = 10; day < 15; day++) {
      for (let h = 0; h < 4; h++) {
        createSale({
          memberId: member.id,
          createdAt: new Date(`2026-01-${day}T${(8 + h).toString().padStart(2, "0")}:00:00Z`),
        });
      }
    }

    const result = await checkRateLimit(member.id);

    expect(result.allowed).toBe(false);
    expect(result.message).toMatch(/weekly/i);
  });

  it("within min gap → blocked with message", async () => {
    const member = createMember();
    // Last sale was 2 minutes ago, min gap is 5 minutes
    createSale({
      memberId: member.id,
      createdAt: new Date("2026-01-15T09:58:00Z"),
    });

    const result = await checkRateLimit(member.id);

    expect(result.allowed).toBe(false);
    expect(result.message).toMatch(/wait|gap|minutes/i);
  });

  it("gap expired → allowed", async () => {
    const member = createMember();
    // Last sale was 30 minutes ago — well past min gap
    createSale({
      memberId: member.id,
      createdAt: new Date("2026-01-15T09:00:00Z"),
    });

    const result = await checkRateLimit(member.id);

    expect(result.allowed).toBe(true);
  });

  it("different day resets daily count", async () => {
    const member = createMember();
    // 5 sales yesterday (at daily limit), 0 today → allowed
    for (let i = 0; i < 5; i++) {
      createSale({
        memberId: member.id,
        createdAt: new Date(`2026-01-14T${(8 + i).toString().padStart(2, "0")}:00:00Z`),
      });
    }

    const result = await checkRateLimit(member.id);

    expect(result.allowed).toBe(true);
  });

  it("different week resets weekly count", async () => {
    const member = createMember();
    // 20 sales last week (at weekly limit), 0 this week → allowed
    for (let day = 1; day < 6; day++) {
      for (let h = 0; h < 4; h++) {
        createSale({
          memberId: member.id,
          createdAt: new Date(`2026-01-0${day}T${(8 + h).toString().padStart(2, "0")}:00:00Z`),
        });
      }
    }

    const result = await checkRateLimit(member.id);

    expect(result.allowed).toBe(true);
  });

  it("reads limits from app_settings (not hardcoded)", async () => {
    // Custom settings: daily_limit=3 (instead of default 5)
    createAppSetting({ key: "rate_limit_daily", value: "3" });
    const member = createMember();
    for (let i = 0; i < 3; i++) {
      createSale({
        memberId: member.id,
        createdAt: new Date(`2026-01-15T${(8 + i).toString().padStart(2, "0")}:00:00Z`),
      });
    }

    const result = await checkRateLimit(member.id);

    expect(result.allowed).toBe(false);
    expect(result.message).toMatch(/daily/i);
  });
});

// ─── validateBillCode ────────────────────────────────────────────────

describe("validateBillCode", () => {
  it("null format → any code accepted", async () => {
    const result = await validateBillCode("ANYTHING-123", null);

    expect(result.valid).toBe(true);
  });

  it("matching format → accepted", async () => {
    const result = await validateBillCode("MB-12345", "^MB-\\d{5}$");

    expect(result.valid).toBe(true);
  });

  it("non-matching format → rejected with format hint", async () => {
    const result = await validateBillCode("INV-999", "^MB-\\d{5}$");

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/format/i);
  });

  it("duplicate bill code → rejected with 'already submitted'", async () => {
    // A sale with this bill code already exists
    createSale({ billCode: "MB-12345" });

    const result = await validateBillCode("MB-12345", "^MB-\\d{5}$");

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/already submitted/i);
  });

  it("similar bill code (Levenshtein < 2) → warning (not rejection)", async () => {
    // Existing: MB-12345, submitted: MB-12346 (1 char diff)
    createSale({ billCode: "MB-12345" });

    const result = await validateBillCode("MB-12346", "^MB-\\d{5}$");

    expect(result.valid).toBe(true);
    expect(result.warning).toMatch(/similar/i);
  });
});
