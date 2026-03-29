// Commission calculation engine — Prisma-based for production use
// Walks upline tree, calculates commissions per level, credits wallets, creates notifications

import { PrismaClient, Prisma } from "@prisma/client";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function calculateCommissionsForSale(
  prisma: PrismaClient,
  saleId: string
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { member: true },
    });
    if (!sale) throw new Error("Sale not found");
    if (sale.status !== "APPROVED") throw new Error("Sale must be APPROVED");

    const seller = sale.member;

    // Get commission settings ordered by level
    const settings = await tx.commissionSetting.findMany({
      orderBy: { level: "asc" },
    });
    if (settings.length === 0) return [];

    const maxLevels = settings.length;

    // Walk upline — skip BLOCKED/DEACTIVATED members
    const upline: { id: string; name: string }[] = [];
    let currentId = seller.parentId;

    while (currentId && upline.length < maxLevels) {
      const ancestor = await tx.user.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true, status: true },
      });
      if (!ancestor) break;

      if (ancestor.status === "ACTIVE") {
        upline.push({ id: ancestor.id, name: ancestor.name });
      }
      currentId = ancestor.parentId;
    }

    const results: {
      commissionId: string;
      beneficiaryId: string;
      level: number;
      amount: Prisma.Decimal;
      percentage: Prisma.Decimal;
    }[] = [];

    for (let i = 0; i < upline.length; i++) {
      const beneficiary = upline[i];
      const setting = settings[i];
      if (!setting) break;

      const level = setting.level;
      const percentage = setting.percentage;
      const amount = new Prisma.Decimal(
        sale.totalAmount.mul(percentage).div(100).toFixed(2)
      );

      // Create commission record
      const commission = await tx.commission.create({
        data: {
          saleId: sale.id,
          beneficiaryId: beneficiary.id,
          sourceMemberId: seller.id,
          level,
          percentage,
          amount,
          type: "EARNING",
        },
      });

      // Ensure wallet exists, then credit
      let wallet = await tx.wallet.findUnique({
        where: { userId: beneficiary.id },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { userId: beneficiary.id },
        });
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          pending: { increment: amount },
          totalEarned: { increment: amount },
        },
      });

      // Create wallet transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "COMMISSION",
          amount,
          description: `Level ${level} commission from sale ${sale.billCode}`,
          referenceId: commission.id,
        },
      });

      // Create notification
      await tx.notification.create({
        data: {
          userId: beneficiary.id,
          title: `Commission earned: ₹${amount} (Level ${level})`,
          titleHi: `कमीशन अर्जित: ₹${amount} (स्तर ${level})`,
          body: `You earned a Level ${level} commission of ₹${amount} from a sale by ${seller.name}.`,
          bodyHi: `आपने ${seller.name} की बिक्री से स्तर ${level} का ₹${amount} कमीशन अर्जित किया।`,
        },
      });

      results.push({
        commissionId: commission.id,
        beneficiaryId: beneficiary.id,
        level,
        amount,
        percentage,
      });
    }

    return results;
  });
}
