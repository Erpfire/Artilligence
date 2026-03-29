import { describe, it, expect } from "vitest";
import { validateRegistration } from "./registration";
import { createMember } from "@/test/factories";

describe("validateRegistration", () => {
  const validData = {
    name: "Amit Kumar",
    email: "amit@example.com",
    phone: "9876543210",
    password: "SecurePass123",
    confirmPassword: "SecurePass123",
  };

  it("valid data + valid sponsor → passes", async () => {
    const sponsor = createMember({ status: "ACTIVE" });

    const result = await validateRegistration(validData, sponsor.id);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("sponsor not found → error 'invalid referral code'", async () => {
    const result = await validateRegistration(validData, "nonexistent-id");

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/invalid referral code/i) })
    );
  });

  it("sponsor is blocked → error 'referral link no longer active'", async () => {
    const sponsor = createMember({ status: "BLOCKED" });

    const result = await validateRegistration(validData, sponsor.id);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/no longer active/i) })
    );
  });

  it("sponsor is deactivated → error 'referral link no longer active'", async () => {
    const sponsor = createMember({ status: "DEACTIVATED" });

    const result = await validateRegistration(validData, sponsor.id);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/no longer active/i) })
    );
  });

  it("email matches sponsor's email → error 'cannot use own referral'", async () => {
    const sponsor = createMember({
      status: "ACTIVE",
      email: "amit@example.com",
    });

    const result = await validateRegistration(validData, sponsor.id);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/own referral/i) })
    );
  });

  it("phone matches sponsor's phone → error 'cannot use own referral'", async () => {
    const sponsor = createMember({
      status: "ACTIVE",
      phone: "+919876543210",
    });

    const result = await validateRegistration(
      { ...validData, phone: "9876543210" },
      sponsor.id
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/own referral/i) })
    );
  });

  it("duplicate email → error 'email already registered'", async () => {
    const sponsor = createMember({ status: "ACTIVE" });
    // Another member already has this email
    createMember({ email: "amit@example.com" });

    const result = await validateRegistration(validData, sponsor.id);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/email already registered/i) })
    );
  });

  it("duplicate phone → error 'phone already registered'", async () => {
    const sponsor = createMember({ status: "ACTIVE" });
    // Another member already has this phone
    createMember({ phone: "+919876543210" });

    const result = await validateRegistration(validData, sponsor.id);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/phone already registered/i) })
    );
  });

  it("invalid email format → validation error", async () => {
    const sponsor = createMember({ status: "ACTIVE" });

    const result = await validateRegistration(
      { ...validData, email: "not-an-email" },
      sponsor.id
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "email" })
    );
  });

  it("invalid phone format (not 10 digits, not starting 6-9) → validation error", async () => {
    const sponsor = createMember({ status: "ACTIVE" });

    // Too short
    const result1 = await validateRegistration(
      { ...validData, phone: "12345" },
      sponsor.id
    );
    expect(result1.valid).toBe(false);
    expect(result1.errors).toContainEqual(
      expect.objectContaining({ field: "phone" })
    );

    // Starts with 0 (not 6-9)
    const result2 = await validateRegistration(
      { ...validData, phone: "0123456789" },
      sponsor.id
    );
    expect(result2.valid).toBe(false);
    expect(result2.errors).toContainEqual(
      expect.objectContaining({ field: "phone" })
    );
  });

  it("password too short (< 8 chars) → validation error", async () => {
    const sponsor = createMember({ status: "ACTIVE" });

    const result = await validateRegistration(
      { ...validData, password: "short", confirmPassword: "short" },
      sponsor.id
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "password" })
    );
  });

  it("password mismatch → validation error", async () => {
    const sponsor = createMember({ status: "ACTIVE" });

    const result = await validateRegistration(
      { ...validData, confirmPassword: "DifferentPass123" },
      sponsor.id
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: "confirmPassword",
        message: expect.stringMatching(/mismatch|match/i),
      })
    );
  });

  it("empty required fields → validation errors for each", async () => {
    const sponsor = createMember({ status: "ACTIVE" });

    const result = await validateRegistration(
      {
        name: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
      },
      sponsor.id
    );

    expect(result.valid).toBe(false);
    // Should have errors for name, email, phone, password at minimum
    const fields = result.errors.map((e: { field: string }) => e.field);
    expect(fields).toContain("name");
    expect(fields).toContain("email");
    expect(fields).toContain("phone");
    expect(fields).toContain("password");
  });

  it("same IP registered 3 accounts in 24h → flag for review (not block)", async () => {
    const sponsor = createMember({ status: "ACTIVE" });
    // 3 members registered from same IP in last 24h
    createMember({ registrationIp: "192.168.1.100", createdAt: new Date("2026-01-15T08:00:00Z") });
    createMember({ registrationIp: "192.168.1.100", createdAt: new Date("2026-01-15T10:00:00Z") });
    createMember({ registrationIp: "192.168.1.100", createdAt: new Date("2026-01-15T12:00:00Z") });

    const result = await validateRegistration(
      { ...validData, email: "newuser@example.com", phone: "7777777777" },
      sponsor.id
    );

    // Should still pass (not block) but flag for review
    expect(result.valid).toBe(true);
    expect(result.flagged).toBe(true);
    expect(result.flagReason).toMatch(/ip/i);
  });
});
