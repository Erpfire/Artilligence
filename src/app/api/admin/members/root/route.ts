import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcrypt";
import crypto from "crypto";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

// POST /api/admin/members/root — create root member (only when no members exist)
export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if any members exist
  const memberCount = await prisma.user.count({ where: { role: "MEMBER" } });
  if (memberCount > 0) {
    return NextResponse.json(
      { error: "Root member already exists. Cannot create another." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { name, email, phone, password } = body;

  // Validation
  const errors: string[] = [];
  if (!name?.trim()) errors.push("Name is required");
  if (!email?.trim()) errors.push("Email is required");
  if (!phone?.trim()) errors.push("Phone is required");
  if (!password || password.length < 8) errors.push("Password must be at least 8 characters");

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
  }

  // Check duplicates
  const existingEmail = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (existingEmail) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const existingPhone = await prisma.user.findUnique({ where: { phone: phone.trim() } });
  if (existingPhone) {
    return NextResponse.json({ error: "Phone already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const referralCode = `ROOT${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

  const member = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      passwordHash,
      role: "MEMBER",
      referralCode,
      depth: 0,
      path: "/root",
      status: "ACTIVE",
      hasCompletedOnboarding: false,
    },
  });

  // Create wallet
  await prisma.wallet.create({ data: { userId: member.id } });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "ROOT_MEMBER_CREATED",
      entity: "User",
      entityId: member.id,
      details: `Created root member: ${member.name} (${member.email})`,
    },
  });

  return NextResponse.json({ member }, { status: 201 });
}
