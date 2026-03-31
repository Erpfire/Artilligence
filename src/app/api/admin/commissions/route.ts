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

// GET /api/admin/commissions — list current commission settings
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.commissionSetting.findMany({
    orderBy: { level: "asc" },
  });

  return NextResponse.json({
    settings: settings.map((s) => ({
      id: s.id,
      level: s.level,
      percentage: s.percentage.toString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
}

// POST /api/admin/commissions — add a new level
export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { level, percentage } = body;

  // Validation
  if (!level || !Number.isInteger(level) || level < 1) {
    return NextResponse.json(
      { error: "Level must be a positive integer" },
      { status: 400 }
    );
  }

  const pct = Number(percentage);
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    return NextResponse.json(
      { error: "Percentage must be between 0 and 100" },
      { status: 400 }
    );
  }

  // Check if level already exists
  const existing = await prisma.commissionSetting.findUnique({
    where: { level },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Level ${level} already exists` },
      { status: 409 }
    );
  }

  const setting = await prisma.commissionSetting.create({
    data: { level, percentage: pct },
  });

  // Record history
  await prisma.commissionRateHistory.create({
    data: {
      level,
      oldPercentage: null,
      newPercentage: pct,
      action: "ADDED",
      changedById: session.user.id,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "COMMISSION_LEVEL_ADDED",
      entity: "CommissionSetting",
      entityId: setting.id,
      details: `Added commission level ${level} at ${pct}%`,
    },
  });

  return NextResponse.json({
    setting: {
      id: setting.id,
      level: setting.level,
      percentage: setting.percentage.toString(),
      updatedAt: setting.updatedAt.toISOString(),
    },
  }, { status: 201 });
}

// PUT /api/admin/commissions — update a level's percentage
export async function PUT(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { level, percentage } = body;

  if (!level || !Number.isInteger(level) || level < 1) {
    return NextResponse.json(
      { error: "Level must be a positive integer" },
      { status: 400 }
    );
  }

  const pct = Number(percentage);
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    return NextResponse.json(
      { error: "Percentage must be between 0 and 100" },
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

  const oldPct = existing.percentage;

  const setting = await prisma.commissionSetting.update({
    where: { level },
    data: { percentage: pct },
  });

  // Record history
  await prisma.commissionRateHistory.create({
    data: {
      level,
      oldPercentage: oldPct,
      newPercentage: pct,
      action: "UPDATED",
      changedById: session.user.id,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "COMMISSION_RATE_UPDATED",
      entity: "CommissionSetting",
      entityId: setting.id,
      details: `Updated level ${level} commission from ${oldPct}% to ${pct}%`,
    },
  });

  return NextResponse.json({
    setting: {
      id: setting.id,
      level: setting.level,
      percentage: setting.percentage.toString(),
      updatedAt: setting.updatedAt.toISOString(),
    },
  });
}
