"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { formatINR } from "@/lib/i18n";
import SaleForm from "./SaleForm";

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
  items: SaleItem[];
}

const TABS = ["all", "PENDING", "APPROVED", "REJECTED", "RETURNED"] as const;

const STATUS_COLORS: Record<SaleStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  RETURNED: "bg-gray-100 text-gray-800",
};

export default function SalesPage() {
  const { t, locale } = useLanguage();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    const params = activeTab !== "all" ? `?status=${activeTab}` : "";
    const res = await fetch(`/api/dashboard/sales${params}`);
    if (res.ok) {
      const data = await res.json();
      setSales(data.sales);
    }
    setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  function handleSaleSubmitted() {
    setShowForm(false);
    fetchSales();
  }

  const tabKeys: Record<(typeof TABS)[number], string> = {
    all: "sales.tab.all",
    PENDING: "sales.tab.pending",
    APPROVED: "sales.tab.approved",
    REJECTED: "sales.tab.rejected",
    RETURNED: "sales.tab.returned",
  };

  return (
    <div data-testid="sales-page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900" data-testid="sales-title">
          {t("sales.title")}
        </h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            data-testid="submit-sale-button"
          >
            {t("sales.submitSale")}
          </button>
        )}
      </div>

      {showForm ? (
        <SaleForm
          onSubmitted={handleSaleSubmitted}
          onCancel={() => setShowForm(false)}
        />
      ) : selectedSale ? (
        <SaleDetail
          sale={selectedSale}
          locale={locale}
          t={t}
          onBack={() => setSelectedSale(null)}
        />
      ) : (
        <>
          {/* Tabs */}
          <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1" data-testid="sales-tabs">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                data-testid={`tab-${tab}`}
              >
                {t(tabKeys[tab] as any)}
              </button>
            ))}
          </div>

          {/* Sales list */}
          {loading ? (
            <p className="text-center text-gray-500 py-8" data-testid="sales-loading">
              {t("common.loading")}
            </p>
          ) : sales.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center" data-testid="sales-empty">
              <p className="text-gray-500">
                {activeTab === "all" ? t("sales.empty") : t("sales.emptyTab")}
              </p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="sales-list">
              {sales.map((sale) => (
                <button
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className="w-full rounded-lg border bg-white p-4 text-left shadow-sm hover:shadow-md transition-shadow"
                  data-testid={`sale-card-${sale.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900" data-testid="sale-bill-code">
                        {sale.billCode}
                      </p>
                      <p className="text-sm text-gray-500">{sale.customerName}</p>
                      <p className="text-sm text-gray-400">
                        {new Date(sale.saleDate).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {formatINR(sale.totalAmount)}
                      </p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[sale.status]}`}
                        data-testid="sale-status-badge"
                      >
                        {t(`sales.status.${sale.status}` as any)}
                      </span>
                    </div>
                  </div>
                  {sale.status === "REJECTED" && sale.rejectionReason && (
                    <p className="mt-2 text-sm text-red-600" data-testid="sale-rejection-reason">
                      {t("sales.rejectionReason")}: {sale.rejectionReason}
                    </p>
                  )}
                  {sale.status === "RETURNED" && sale.returnReason && (
                    <p className="mt-2 text-sm text-gray-600" data-testid="sale-return-reason">
                      {t("sales.returnReason")}: {sale.returnReason}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SaleDetail({
  sale,
  locale,
  t,
  onBack,
}: {
  sale: Sale;
  locale: string;
  t: (key: any) => string;
  onBack: () => void;
}) {
  return (
    <div data-testid="sale-detail">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-primary hover:underline"
        data-testid="sale-detail-back"
      >
        &larr; {t("sales.title")}
      </button>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900" data-testid="sale-detail-title">
            {t("sales.detail.title")}
          </h2>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[sale.status]}`}
            data-testid="sale-detail-status"
          >
            {t(`sales.status.${sale.status}` as any)}
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-gray-500">{t("sales.billCode")}</dt>
            <dd className="font-medium" data-testid="sale-detail-billcode">{sale.billCode}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">{t("sales.saleDate")}</dt>
            <dd className="font-medium">{new Date(sale.saleDate).toLocaleDateString("en-IN")}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">{t("sales.customerName")}</dt>
            <dd className="font-medium">{sale.customerName}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">{t("sales.customerPhone")}</dt>
            <dd className="font-medium">{sale.customerPhone || "-"}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">{t("sales.total")}</dt>
            <dd className="text-lg font-bold">{formatINR(sale.totalAmount)}</dd>
          </div>
        </dl>

        {sale.status === "REJECTED" && sale.rejectionReason && (
          <div className="mt-4 rounded-md bg-red-50 p-3" data-testid="sale-detail-rejection">
            <p className="text-sm font-medium text-red-800">{t("sales.rejectionReason")}</p>
            <p className="text-sm text-red-700">{sale.rejectionReason}</p>
          </div>
        )}

        {sale.status === "RETURNED" && sale.returnReason && (
          <div className="mt-4 rounded-md bg-gray-50 p-3" data-testid="sale-detail-return">
            <p className="text-sm font-medium text-gray-800">{t("sales.returnReason")}</p>
            <p className="text-sm text-gray-700">{sale.returnReason}</p>
          </div>
        )}

        {/* Items */}
        <div className="mt-6">
          <h3 className="mb-2 font-semibold text-gray-900" data-testid="sale-detail-items-title">
            {t("sales.detail.items")}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="sale-detail-items-table">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">{t("sales.products")}</th>
                  <th className="pb-2">{t("sales.quantity")}</th>
                  <th className="pb-2">{t("sales.price")}</th>
                  <th className="pb-2">{t("sales.subtotal")}</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2">
                      {locale === "hi" && item.productNameHi ? item.productNameHi : item.productName}
                    </td>
                    <td className="py-2">{item.quantity}</td>
                    <td className="py-2">{formatINR(item.unitPrice)}</td>
                    <td className="py-2">{formatINR(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bill photo */}
        {sale.billPhotoPath && (
          <div className="mt-6">
            <h3 className="mb-2 font-semibold text-gray-900">
              {t("sales.detail.photo")}
            </h3>
            {sale.billPhotoPath.endsWith(".pdf") ? (
              <a
                href={`/api${sale.billPhotoPath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
                data-testid="sale-detail-photo"
              >
                View PDF
              </a>
            ) : (
              <img
                src={`/api${sale.billPhotoPath}`}
                alt="Bill photo"
                className="max-w-xs rounded-lg border shadow-sm"
                data-testid="sale-detail-photo"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
