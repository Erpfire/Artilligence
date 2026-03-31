import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

// POST /api/admin/members/[id]/reset-password
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || existing.role !== "MEMBER") {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Generate temporary password
  const tempPassword = crypto.randomBytes(4).toString("hex"); // 8 chars hex
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await prisma.user.update({
    where: { id: params.id },
    data: {
      passwordHash,
      hasCompletedOnboarding: false, // Force onboarding/password change
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PASSWORD_RESET",
      entity: "User",
      entityId: params.id,
      details: `Reset password for member: ${existing.name} (${existing.email})`,
    },
  });

  return NextResponse.json({
    tempPassword,
    message: `Temporary password generated for ${existing.name}. They will be required to change it on next login.`,
  });
}
