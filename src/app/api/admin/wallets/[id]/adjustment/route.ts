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

// POST /api/admin/wallets/[id]/adjustment — credit or debit adjustment
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
  const { type, reason } = body;
  const amount = parseFloat(body.amount);

  if (!type || !["credit", "debit"].includes(type)) {
    return NextResponse.json({ error: "Type must be credit or debit" }, { status: 400 });
  }

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
  }

  if (!reason || !reason.trim()) {
    return NextResponse.json({ error: "Reason is required for adjustments" }, { status: 400 });
  }

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { user: { select: { id: true, name: true } } },
  });

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const amountDecimal = new Prisma.Decimal(amount.toFixed(2));
  const isCredit = type === "credit";

  const result = await prisma.$transaction(async (tx) => {
    // Update wallet: credit increases both totalEarned and pending; debit decreases both
    const updated = await tx.wallet.update({
      where: { id: walletId },
      data: {
        totalEarned: isCredit ? { increment: amountDecimal } : { decrement: amountDecimal },
        pending: isCredit ? { increment: amountDecimal } : { decrement: amountDecimal },
      },
    });

    // Create ADJUSTMENT transaction (positive for credit, negative for debit)
    const txAmount = isCredit ? amountDecimal : amountDecimal.negated();
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId,
        type: "ADJUSTMENT",
        amount: txAmount,
        description: `${isCredit ? "Credit" : "Debit"} adjustment: ${reason.trim()}`,
        createdById: session.user.id,
      },
    });

    // Create notification
    const actionEn = isCredit ? "credited" : "debited";
    const actionHi = isCredit ? "जमा" : "कटौती";
    await tx.notification.create({
      data: {
        userId: wallet.user.id,
        title: `Wallet ${actionEn}: ₹${amount.toFixed(2)}`,
        titleHi: `वॉलेट ${actionHi}: ₹${amount.toFixed(2)}`,
        body: `Your wallet has been ${actionEn} ₹${amount.toFixed(2)}. Reason: ${reason.trim()}`,
        bodyHi: `आपके वॉलेट में ₹${amount.toFixed(2)} ${actionHi} हुई। कारण: ${reason.trim()}`,
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: isCredit ? "WALLET_CREDIT_ADJUSTMENT" : "WALLET_DEBIT_ADJUSTMENT",
        entity: "wallet",
        entityId: walletId,
        details: JSON.stringify({
          memberId: wallet.user.id,
          memberName: wallet.user.name,
          type,
          amount: amount.toFixed(2),
          reason: reason.trim(),
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
