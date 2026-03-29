"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type SaleStatus = "PENDING" | "APPROVED" | "REJECTED" | "RETURNED";

interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  productNameHi: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

interface SaleFlag {
  id: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  details: string | null;
}

interface Commission {
  id: string;
  level: number;
  percentage: string;
  amount: string;
  type: string;
  beneficiary: { id: string; name: string };
}

interface Sale {
  id: string;
  billCode: string;
  totalAmount: string;
  customerName: string;
  customerPhone: string | null;
  saleDate: string;
  billPhotoPath: string | null;
  status: SaleStatus;
  rejectionReason: string | null;
  returnReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  member: { id: string; name: string; email: string; referralCode: string };
  approvedBy: { id: string; name: string } | null;
  items: SaleItem[];
  flags: SaleFlag[];
  commissions?: Commission[];
}

const TABS = ["PENDING", "APPROVED", "REJECTED", "RETURNED", "all"] as const;

const STATUS_COLORS: Record<SaleStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  RETURNED: "bg-gray-100 text-gray-800",
};

const FLAG_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 border-red-200",
  MEDIUM: "bg-orange-100 text-orange-800 border-orange-200",
  LOW: "bg-blue-100 text-blue-800 border-blue-200",
};

function formatINR(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(num);
}

export default function AdminSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("PENDING");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingSaleId, setRejectingSaleId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [photoZoomed, setPhotoZoomed] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returningSaleId, setReturningSaleId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnPreview, setReturnPreview] = useState<
    { beneficiaryId: string; beneficiaryName: string; level: number; amount: string }[]
  >([]);
  const [returnPreviewLoading, setReturnPreviewLoading] = useState(false);
  const salesFetchControllerRef = useRef<AbortController | null>(null);
  const salesFetchRequestIdRef = useRef(0);

  const fetchSales = useCallback(async () => {
    salesFetchControllerRef.current?.abort();
    const controller = new AbortController();
    salesFetchControllerRef.current = controller;
    const requestId = ++salesFetchRequestIdRef.current;
    setLoading(true);
    try {
      const statusParam = activeTab === "all" ? "" : `&status=${activeTab}`;
      const res = await fetch(
        `/api/admin/sales?page=${page}&limit=20${statusParam}&_t=${requestId}`,
        {
          cache: "no-store",
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to load sales: ${res.status}`);
      }

      const data = await res.json();
      if (controller.signal.aborted || requestId !== salesFetchRequestIdRef.current) {
        return;
      }

      setSales(data.sales);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (requestId === salesFetchRequestIdRef.current) {
        setSales([]);
        setTotalPages(1);
        setTotal(0);
      }
    } finally {
      if (
        !controller.signal.aborted &&
        requestId === salesFetchRequestIdRef.current
      ) {
        setLoading(false);
      }
      if (salesFetchControllerRef.current === controller) {
        salesFetchControllerRef.current = null;
      }
    }
  }, [activeTab, page]);

  useEffect(() => {
    void fetchSales();
    return () => {
      salesFetchControllerRef.current?.abort();
      salesFetchControllerRef.current = null;
    };
  }, [fetchSales]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [activeTab]);

  async function fetchSaleDetail(saleId: string) {
    const res = await fetch(`/api/admin/sales/${saleId}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedSale(data.sale);
    }
  }

  async function handleApprove(saleId: string) {
    setActionLoading(true);
    const res = await fetch(`/api/admin/sales/${saleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    if (res.ok) {
      await fetchSales();
      if (selectedSale?.id === saleId) {
        await fetchSaleDetail(saleId);
      }
    }
    setActionLoading(false);
  }

  async function handleReject(saleId: string) {
    if (!rejectionReason.trim()) return;
    setActionLoading(true);
    const res = await fetch(`/api/admin/sales/${saleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", reason: rejectionReason.trim() }),
    });
    if (res.ok) {
      setShowRejectModal(false);
      setRejectingSaleId(null);
      setRejectionReason("");
      await fetchSales();
      if (selectedSale?.id === saleId) {
        await fetchSaleDetail(saleId);
      }
    }
    setActionLoading(false);
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    const res = await fetch("/api/admin/sales/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saleIds: Array.from(selectedIds) }),
    });
    if (res.ok) {
      setSelectedIds(new Set());
      await fetchSales();
    }
    setActionLoading(false);
  }

  async function handleDismissFlag(saleId: string, flagId: string) {
    const res = await fetch(`/api/admin/sales/${saleId}/dismiss-flag`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagId }),
    });
    if (res.ok) {
      // Update local state
      setSales((prev) =>
        prev.map((s) =>
          s.id === saleId
            ? { ...s, flags: s.flags.filter((f) => f.id !== flagId) }
            : s
        )
      );
      if (selectedSale?.id === saleId) {
        setSelectedSale((prev) =>
          prev
            ? { ...prev, flags: prev.flags.filter((f) => f.id !== flagId) }
            : null
        );
      }
    }
  }

  async function openReturnModal(saleId: string) {
    setReturningSaleId(saleId);
    setReturnReason("");
    setReturnPreview([]);
    setShowReturnModal(true);
    setReturnPreviewLoading(true);
    const res = await fetch(`/api/admin/sales/${saleId}/preview-return`);
    if (res.ok) {
      const data = await res.json();
      setReturnPreview(data.preview);
    }
    setReturnPreviewLoading(false);
  }

  async function handleReturn(saleId: string) {
    if (!returnReason.trim()) return;
    setActionLoading(true);
    const res = await fetch(`/api/admin/sales/${saleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "return", reason: returnReason.trim() }),
    });
    if (res.ok) {
      setShowReturnModal(false);
      setReturningSaleId(null);
      setReturnReason("");
      setReturnPreview([]);
      await fetchSales();
      if (selectedSale?.id === saleId) {
        await fetchSaleDetail(saleId);
      }
    }
    setActionLoading(false);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pendingSales = sales.filter((s) => s.status === "PENDING");
    if (selectedIds.size === pendingSales.length && pendingSales.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingSales.map((s) => s.id)));
    }
  }

  const pendingSalesCount = sales.filter((s) => s.status === "PENDING").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" data-testid="sales-title">
          Sales Management
        </h1>
        {activeTab === "PENDING" && pendingSalesCount > 0 && (
          <button
            onClick={handleBulkApprove}
            disabled={selectedIds.size === 0 || actionLoading}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="bulk-approve-button"
          >
            Approve Selected ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" data-testid="sales-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            data-testid={`tab-${tab.toLowerCase()}`}
          >
            {tab === "all" ? "All" : tab.charAt(0) + tab.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500" data-testid="sales-loading">
          Loading sales...
        </div>
      ) : sales.length === 0 ? (
        <div className="text-center py-12 text-gray-500" data-testid="sales-empty">
          No sales found
        </div>
      ) : (
        <>
          {/* Sales Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm" data-testid="sales-table">
              <thead className="bg-gray-50 text-left">
                <tr>
                  {activeTab === "PENDING" && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === pendingSalesCount && pendingSalesCount > 0}
                        onChange={toggleSelectAll}
                        data-testid="select-all-checkbox"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3">Bill Code</th>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Flags</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sales.map((sale) => (
                  <tr
                    key={sale.id}
                    className={`hover:bg-gray-50 ${selectedIds.has(sale.id) ? "bg-blue-50" : ""}`}
                    data-testid={`sale-row-${sale.id}`}
                  >
                    {activeTab === "PENDING" && (
                      <td className="px-4 py-3">
                        {sale.status === "PENDING" && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(sale.id)}
                            onChange={() => toggleSelect(sale.id)}
                            data-testid={`select-sale-${sale.id}`}
                          />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium" data-testid={`sale-billcode-${sale.id}`}>
                      {sale.billCode}
                    </td>
                    <td className="px-4 py-3" data-testid={`sale-member-${sale.id}`}>
                      <div>{sale.member.name}</div>
                      <div className="text-xs text-gray-400">{sale.member.email}</div>
                    </td>
                    <td className="px-4 py-3">{sale.customerName}</td>
                    <td className="px-4 py-3 font-medium" data-testid={`sale-amount-${sale.id}`}>
                      {formatINR(sale.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(sale.saleDate).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[sale.status]}`}
                        data-testid={`sale-status-${sale.id}`}
                      >
                        {sale.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {sale.flags.length > 0 && (
                        <div className="flex flex-wrap gap-1" data-testid={`sale-flags-${sale.id}`}>
                          {sale.flags.map((flag) => (
                            <span
                              key={flag.id}
                              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${FLAG_COLORS[flag.severity]}`}
                              title={flag.details || flag.type}
                              data-testid={`flag-${flag.type}`}
                            >
                              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              {flag.type.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => fetchSaleDetail(sale.id)}
                          className="text-primary hover:underline text-xs"
                          data-testid={`view-sale-${sale.id}`}
                        >
                          View
                        </button>
                        {sale.status === "PENDING" && (
                          <>
                            <button
                              onClick={() => handleApprove(sale.id)}
                              disabled={actionLoading}
                              className="text-green-600 hover:underline text-xs"
                              data-testid={`approve-sale-${sale.id}`}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setRejectingSaleId(sale.id);
                                setShowRejectModal(true);
                              }}
                              className="text-red-600 hover:underline text-xs"
                              data-testid={`reject-sale-${sale.id}`}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {sale.status === "APPROVED" && (
                          <button
                            onClick={() => openReturnModal(sale.id)}
                            className="text-orange-600 hover:underline text-xs"
                            data-testid={`return-sale-${sale.id}`}
                          >
                            Return
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4" data-testid="sales-pagination">
              <span className="text-sm text-gray-500">
                Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { setSelectedSale(null); setPhotoZoomed(false); }}
          data-testid="sale-detail-modal"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-bold" data-testid="sale-detail-title">
                Sale: {selectedSale.billCode}
              </h2>
              <button
                onClick={() => { setSelectedSale(null); setPhotoZoomed(false); }}
                className="text-gray-400 hover:text-gray-600"
                data-testid="close-detail"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status + Actions */}
              <div className="flex items-center gap-4">
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[selectedSale.status]}`}
                  data-testid="detail-status"
                >
                  {selectedSale.status}
                </span>
                {selectedSale.status === "PENDING" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(selectedSale.id)}
                      disabled={actionLoading}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                      data-testid="detail-approve-button"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setRejectingSaleId(selectedSale.id);
                        setShowRejectModal(true);
                      }}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                      data-testid="detail-reject-button"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {selectedSale.status === "APPROVED" && (
                  <button
                    onClick={() => openReturnModal(selectedSale.id)}
                    className="rounded-md bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-700"
                    data-testid="detail-return-button"
                  >
                    Return Sale
                  </button>
                )}
              </div>

              {/* Rejection reason */}
              {selectedSale.rejectionReason && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" data-testid="detail-rejection-reason">
                  <strong>Rejection reason:</strong> {selectedSale.rejectionReason}
                </div>
              )}

              {/* Return reason */}
              {selectedSale.returnReason && (
                <div className="rounded-md bg-orange-50 p-3 text-sm text-orange-700" data-testid="detail-return-reason">
                  <strong>Return reason:</strong> {selectedSale.returnReason}
                </div>
              )}

              {/* Flags */}
              {selectedSale.flags.length > 0 && (
                <div data-testid="detail-flags">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Suspicious Activity Flags</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedSale.flags.map((flag) => (
                      <span
                        key={flag.id}
                        className={`inline-flex items-center gap-2 rounded border px-2.5 py-1 text-xs font-medium ${FLAG_COLORS[flag.severity]}`}
                        data-testid={`detail-flag-${flag.type}`}
                      >
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {flag.type.replace(/_/g, " ")}
                        {flag.details && <span className="text-xs opacity-75">— {flag.details}</span>}
                        <button
                          onClick={() => handleDismissFlag(selectedSale.id, flag.id)}
                          className="ml-1 rounded-full hover:bg-black/10 p-0.5"
                          title="Dismiss flag"
                          data-testid={`dismiss-flag-${flag.id}`}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sale Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Member</span>
                  <p className="font-medium" data-testid="detail-member">{selectedSale.member.name}</p>
                  <p className="text-xs text-gray-400">{selectedSale.member.email}</p>
                </div>
                <div>
                  <span className="text-gray-500">Customer</span>
                  <p className="font-medium" data-testid="detail-customer">{selectedSale.customerName}</p>
                  {selectedSale.customerPhone && (
                    <p className="text-xs text-gray-400">{selectedSale.customerPhone}</p>
                  )}
                </div>
                <div>
                  <span className="text-gray-500">Total Amount</span>
                  <p className="font-bold text-lg" data-testid="detail-amount">{formatINR(selectedSale.totalAmount)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Sale Date</span>
                  <p className="font-medium">{new Date(selectedSale.saleDate).toLocaleDateString("en-IN")}</p>
                </div>
                {selectedSale.approvedBy && (
                  <div>
                    <span className="text-gray-500">Approved By</span>
                    <p className="font-medium">{selectedSale.approvedBy.name}</p>
                    <p className="text-xs text-gray-400">
                      {selectedSale.approvedAt && new Date(selectedSale.approvedAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Products</h3>
                <table className="w-full text-sm" data-testid="detail-items">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedSale.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">{item.productName}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatINR(item.unitPrice)}</td>
                        <td className="px-3 py-2 text-right">{formatINR(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bill Photo */}
              {selectedSale.billPhotoPath && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Bill Photo</h3>
                  <img
                    src={`/api/uploads/${selectedSale.billPhotoPath}`}
                    alt="Bill photo"
                    className={`rounded-lg border cursor-pointer transition-all ${
                      photoZoomed ? "max-w-full" : "max-w-xs"
                    }`}
                    onClick={() => setPhotoZoomed(!photoZoomed)}
                    data-testid="detail-photo"
                  />
                  <p className="text-xs text-gray-400 mt-1">Click to {photoZoomed ? "shrink" : "zoom"}</p>
                </div>
              )}

              {/* Commissions */}
              {selectedSale.commissions && selectedSale.commissions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Commissions Generated</h3>
                  <table className="w-full text-sm" data-testid="detail-commissions">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Level</th>
                        <th className="px-3 py-2 text-left">Beneficiary</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedSale.commissions.map((c) => (
                        <tr key={c.id} data-testid={`commission-row-${c.type === "REVERSAL" ? "reversal-" : ""}${c.level}`}>
                          <td className="px-3 py-2">L{c.level}</td>
                          <td className="px-3 py-2">{c.beneficiary.name}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              c.type === "REVERSAL"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-green-100 text-green-800"
                            }`} data-testid={`commission-type-${c.id}`}>
                              {c.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">{c.percentage}%</td>
                          <td className="px-3 py-2 text-right font-medium">{formatINR(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && rejectingSaleId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { setShowRejectModal(false); setRejectingSaleId(null); setRejectionReason(""); }}
          data-testid="reject-modal"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">Reject Sale</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for rejecting this sale. This will be visible to the member.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
              rows={3}
              placeholder="Enter rejection reason..."
              data-testid="rejection-reason-input"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowRejectModal(false); setRejectingSaleId(null); setRejectionReason(""); }}
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
                data-testid="cancel-reject"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(rejectingSaleId)}
                disabled={!rejectionReason.trim() || actionLoading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                data-testid="confirm-reject"
              >
                Reject Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Confirmation Modal */}
      {showReturnModal && returningSaleId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { setShowReturnModal(false); setReturningSaleId(null); setReturnReason(""); setReturnPreview([]); }}
          data-testid="return-modal"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4" data-testid="return-modal-title">Return Sale</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will mark the sale as returned and reverse all commissions. This action cannot be undone.
            </p>

            {/* Affected members preview */}
            {returnPreviewLoading ? (
              <div className="text-sm text-gray-500 mb-4" data-testid="return-preview-loading">
                Loading affected members...
              </div>
            ) : returnPreview.length > 0 ? (
              <div className="mb-4" data-testid="return-preview">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                  Commissions to be reversed ({returnPreview.length} members affected):
                </h4>
                <div className="bg-orange-50 rounded-md border border-orange-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-orange-100">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-orange-800">Level</th>
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-orange-800">Member</th>
                        <th className="px-3 py-1.5 text-right text-xs font-medium text-orange-800">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-200">
                      {returnPreview.map((r) => (
                        <tr key={`${r.beneficiaryId}-${r.level}`} data-testid={`preview-row-${r.level}`}>
                          <td className="px-3 py-1.5 text-orange-700">L{r.level}</td>
                          <td className="px-3 py-1.5 text-orange-700">{r.beneficiaryName}</td>
                          <td className="px-3 py-1.5 text-right font-medium text-orange-700">
                            -{formatINR(r.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 mb-4" data-testid="return-no-commissions">
                No commissions to reverse.
              </div>
            )}

            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
              rows={3}
              placeholder="Enter return reason..."
              data-testid="return-reason-input"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowReturnModal(false); setReturningSaleId(null); setReturnReason(""); setReturnPreview([]); }}
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
                data-testid="cancel-return"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReturn(returningSaleId)}
                disabled={!returnReason.trim() || actionLoading}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm text-white hover:bg-orange-700 disabled:opacity-50"
                data-testid="confirm-return"
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
