import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

// DELETE /api/admin/commissions/[level] — remove a commission level
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { level: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const level = parseInt(params.level);
  if (isNaN(level) || level < 1) {
    return NextResponse.json(
      { error: "Invalid level" },
      { status: 400 }
    );
  }

  const existing = await prisma.commissionSetting.findUnique({
    where: { level },
  });
  if (!existing) {
    return NextResponse.json(
      { error: `Level ${level} not found` },
      { status: 404 }
    );
  }

  await prisma.commissionSetting.delete({
    where: { level },
  });

  // Record history
  await prisma.commissionRateHistory.create({
    data: {
      level,
      oldPercentage: existing.percentage,
      newPercentage: null,
      action: "REMOVED",
      changedById: session.user.id,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "COMMISSION_LEVEL_REMOVED",
      entity: "CommissionSetting",
      entityId: existing.id,
      details: `Removed commission level ${level} (was ${existing.percentage}%)`,
    },
  });

  return NextResponse.json({ success: true });
}
