// Wallet operations — credits, debits, adjustments, summaries

import { Decimal } from "@prisma/client/runtime/library";
import { store } from "./store";

export async function creditWallet(
  userId: string,
  amount: Decimal,
  transaction: { type: string; description: string; referenceId: string }
) {
  const wallet = store.walletsByUserId.get(userId);
  if (!wallet) throw new Error("Wallet not found");

  wallet.pending = wallet.pending.add(amount);
  wallet.totalEarned = wallet.totalEarned.add(amount);

  const tx = {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    walletId: wallet.id,
    type: transaction.type,
    amount,
    description: transaction.description,
    referenceId: transaction.referenceId,
    createdById: null,
    createdAt: new Date(),
  };
  store.walletTransactions.push(tx);

  return { wallet, transaction: tx };
}

export async function debitWallet(
  userId: string,
  amount: Decimal,
  type: string,
  description: string
) {
  if (amount.lte(new Decimal("0"))) {
    throw new Error("Amount must be positive");
  }

  const wallet = store.walletsByUserId.get(userId);
  if (!wallet) throw new Error("Wallet not found");

  if (amount.gt(wallet.pending)) {
    throw new Error("Insufficient pending balance");
  }

  wallet.pending = wallet.pending.sub(amount);
  wallet.paidOut = wallet.paidOut.add(amount);

  const tx = {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    walletId: wallet.id,
    type,
    amount: amount.neg(),
    description,
    referenceId: null,
    createdById: null,
    createdAt: new Date(),
  };
  store.walletTransactions.push(tx);

  return { wallet, transaction: tx };
}

export async function adjustWallet(
  userId: string,
  amount: Decimal,
  reason: string,
  adminId: string
) {
  if (!reason || reason.trim() === "") {
    throw new Error("Reason is required");
  }

  const wallet = store.walletsByUserId.get(userId);
  if (!wallet) throw new Error("Wallet not found");

  wallet.pending = wallet.pending.add(amount);
  wallet.totalEarned = wallet.totalEarned.add(amount);

  const tx = {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    walletId: wallet.id,
    type: "ADJUSTMENT",
    amount,
    description: reason,
    referenceId: null,
    createdById: adminId,
    createdAt: new Date(),
  };
  store.walletTransactions.push(tx);

  return { wallet, transaction: tx };
}

export async function getWalletSummary(userId: string) {
  const wallet = store.walletsByUserId.get(userId);
  if (!wallet) throw new Error("Wallet not found");

  return {
    totalEarned: wallet.totalEarned,
    pending: wallet.pending,
    paidOut: wallet.paidOut,
  };
}
