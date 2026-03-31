"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { formatINR, formatDate } from "@/lib/i18n";
import { WalletSkeleton } from "@/components/Skeleton";

interface WalletTransaction {
  id: string;
  type: "COMMISSION" | "COMMISSION_REVERSAL" | "PAYOUT" | "ADJUSTMENT";
  amount: string;
  description: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const TX_TYPE_COLORS: Record<string, string> = {
  COMMISSION: "bg-green-100 text-green-800",
  COMMISSION_REVERSAL: "bg-orange-100 text-orange-800",
  PAYOUT: "bg-blue-100 text-blue-800",
  ADJUSTMENT: "bg-gray-100 text-gray-800",
};

const TX_TYPES = ["ALL", "COMMISSION", "COMMISSION_REVERSAL", "PAYOUT", "ADJUSTMENT"] as const;

export default function WalletPage() {
  const { t, locale } = useLanguage();
  const [wallet, setWallet] = useState<{ totalEarned: string; pending: string; paidOut: string } | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchWallet = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", "10");
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    const res = await fetch(`/api/dashboard/wallet?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setWallet(data.wallet);
      setTransactions(data.transactions);
      setPagination(data.pagination);
    }
    setLoading(false);
  }, [currentPage, typeFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // Reset to page 1 when filters change
  function handleTypeChange(val: string) {
    setTypeFilter(val);
    setCurrentPage(1);
  }

  function handleDateFromChange(val: string) {
    setDateFrom(val);
    setCurrentPage(1);
  }

  function handleDateToChange(val: string) {
    setDateTo(val);
    setCurrentPage(1);
  }

  function handleClearFilters() {
    setTypeFilter("ALL");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  }

  if (loading && !wallet) {
    return <WalletSkeleton />;
  }

  const hasFilters = typeFilter !== "ALL" || dateFrom || dateTo;

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

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end" data-testid="wallet-filters">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("wallet.filterType")}</label>
          <select
            value={typeFilter}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            data-testid="wallet-type-filter"
          >
            {TX_TYPES.map((type) => (
              <option key={type} value={type}>
                {type === "ALL" ? t("wallet.filterAll") : t(`wallet.type.${type}` as any)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("wallet.filterDateFrom")}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateFromChange(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            data-testid="wallet-date-from"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("wallet.filterDateTo")}</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateToChange(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            data-testid="wallet-date-to"
          />
        </div>
        {hasFilters && (
          <button
            onClick={handleClearFilters}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
            data-testid="wallet-clear-filters"
          >
            {t("wallet.clearFilters")}
          </button>
        )}
      </div>

      {transactions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center" data-testid="transactions-empty">
          <p className="text-gray-500">{hasFilters ? t("wallet.noFilteredTransactions") : t("wallet.noTransactions")}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-lg bg-white shadow-sm border" data-testid="transactions-list">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("wallet.colType")}</th>
                  <th className="px-4 py-3">{t("wallet.colDescription")}</th>
                  <th className="px-4 py-3 text-right">{t("wallet.colAmount")}</th>
                  <th className="px-4 py-3">{t("wallet.colDate")}</th>
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
                      {formatDate(tx.createdAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2" data-testid="transactions-cards">
            {transactions.map((tx) => (
              <div key={tx.id} className="rounded-lg border bg-white p-3 shadow-sm" data-testid={`transaction-card-${tx.id}`}>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TX_TYPE_COLORS[tx.type]}`}
                  >
                    {t(`wallet.type.${tx.type}` as any)}
                  </span>
                  <span className={`font-medium ${parseFloat(tx.amount) < 0 ? "text-red-600" : "text-green-600"}`}>
                    {formatINR(tx.amount)}
                  </span>
                </div>
                <p className="text-sm text-gray-600 truncate">{tx.description || "-"}</p>
                <p className="mt-1 text-xs text-gray-400">{formatDate(tx.createdAt, locale)}</p>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between" data-testid="wallet-pagination">
              <p className="text-sm text-gray-500" data-testid="wallet-pagination-info">
                {t("wallet.showing")} {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} {t("wallet.of")} {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  data-testid="wallet-prev-page"
                >
                  {t("wallet.prev")}
                </button>
                <span className="flex items-center px-2 text-sm text-gray-600" data-testid="wallet-page-info">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  data-testid="wallet-next-page"
                >
                  {t("wallet.next")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
