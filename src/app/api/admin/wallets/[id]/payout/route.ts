import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

// POST /api/admin/wallets/[id]/payout — process payout for a member wallet
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: walletId } = await params;
  const body = await request.json();
  const amount = parseFloat(body.amount);

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
  }

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { user: { select: { id: true, name: true } } },
  });

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const pendingNum = Number(wallet.pending);
  if (amount > pendingNum) {
    return NextResponse.json({ error: "Amount exceeds pending balance" }, { status: 400 });
  }

  // Process payout in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const amountDecimal = new Prisma.Decimal(amount.toFixed(2));

    // Update wallet: pending decreases, paidOut increases
    const updated = await tx.wallet.update({
      where: { id: walletId },
      data: {
        pending: { decrement: amountDecimal },
        paidOut: { increment: amountDecimal },
      },
    });

    // Create PAYOUT transaction
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId,
        type: "PAYOUT",
        amount: amountDecimal.negated(),
        description: `Payout of ₹${amount.toFixed(2)}`,
        createdById: session.user.id,
      },
    });

    // Create notification
    await tx.notification.create({
      data: {
        userId: wallet.user.id,
        title: `Payout of ₹${amount.toFixed(2)} processed`,
        titleHi: `₹${amount.toFixed(2)} का भुगतान हो गया`,
        body: `Your payout of ₹${amount.toFixed(2)} has been processed. Paid out balance: ₹${Number(updated.paidOut).toFixed(2)}`,
        bodyHi: `आपका ₹${amount.toFixed(2)} का भुगतान हो गया है। भुगतान की गई राशि: ₹${Number(updated.paidOut).toFixed(2)}`,
        link: "/dashboard/wallet",
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: "PAYOUT_PROCESSED",
        entity: "wallet",
        entityId: walletId,
        details: JSON.stringify({
          memberId: wallet.user.id,
          memberName: wallet.user.name,
          amount: amount.toFixed(2),
          transactionId: transaction.id,
        }),
      },
    });

    return updated;
  });

  return NextResponse.json({
    wallet: {
      totalEarned: result.totalEarned.toString(),
      pending: result.pending.toString(),
      paidOut: result.paidOut.toString(),
    },
  });
}
