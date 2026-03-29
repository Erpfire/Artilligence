// Commission calculation engine

import { Decimal } from "@prisma/client/runtime/library";
import { store } from "./store";

const DEFAULT_RATES = [
  new Decimal("10.00"),
  new Decimal("6.00"),
  new Decimal("4.00"),
  new Decimal("3.00"),
  new Decimal("2.00"),
  new Decimal("1.00"),
  new Decimal("0.50"),
];

function getRate(levelIndex: number): Decimal {
  // Use stored settings if available, otherwise hardcoded defaults
  if (store.commissionSettingsArray) {
    const setting = store.commissionSettingsArray[levelIndex];
    if (setting) return setting.percentage;
  }
  return DEFAULT_RATES[levelIndex] ?? new Decimal("0");
}

export async function calculateCommissions(saleId: string) {
  const sale = store.sales.get(saleId);
  if (!sale) throw new Error("Sale not found");

  const seller = store.members.get(sale.memberId);
  if (!seller) throw new Error("Seller not found");

  // Walk upline, skip BLOCKED/DEACTIVATED
  const upline: any[] = [];
  let current = seller;
  while (current.parentId && upline.length < 7) {
    const parent = store.members.get(current.parentId);
    if (!parent) break;
    if (parent.status === "ACTIVE") {
      upline.push(parent);
    }
    current = parent;
  }

  const results: any[] = [];

  for (let i = 0; i < upline.length; i++) {
    const beneficiary = upline[i];
    const level = i + 1;
    const percentage = getRate(i);
    const rawAmount = sale.totalAmount.mul(percentage).div(100);
    const amount = new Decimal(rawAmount.toFixed(2));

    // Credit wallet — must exist for every active beneficiary
    const wallet = store.walletsByUserId.get(beneficiary.id);
    if (!wallet) throw new Error(`Wallet not found for member ${beneficiary.id}`);
    wallet.pending = wallet.pending.add(amount);
    wallet.totalEarned = wallet.totalEarned.add(amount);

    const tx = {
      id: `tx-${Math.random().toString(36).slice(2)}`,
      walletId: wallet?.id ?? null,
      type: "COMMISSION",
      amount,
      description: `Level ${level} commission from sale ${sale.billCode}`,
      referenceId: null,
      createdById: null,
      createdAt: new Date(),
    };
    store.walletTransactions.push(tx);

    const notification = {
      id: `notif-${Math.random().toString(36).slice(2)}`,
      userId: beneficiary.id,
      title: `Commission earned: ₹${amount} (Level ${level})`,
      titleHi: null,
      body: null,
      bodyHi: null,
      isRead: false,
      createdAt: new Date(),
    };
    store.notifications.push(notification);

    results.push({
      beneficiaryId: beneficiary.id,
      level,
      amount,
      percentage,
      transaction: tx,
      notification,
    });
  }

  return results;
}
