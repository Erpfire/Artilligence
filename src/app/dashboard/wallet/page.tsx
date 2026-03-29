"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { formatINR } from "@/lib/i18n";

interface WalletTransaction {
  id: string;
  type: "COMMISSION" | "COMMISSION_REVERSAL" | "PAYOUT" | "ADJUSTMENT";
  amount: string;
  description: string | null;
  createdAt: string;
}

const TX_TYPE_COLORS: Record<string, string> = {
  COMMISSION: "bg-green-100 text-green-800",
  COMMISSION_REVERSAL: "bg-orange-100 text-orange-800",
  PAYOUT: "bg-blue-100 text-blue-800",
  ADJUSTMENT: "bg-gray-100 text-gray-800",
};

export default function WalletPage() {
  const { t } = useLanguage();
  const [wallet, setWallet] = useState<{ totalEarned: string; pending: string; paidOut: string } | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWallet() {
      setLoading(true);
      const res = await fetch("/api/dashboard/wallet");
      if (res.ok) {
        const data = await res.json();
        setWallet(data.wallet);
        setTransactions(data.transactions);
      }
      setLoading(false);
    }
    fetchWallet();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="wallet-loading">
        <div className="text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div data-testid="wallet-page">
      <h1 className="text-2xl font-bold text-gray-900 mb-6" data-testid="wallet-title">
        {t("wallet.title")}
      </h1>

      {/* Wallet summary cards */}
      {wallet && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8" data-testid="wallet-summary">
          <div className="rounded-lg bg-white p-5 shadow-sm border" data-testid="wallet-total-card">
            <p className="text-sm text-gray-500">{t("dashboard.wallet.total")}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900" data-testid="wallet-total-amount">
              {formatINR(wallet.totalEarned)}
            </p>
          </div>
          <div className="rounded-lg bg-white p-5 shadow-sm border" data-testid="wallet-pending-card">
            <p className="text-sm text-gray-500">{t("dashboard.wallet.pending")}</p>
            <p className="mt-1 text-2xl font-bold text-yellow-600" data-testid="wallet-pending-amount">
              {formatINR(wallet.pending)}
            </p>
          </div>
          <div className="rounded-lg bg-white p-5 shadow-sm border" data-testid="wallet-paid-card">
            <p className="text-sm text-gray-500">{t("dashboard.wallet.paid")}</p>
            <p className="mt-1 text-2xl font-bold text-green-600" data-testid="wallet-paid-amount">
              {formatINR(wallet.paidOut)}
            </p>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3" data-testid="transactions-title">
        {t("wallet.transactions")}
      </h2>

      {transactions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center" data-testid="transactions-empty">
          <p className="text-gray-500">{t("wallet.noTransactions")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm border" data-testid="transactions-list">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.map((tx) => (
                <tr key={tx.id} data-testid={`transaction-row-${tx.id}`}>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TX_TYPE_COLORS[tx.type]}`}
                      data-testid={`transaction-type-${tx.id}`}
                    >
                      {t(`wallet.type.${tx.type}` as any)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600" data-testid={`transaction-desc-${tx.id}`}>
                    {tx.description || "-"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      parseFloat(tx.amount) < 0 ? "text-red-600" : "text-green-600"
                    }`}
                    data-testid={`transaction-amount-${tx.id}`}
                  >
                    {formatINR(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(tx.createdAt).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
