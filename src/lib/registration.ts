// Registration validation

import { store } from "./store";

export async function validateRegistration(
  data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
  },
  sponsorId: string
) {
  const errors: Array<{ field: string; message: string }> = [];

  // 1. Required fields
  if (!data.name || data.name.trim() === "") {
    errors.push({ field: "name", message: "Name is required" });
  }
  if (!data.email || data.email.trim() === "") {
    errors.push({ field: "email", message: "Email is required" });
  }
  if (!data.phone || data.phone.trim() === "") {
    errors.push({ field: "phone", message: "Phone is required" });
  }
  if (!data.password || data.password.trim() === "") {
    errors.push({ field: "password", message: "Password is required" });
  }

  // 2. Email format
  if (data.email && data.email.trim() !== "") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      errors.push({ field: "email", message: "Invalid email format" });
    }
  }

  // 3. Phone format (Indian: 10 digits, starts with 6-9)
  if (data.phone && data.phone.trim() !== "") {
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(data.phone)) {
      errors.push({ field: "phone", message: "Phone must be 10 digits starting with 6-9" });
    }
  }

  // 4. Password min length
  if (data.password && data.password.length > 0 && data.password.length < 8) {
    errors.push({ field: "password", message: "Password must be at least 8 characters" });
  }

  // 5. Password confirmation
  if (data.password && data.confirmPassword && data.password !== data.confirmPassword) {
    errors.push({ field: "confirmPassword", message: "Passwords do not match" });
  }

  // 6. Sponsor checks
  const sponsor = store.members.get(sponsorId);
  if (!sponsor) {
    errors.push({ field: "sponsorId", message: "Invalid referral code" });
  } else {
    if (sponsor.status === "BLOCKED" || sponsor.status === "DEACTIVATED") {
      errors.push({ field: "sponsorId", message: "Referral link no longer active" });
    }

    // Self-referral by email
    if (data.email && sponsor.email === data.email) {
      errors.push({ field: "email", message: "Cannot use own referral code" });
    }

    // Self-referral by phone
    if (data.phone && data.phone.trim() !== "") {
      const normalized = "+91" + data.phone.replace(/\D/g, "").slice(-10);
      if (sponsor.phone === normalized) {
        errors.push({ field: "phone", message: "Cannot use own referral code" });
      }
    }
  }

  // 7. Duplicate email
  const allMembers = Array.from(store.members.values());
  if (data.email && data.email.trim() !== "") {
    const emailExists = allMembers.find(
      (m: any) => m.email === data.email && m.id !== sponsorId
    );
    if (emailExists) {
      errors.push({ field: "email", message: "Email already registered" });
    }
  }

  // 8. Duplicate phone
  if (data.phone && data.phone.trim() !== "") {
    const normalized = "+91" + data.phone.replace(/\D/g, "").slice(-10);
    const phoneExists = allMembers.find(
      (m: any) => m.phone === normalized && m.id !== sponsorId
    );
    if (phoneExists) {
      errors.push({ field: "phone", message: "Phone already registered" });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // 9. IP-based fraud flagging (flag, not block)
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentMembers = allMembers.filter(
    (m: any) => m.createdAt.getTime() >= dayAgo.getTime()
  );

  const ipCounts = new Map<string, number>();
  for (const m of recentMembers) {
    if (m.registrationIp) {
      ipCounts.set(m.registrationIp, (ipCounts.get(m.registrationIp) || 0) + 1);
    }
  }

  let flagged = false;
  let flagReason: string | undefined;
  for (const [ip, count] of ipCounts) {
    if (count >= 3) {
      flagged = true;
      flagReason = `Multiple registrations from same IP address (${ip})`;
      break;
    }
  }

  return { valid: true, errors: [], flagged, flagReason };
}
