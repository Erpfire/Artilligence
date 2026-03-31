"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { useToast } from "@/components/Toast";
import { formatINR } from "@/lib/i18n";

interface Product {
  id: string;
  name: string;
  nameHi: string | null;
  price: string;
  sku: string | null;
  category: string | null;
}

interface LineItem {
  key: number;
  productId: string;
  quantity: number;
}

let lineKeyCounter = 0;

export default function SaleForm({
  onSubmitted,
  onCancel,
}: {
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [billCode, setBillCode] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { key: ++lineKeyCounter, productId: "", quantity: 1 },
  ]);
  const [billPhoto, setBillPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/products")
      .then((r) => r.json())
      .then((data) => setProducts(data.products || []))
      .catch(() => {});
  }, []);

  function getProductPrice(productId: string): number {
    const p = products.find((p) => p.id === productId);
    return p ? parseFloat(p.price) : 0;
  }

  function getProductName(productId: string): string {
    const p = products.find((p) => p.id === productId);
    if (!p) return "";
    return locale === "hi" && p.nameHi ? p.nameHi : p.name;
  }

  function calculateTotal(): number {
    return items.reduce((sum, item) => {
      return sum + getProductPrice(item.productId) * item.quantity;
    }, 0);
  }

  function addItem() {
    setItems([...items, { key: ++lineKeyCounter, productId: "", quantity: 1 }]);
  }

  function removeItem(key: number) {
    if (items.length <= 1) return;
    setItems(items.filter((i) => i.key !== key));
  }

  function updateItem(key: number, field: "productId" | "quantity", value: string | number) {
    setItems(
      items.map((i) =>
        i.key === key ? { ...i, [field]: value } : i
      )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSuccessMessage("");
    setSubmitting(true);

    // Client-side validation
    const clientErrors: Record<string, string> = {};
    if (!billCode.trim()) clientErrors.billCode = t("sales.error.billCodeRequired");
    if (!saleDate) clientErrors.saleDate = t("sales.error.saleDateRequired");
    if (saleDate) {
      const d = new Date(saleDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (d > today) clientErrors.saleDate = t("sales.error.futureDateNotAllowed");
    }
    const validItems = items.filter((i) => i.productId);
    if (validItems.length === 0) clientErrors.items = t("sales.error.productsRequired");
    if (!customerName.trim()) clientErrors.customerName = t("sales.error.customerNameRequired");
    if (!customerPhone.trim()) clientErrors.customerPhone = t("sales.error.customerPhoneRequired");
    if (!billPhoto) clientErrors.billPhoto = t("sales.error.photoRequired");

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append("billCode", billCode.trim());
    formData.append("saleDate", saleDate);
    formData.append("customerName", customerName.trim());
    formData.append("customerPhone", customerPhone.trim());
    formData.append(
      "items",
      JSON.stringify(validItems.map((i) => ({ productId: i.productId, quantity: i.quantity })))
    );
    formData.append("billPhoto", billPhoto!);

    const res = await fetch("/api/dashboard/sales", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.errors) {
        setErrors(data.errors);
      } else {
        setErrors({ _form: t("error.generic") });
      }
      setSubmitting(false);
      return;
    }

    setSuccessMessage(t("sales.submitted"));
    showToast(t("sales.submitted"), "success");
    setTimeout(() => onSubmitted(), 1000);
  }

  const total = calculateTotal();

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm" data-testid="sale-form">
      <h2 className="mb-6 text-xl font-bold text-gray-900" data-testid="sale-form-title">
        {t("sales.newSale")}
      </h2>

      {successMessage && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700" data-testid="sale-success">
          {successMessage}
        </div>
      )}

      {errors._form && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" data-testid="sale-form-error">
          {errors._form}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Bill Code */}
        <div>
          <label htmlFor="billCode" className="block text-sm font-medium text-gray-700" data-testid="label-billCode">
            {t("sales.billCode")}
          </label>
          <input
            id="billCode"
            name="billCode"
            type="text"
            value={billCode}
            onChange={(e) => setBillCode(e.target.value)}
            placeholder={t("sales.billCodePlaceholder")}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="input-billCode"
          />
          {errors.billCode && (
            <p className="mt-1 text-sm text-red-600" data-testid="error-billCode">{errors.billCode}</p>
          )}
        </div>

        {/* Sale Date */}
        <div>
          <label htmlFor="saleDate" className="block text-sm font-medium text-gray-700" data-testid="label-saleDate">
            {t("sales.saleDate")}
          </label>
          <input
            id="saleDate"
            name="saleDate"
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="input-saleDate"
          />
          {errors.saleDate && (
            <p className="mt-1 text-sm text-red-600" data-testid="error-saleDate">{errors.saleDate}</p>
          )}
        </div>

        {/* Products */}
        <div>
          <label className="block text-sm font-medium text-gray-700" data-testid="label-products">
            {t("sales.products")}
          </label>
          <div className="mt-2 space-y-3" data-testid="product-lines">
            {items.map((item, idx) => (
              <div key={item.key} className="flex gap-2 items-end" data-testid={`product-line-${idx}`}>
                <div className="flex-1">
                  <select
                    value={item.productId}
                    onChange={(e) => updateItem(item.key, "productId", e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid={`product-select-${idx}`}
                  >
                    <option value="">{t("sales.selectProduct")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {locale === "hi" && p.nameHi ? p.nameHi : p.name} — {formatINR(p.price)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-20">
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                    className="block w-full rounded-md border border-gray-300 px-2 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid={`product-qty-${idx}`}
                  />
                </div>
                <div className="w-28 text-right text-sm font-medium text-gray-700 py-2" data-testid={`product-subtotal-${idx}`}>
                  {item.productId ? formatINR(getProductPrice(item.productId) * item.quantity) : "—"}
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    className="text-red-500 hover:text-red-700 text-sm px-2 py-2"
                    data-testid={`product-remove-${idx}`}
                  >
                    {t("sales.removeProduct")}
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-2 text-sm font-medium text-primary hover:text-primary/80"
            data-testid="add-product-button"
          >
            {t("sales.addProduct")}
          </button>
          {errors.items && (
            <p className="mt-1 text-sm text-red-600" data-testid="error-items">{errors.items}</p>
          )}
        </div>

        {/* Customer Name */}
        <div>
          <label htmlFor="customerName" className="block text-sm font-medium text-gray-700" data-testid="label-customerName">
            {t("sales.customerName")}
          </label>
          <input
            id="customerName"
            name="customerName"
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="input-customerName"
          />
          {errors.customerName && (
            <p className="mt-1 text-sm text-red-600" data-testid="error-customerName">{errors.customerName}</p>
          )}
        </div>

        {/* Customer Phone */}
        <div>
          <label htmlFor="customerPhone" className="block text-sm font-medium text-gray-700" data-testid="label-customerPhone">
            {t("sales.customerPhone")}
          </label>
          <input
            id="customerPhone"
            name="customerPhone"
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="input-customerPhone"
          />
          {errors.customerPhone && (
            <p className="mt-1 text-sm text-red-600" data-testid="error-customerPhone">{errors.customerPhone}</p>
          )}
        </div>

        {/* Bill Photo */}
        <div>
          <label htmlFor="billPhoto" className="block text-sm font-medium text-gray-700" data-testid="label-billPhoto">
            {t("sales.billPhoto")}
          </label>
          <input
            id="billPhoto"
            name="billPhoto"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={(e) => setBillPhoto(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
            data-testid="input-billPhoto"
          />
          <p className="mt-1 text-xs text-gray-400">{t("sales.billPhotoHint")}</p>
          {errors.billPhoto && (
            <p className="mt-1 text-sm text-red-600" data-testid="error-billPhoto">{errors.billPhoto}</p>
          )}
        </div>

        {/* Total */}
        <div className="rounded-md bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700" data-testid="label-total">{t("sales.total")}</span>
            <span className="text-xl font-bold text-gray-900" data-testid="sale-total">
              {formatINR(total)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            data-testid="submit-sale-form"
          >
            {submitting ? t("sales.submitting") : t("sales.submit")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            data-testid="cancel-sale-form"
          >
            {t("sales.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
