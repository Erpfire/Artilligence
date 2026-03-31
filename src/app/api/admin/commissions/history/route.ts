import { NextResponse } from "next/server";
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

// GET /api/admin/commissions/history — rate change history
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const history = await prisma.commissionRateHistory.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    history: history.map((h) => ({
      id: h.id,
      level: h.level,
      oldPercentage: h.oldPercentage?.toString() || null,
      newPercentage: h.newPercentage?.toString() || null,
      action: h.action,
      createdAt: h.createdAt.toISOString(),
    })),
  });
}
