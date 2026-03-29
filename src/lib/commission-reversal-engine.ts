// Commission reversal engine — Prisma-based for production use
// Reverses commissions for a returned sale: negative commission records, wallet deductions,
// COMMISSION_REVERSAL transactions, notifications — all in a DB transaction.

import { PrismaClient, Prisma } from "@prisma/client";

export interface ReversalPreview {
  beneficiaryId: string;
  beneficiaryName: string;
  level: number;
  amount: string; // original commission amount to be reversed
}

/** Preview which members/amounts will be affected before actually reversing */
export async function getReversalPreview(
  prisma: PrismaClient,
  saleId: string
): Promise<ReversalPreview[]> {
  const commissions = await prisma.commission.findMany({
    where: { saleId, type: "EARNING" },
    include: { beneficiary: { select: { id: true, name: true } } },
    orderBy: { level: "asc" },
  });

  return commissions.map((c) => ({
    beneficiaryId: c.beneficiary.id,
    beneficiaryName: c.beneficiary.name,
    level: c.level,
    amount: c.amount.toString(),
  }));
}

/** Reverse all commissions for a sale — call only on APPROVED sales */
export async function reverseCommissionsForSale(
  prisma: PrismaClient,
  saleId: string,
  returnReason: string,
  adminId: string
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { member: { select: { name: true } } },
    });
    if (!sale) throw new Error("Sale not found");
    if (sale.status === "RETURNED") throw new Error("Sale already returned");
    if (sale.status !== "APPROVED")
      throw new Error("Only approved sales can be returned");

    // Get original EARNING commissions
    const originalCommissions = await tx.commission.findMany({
      where: { saleId, type: "EARNING" },
      include: { beneficiary: { select: { id: true, name: true } } },
      orderBy: { level: "asc" },
    });

    const results: {
      commissionId: string;
      beneficiaryId: string;
      beneficiaryName: string;
      level: number;
      amount: Prisma.Decimal;
    }[] = [];

    for (const original of originalCommissions) {
      const negAmount = original.amount.neg();

      // Create REVERSAL commission record
      const reversal = await tx.commission.create({
        data: {
          saleId,
          beneficiaryId: original.beneficiaryId,
          sourceMemberId: original.sourceMemberId,
          level: original.level,
          percentage: original.percentage,
          amount: negAmount,
          type: "REVERSAL",
        },
      });

      // Deduct from wallet
      let wallet = await tx.wallet.findUnique({
        where: { userId: original.beneficiaryId },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { userId: original.beneficiaryId },
        });
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          pending: { decrement: original.amount },
          totalEarned: { decrement: original.amount },
        },
      });

      // Create COMMISSION_REVERSAL wallet transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "COMMISSION_REVERSAL",
          amount: negAmount,
          description: `Commission reversed for sale ${sale.billCode}`,
          referenceId: reversal.id,
        },
      });

      // Create notification
      await tx.notification.create({
        data: {
          userId: original.beneficiaryId,
          title: `Commission of ₹${original.amount} reversed due to sale return`,
          titleHi: `बिक्री वापसी के कारण ₹${original.amount} का कमीशन वापस लिया गया`,
          body: `Your Level ${original.level} commission of ₹${original.amount} from sale ${sale.billCode} has been reversed.`,
          bodyHi: `बिक्री ${sale.billCode} से आपका स्तर ${original.level} का ₹${original.amount} कमीशन वापस लिया गया है।`,
        },
      });

      results.push({
        commissionId: reversal.id,
        beneficiaryId: original.beneficiaryId,
        beneficiaryName: original.beneficiary.name,
        level: original.level,
        amount: negAmount,
      });
    }

    // Update sale status to RETURNED
    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: "RETURNED",
        returnReason: returnReason.trim(),
        returnedAt: new Date(),
      },
    });

    // Audit log: sale returned
    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: "SALE_RETURNED",
        entity: "Sale",
        entityId: saleId,
        details: JSON.stringify({
          billCode: sale.billCode,
          totalAmount: sale.totalAmount.toString(),
          returnReason: returnReason.trim(),
          reversals: results.map((r) => ({
            beneficiaryId: r.beneficiaryId,
            level: r.level,
            amount: r.amount.toString(),
          })),
        }),
      },
    });

    // Audit log: commissions reversed
    if (results.length > 0) {
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "COMMISSIONS_REVERSED",
          entity: "Sale",
          entityId: saleId,
          details: JSON.stringify({
            billCode: sale.billCode,
            reversals: results.map((r) => ({
              beneficiaryId: r.beneficiaryId,
              beneficiaryName: r.beneficiaryName,
              level: r.level,
              amount: r.amount.toString(),
            })),
          }),
        },
      });
    }

    return results;
  });
}
