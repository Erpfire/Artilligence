import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// GET /api/dashboard/wallet — wallet summary + transactions with filters
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const url = request.nextUrl;

  // Pagination
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10")));
  const skip = (page - 1) * limit;

  // Type filter
  const typeFilter = url.searchParams.get("type");
  const validTypes = ["COMMISSION", "COMMISSION_REVERSAL", "PAYOUT", "ADJUSTMENT"];

  // Date range filter
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  const wallet = await prisma.wallet.findUnique({
    where: { userId },
  });

  if (!wallet) {
    return NextResponse.json({
      wallet: { totalEarned: "0", pending: "0", paidOut: "0" },
      transactions: [],
      pagination: { page: 1, limit, total: 0, totalPages: 0 },
    });
  }

  // Build transaction where clause
  const where: Prisma.WalletTransactionWhereInput = {
    walletId: wallet.id,
  };

  if (typeFilter && validTypes.includes(typeFilter)) {
    where.type = typeFilter as any;
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      where.createdAt.gte = new Date(dateFrom);
    }
    if (dateTo) {
      // Include the full end day
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = endDate;
    }
  }

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return NextResponse.json({
    wallet: {
      totalEarned: wallet.totalEarned.toString(),
      pending: wallet.pending.toString(),
      paidOut: wallet.paidOut.toString(),
    },
    transactions: transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount.toString(),
      description: tx.description,
      createdAt: tx.createdAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
