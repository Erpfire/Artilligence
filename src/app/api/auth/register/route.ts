import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db";

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, password, confirmPassword, referralCode, preferredLanguage } = body;

    // Basic validation
    const errors: Array<{ field: string; message: string }> = [];

    if (!name?.trim()) errors.push({ field: "name", message: "Name is required" });
    if (!email?.trim()) errors.push({ field: "email", message: "Email is required" });
    if (!phone?.trim()) errors.push({ field: "phone", message: "Phone is required" });
    if (!password) errors.push({ field: "password", message: "Password is required" });

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: "email", message: "Invalid email format" });
    }

    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      errors.push({ field: "phone", message: "Phone must be 10 digits starting with 6-9" });
    }

    if (password && password.length < 8) {
      errors.push({ field: "password", message: "Password must be at least 8 characters" });
    }

    if (password && confirmPassword && password !== confirmPassword) {
      errors.push({ field: "confirmPassword", message: "Passwords do not match" });
    }

    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // Find sponsor
    const sponsor = await prisma.user.findUnique({
      where: { referralCode },
      select: { id: true, email: true, phone: true, status: true },
    });

    if (!sponsor) {
      return NextResponse.json(
        { errors: [{ field: "referralCode", message: "Invalid referral code" }] },
        { status: 400 }
      );
    }

    if (sponsor.status === "BLOCKED" || sponsor.status === "DEACTIVATED") {
      return NextResponse.json(
        { errors: [{ field: "referralCode", message: "Referral link no longer active" }] },
        { status: 400 }
      );
    }

    // Self-referral prevention
    if (sponsor.email === email) {
      return NextResponse.json(
        { errors: [{ field: "email", message: "Cannot use own referral code" }] },
        { status: 400 }
      );
    }

    const normalizedPhone = "+91" + phone.replace(/\D/g, "").slice(-10);
    if (sponsor.phone === normalizedPhone) {
      return NextResponse.json(
        { errors: [{ field: "phone", message: "Cannot use own referral code" }] },
        { status: 400 }
      );
    }

    // Duplicate checks
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json(
        { errors: [{ field: "email", message: "Email already registered" }] },
        { status: 400 }
      );
    }

    const existingPhone = await prisma.user.findFirst({ where: { phone: normalizedPhone } });
    if (existingPhone) {
      return NextResponse.json(
        { errors: [{ field: "phone", message: "Phone already registered" }] },
        { status: 400 }
      );
    }

    // BFS placement: find position under sponsor's subtree
    const placement = await findPlacementPosition(sponsor.id);

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate unique referral code
    let newReferralCode = generateReferralCode();
    while (await prisma.user.findUnique({ where: { referralCode: newReferralCode } })) {
      newReferralCode = generateReferralCode();
    }

    // Get registration IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    // Create user + wallet in a transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: name.trim(),
          phone: normalizedPhone,
          role: "MEMBER",
          sponsorId: sponsor.id,
          parentId: placement.parentId,
          position: placement.position,
          depth: placement.depth,
          path: placement.path,
          referralCode: newReferralCode,
          preferredLanguage: preferredLanguage === "hi" ? "hi" : "en",
          registrationIp: ip,
        },
      });

      // Update path with actual user ID
      const correctPath = placement.path.replace(/[^/]+$/, newUser.id);
      await tx.user.update({
        where: { id: newUser.id },
        data: { path: correctPath },
      });

      // Create wallet
      await tx.wallet.create({
        data: { userId: newUser.id },
      });

      return newUser;
    });

    // IP-based fraud flagging
    if (ip) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentFromIp = await prisma.user.count({
        where: { registrationIp: ip, createdAt: { gte: dayAgo } },
      });
      if (recentFromIp >= 3) {
        // Flag for review — not blocking
        console.warn(`Multiple registrations from IP ${ip}: ${recentFromIp} in 24h`);
      }
    }

    return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
  } catch (error: any) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { errors: [{ field: "general", message: "Registration failed. Please try again." }] },
      { status: 500 }
    );
  }
}

// BFS tree placement using Prisma
async function findPlacementPosition(sponsorId: string) {
  const sponsor = await prisma.user.findUnique({
    where: { id: sponsorId },
    select: { id: true, depth: true, path: true },
  });
  if (!sponsor) throw new Error("Sponsor not found");

  const queue = [sponsor];

  while (queue.length > 0) {
    const node = queue.shift()!;
    const children = await prisma.user.findMany({
      where: { parentId: node.id },
      select: { id: true, depth: true, path: true, position: true },
      orderBy: { position: "asc" },
    });

    if (children.length < 3) {
      const position = children.length + 1;
      const depth = node.depth + 1;
      const path = `${node.path}/placeholder`;
      return { parentId: node.id, position, depth, path };
    }

    queue.push(...children);
  }

  throw new Error("No available position found");
}
