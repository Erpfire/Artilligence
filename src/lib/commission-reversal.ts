// Commission reversal engine

import { store } from "./store";

export async function reverseCommissions(saleId: string) {
  const sale = store.sales.get(saleId);
  if (!sale) throw new Error("Sale not found");

  if (sale.status === "RETURNED") {
    throw new Error("Sale already returned");
  }

  const originalCommissions = store.commissions.filter(
    (c: any) => c.saleId === saleId && c.type === "EARNING"
  );

  if (originalCommissions.length === 0) {
    throw new Error("No commissions to reverse");
  }

  const reversals: any[] = [];

  for (const original of originalCommissions) {
    const negAmount = original.amount.neg();

    // Deduct from wallet
    const wallet = store.walletsByUserId.get(original.beneficiaryId);
    if (wallet) {
      wallet.pending = wallet.pending.sub(original.amount);
      wallet.totalEarned = wallet.totalEarned.sub(original.amount);
    }

    const tx = {
      id: `tx-${Math.random().toString(36).slice(2)}`,
      walletId: wallet?.id,
      type: "COMMISSION_REVERSAL",
      amount: negAmount,
      description: `Commission reversed for sale ${sale.billCode}`,
      referenceId: null,
      createdById: null,
      createdAt: new Date(),
    };
    store.walletTransactions.push(tx);

    const notification = {
      id: `notif-${Math.random().toString(36).slice(2)}`,
      userId: original.beneficiaryId,
      title: `Commission of ₹${original.amount} reversed due to sale return`,
      titleHi: null,
      body: null,
      bodyHi: null,
      isRead: false,
      createdAt: new Date(),
    };
    store.notifications.push(notification);

    reversals.push({
      beneficiaryId: original.beneficiaryId,
      level: original.level,
      amount: negAmount,
      type: "REVERSAL",
      transaction: tx,
      notification,
    });
  }

  return { reversals };
}
