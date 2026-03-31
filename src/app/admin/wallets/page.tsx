"use client";

import { useState, useEffect, useCallback } from "react";

interface WalletEntry {
  id: string;
  userId: string;
  totalEarned: string;
  pending: string;
  paidOut: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminWalletsPage() {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [totalPendingPayouts, setTotalPendingPayouts] = useState("0");
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Modal state
  const [modal, setModal] = useState<{
    type: "payout" | "adjustment" | null;
    wallet: WalletEntry | null;
  }>({ type: null, wallet: null });
  const [modalAmount, setModalAmount] = useState("");
  const [modalReason, setModalReason] = useState("");
  const [modalAdjType, setModalAdjType] = useState<"credit" | "debit">("credit");
  const [modalError, setModalError] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);

  const fetchWallets = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", "10");
    if (search) params.set("search", search);

    const res = await fetch(`/api/admin/wallets?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setWallets(data.wallets);
      setTotalPendingPayouts(data.totalPendingPayouts);
      setPagination(data.pagination);
    }
    setLoading(false);
  }, [currentPage, search]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  function openPayoutModal(w: WalletEntry) {
    setModal({ type: "payout", wallet: w });
    setModalAmount("");
    setModalError("");
    setModalSubmitting(false);
  }

  function openAdjustmentModal(w: WalletEntry) {
    setModal({ type: "adjustment", wallet: w });
    setModalAmount("");
    setModalReason("");
    setModalAdjType("credit");
    setModalError("");
    setModalSubmitting(false);
  }

  function closeModal() {
    setModal({ type: null, wallet: null });
  }

  async function handlePayout() {
    if (!modal.wallet) return;
    const amount = parseFloat(modalAmount);
    if (!amount || amount <= 0) {
      setModalError("Amount must be greater than zero");
      return;
    }
    if (amount > parseFloat(modal.wallet.pending)) {
      setModalError("Amount exceeds pending balance");
      return;
    }
    setModalSubmitting(true);
    setModalError("");

    const res = await fetch(`/api/admin/wallets/${modal.wallet.id}/payout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });

    if (!res.ok) {
      const data = await res.json();
      setModalError(data.error || "Failed to process payout");
      setModalSubmitting(false);
      return;
    }

    closeModal();
    fetchWallets();
  }

  async function handleAdjustment() {
    if (!modal.wallet) return;
    const amount = parseFloat(modalAmount);
    if (!amount || amount <= 0) {
      setModalError("Amount must be greater than zero");
      return;
    }
    if (!modalReason.trim()) {
      setModalError("Reason is required for adjustments");
      return;
    }
    setModalSubmitting(true);
    setModalError("");

    const res = await fetch(`/api/admin/wallets/${modal.wallet.id}/adjustment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: modalAdjType, amount, reason: modalReason }),
    });

    if (!res.ok) {
      const data = await res.json();
      setModalError(data.error || "Failed to process adjustment");
      setModalSubmitting(false);
      return;
    }

    closeModal();
    fetchWallets();
  }

  function formatINR(amount: string | number): string {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(num)) return "₹0.00";
    const isNeg = num < 0;
    const abs = Math.abs(num);
    const [intPart, decPart] = abs.toFixed(2).split(".");
    let formatted: string;
    if (intPart.length <= 3) {
      formatted = intPart;
    } else {
      const last3 = intPart.slice(-3);
      const rest = intPart.slice(0, -3);
      formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
    }
    return (isNeg ? "-" : "") + "₹" + formatted + "." + decPart;
  }

  function handleSearchChange(q: string) {
    setSearch(q);
    setCurrentPage(1);
  }

  return (
    <div data-testid="admin-wallets-page">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900" data-testid="admin-wallets-title">
          Wallet Management
        </h1>
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-2" data-testid="total-pending-payouts">
          <span className="text-sm text-yellow-700">Total Pending Payouts: </span>
          <span className="text-lg font-bold text-yellow-800" data-testid="total-pending-amount">
            {formatINR(totalPendingPayouts)}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          data-testid="wallets-search"
        />
      </div>

      {loading && wallets.length === 0 ? (
        <div className="flex items-center justify-center py-20" data-testid="wallets-loading">
          <span className="text-gray-500">Loading...</span>
        </div>
      ) : wallets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center" data-testid="wallets-empty">
          <p className="text-gray-500">No wallets found</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm border" data-testid="wallets-table">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3 text-right">Total Earned</th>
                  <th className="px-4 py-3 text-right">Pending</th>
                  <th className="px-4 py-3 text-right">Paid Out</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {wallets.map((w) => (
                  <tr key={w.id} data-testid={`wallet-row-${w.userId}`}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900" data-testid={`wallet-member-name-${w.userId}`}>{w.user.name}</p>
                        <p className="text-xs text-gray-500">{w.user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900" data-testid={`wallet-earned-${w.userId}`}>
                      {formatINR(w.totalEarned)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-yellow-600" data-testid={`wallet-pending-${w.userId}`}>
                      {formatINR(w.pending)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-600" data-testid={`wallet-paid-${w.userId}`}>
                      {formatINR(w.paidOut)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openPayoutModal(w)}
                          className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                          data-testid={`payout-btn-${w.userId}`}
                        >
                          Payout
                        </button>
                        <button
                          onClick={() => openAdjustmentModal(w)}
                          className="rounded bg-gray-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700"
                          data-testid={`adjustment-btn-${w.userId}`}
                        >
                          Adjust
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between" data-testid="wallets-pagination">
              <p className="text-sm text-gray-500">
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="flex items-center px-2 text-sm text-gray-600">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Payout Modal */}
      {modal.type === "payout" && modal.wallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="payout-modal">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4" data-testid="payout-modal-title">
              Process Payout
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              Member: <strong>{modal.wallet.user.name}</strong>
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Pending balance: <strong className="text-yellow-600">{formatINR(modal.wallet.pending)}</strong>
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              value={modalAmount}
              onChange={(e) => setModalAmount(e.target.value)}
              min="0"
              step="0.01"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none mb-3"
              data-testid="payout-amount-input"
              autoFocus
            />

            {modalError && (
              <p className="text-sm text-red-600 mb-3" data-testid="payout-error">
                {modalError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                data-testid="payout-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handlePayout}
                disabled={modalSubmitting}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                data-testid="payout-confirm"
              >
                {modalSubmitting ? "Processing..." : "Confirm Payout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {modal.type === "adjustment" && modal.wallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="adjustment-modal">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4" data-testid="adjustment-modal-title">
              Wallet Adjustment
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Member: <strong>{modal.wallet.user.name}</strong>
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="flex gap-3 mb-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="adjType"
                  value="credit"
                  checked={modalAdjType === "credit"}
                  onChange={() => setModalAdjType("credit")}
                  data-testid="adjustment-type-credit"
                />
                Credit (+)
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="adjType"
                  value="debit"
                  checked={modalAdjType === "debit"}
                  onChange={() => setModalAdjType("debit")}
                  data-testid="adjustment-type-debit"
                />
                Debit (-)
              </label>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              value={modalAmount}
              onChange={(e) => setModalAmount(e.target.value)}
              min="0"
              step="0.01"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none mb-3"
              data-testid="adjustment-amount-input"
            />

            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <input
              type="text"
              value={modalReason}
              onChange={(e) => setModalReason(e.target.value)}
              placeholder="Reason for adjustment..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none mb-3"
              data-testid="adjustment-reason-input"
            />

            {modalError && (
              <p className="text-sm text-red-600 mb-3" data-testid="adjustment-error">
                {modalError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                data-testid="adjustment-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjustment}
                disabled={modalSubmitting}
                className="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                data-testid="adjustment-confirm"
              >
                {modalSubmitting ? "Processing..." : "Confirm Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
