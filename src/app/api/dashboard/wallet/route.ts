import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/dashboard/wallet — wallet summary + transactions
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!wallet) {
    return NextResponse.json({
      wallet: { totalEarned: "0", pending: "0", paidOut: "0" },
      transactions: [],
    });
  }

  return NextResponse.json({
    wallet: {
      totalEarned: wallet.totalEarned.toString(),
      pending: wallet.pending.toString(),
      paidOut: wallet.paidOut.toString(),
    },
    transactions: wallet.transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount.toString(),
      description: tx.description,
      createdAt: tx.createdAt.toISOString(),
    })),
  });
}
