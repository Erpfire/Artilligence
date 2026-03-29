import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "all";

  // Calculate date range
  let dateFrom: Date | null = null;
  const now = new Date();
  if (period === "today") {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "week") {
    const day = now.getDay();
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  } else if (period === "month") {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // Wallet
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { totalEarned: true, pending: true, paidOut: true },
  });

  // Direct referrals (children in tree with this user as sponsor)
  const directReferrals = await prisma.user.count({
    where: { sponsorId: userId },
  });

  // Total downline — count all users whose path contains this user's id
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { path: true, referralCode: true, name: true },
  });

  let totalDownline = 0;
  if (user) {
    totalDownline = await prisma.user.count({
      where: {
        path: { startsWith: user.path + "/" },
        id: { not: userId },
      },
    });
  }

  // Recent commissions (with optional date filter) — includes both EARNING and REVERSAL
  const commissionWhere: Record<string, unknown> = {
    beneficiaryId: userId,
  };
  if (dateFrom) {
    commissionWhere.createdAt = { gte: dateFrom };
  }

  const recentCommissions = await prisma.commission.findMany({
    where: commissionWhere,
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      level: true,
      amount: true,
      percentage: true,
      type: true,
      createdAt: true,
      sale: {
        select: { billCode: true, totalAmount: true },
      },
      sourceMember: {
        select: { name: true },
      },
    },
  });

  return NextResponse.json({
    wallet: wallet
      ? {
          totalEarned: wallet.totalEarned.toString(),
          pending: wallet.pending.toString(),
          paidOut: wallet.paidOut.toString(),
        }
      : { totalEarned: "0", pending: "0", paidOut: "0" },
    directReferrals,
    totalDownline,
    referralCode: user?.referralCode || "",
    memberName: user?.name || session.user.name || "",
    recentCommissions: recentCommissions.map((c) => ({
      id: c.id,
      level: c.level,
      amount: c.amount.toString(),
      percentage: c.percentage.toString(),
      type: c.type,
      createdAt: c.createdAt.toISOString(),
      billCode: c.sale.billCode,
      saleAmount: c.sale.totalAmount.toString(),
      sourceMemberName: c.sourceMember.name,
    })),
  });
}
