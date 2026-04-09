"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CATEGORIES = ["COMBO"];

interface ProductData {
  id?: string;
  name: string;
  nameHi: string;
  description: string;
  descriptionHi: string;
  price: string;
  sku: string;
  category: string;
  imageUrl: string;
  images: string[];
  warranty: string;
  ah: string;
  remark: string;
  isActive: boolean;
}

export default function ProductForm({
  initialData,
  mode,
}: {
  initialData?: ProductData;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProductData>(
    initialData || {
      name: "",
      nameHi: "",
      description: "",
      descriptionHi: "",
      price: "",
      sku: "",
      category: "",
      imageUrl: "",
      images: [],
      warranty: "",
      ah: "",
      remark: "",
      isActive: true,
    }
  );
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Product name is required";
    if (!form.category) errors.category = "Category is required";
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) < 0) {
      errors.price = "Valid price is required";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!validate()) return;

    setSaving(true);
    try {
      const url =
        mode === "create"
          ? "/api/admin/products"
          : `/api/admin/products/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          nameHi: form.nameHi || null,
          description: form.description || null,
          descriptionHi: form.descriptionHi || null,
          price: Number(form.price),
          sku: form.sku || null,
          category: form.category,
          imageUrl: form.imageUrl || null,
          images: form.images.length > 0 ? form.images : null,
          warranty: form.warranty || null,
          ah: form.ah || null,
          remark: form.remark || null,
          isActive: form.isActive,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        return;
      }

      router.push("/admin/products");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof ProductData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl" data-testid="product-form">
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-error" data-testid="form-error">
          {error}
        </div>
      )}

      <div className="space-y-6 rounded-lg border bg-white p-6 shadow-sm">
        {/* Name (English) */}
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
            Product Name (English) <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none ${
              fieldErrors.name ? "border-red-500" : "border-gray-300"
            }`}
            data-testid="input-name"
          />
          {fieldErrors.name && (
            <p className="mt-1 text-xs text-error" data-testid="error-name">
              {fieldErrors.name}
            </p>
          )}
        </div>

        {/* Name (Hindi) */}
        <div>
          <label htmlFor="nameHi" className="mb-1 block text-sm font-medium text-gray-700">
            Product Name (Hindi)
          </label>
          <input
            id="nameHi"
            name="nameHi"
            type="text"
            value={form.nameHi}
            onChange={(e) => updateField("nameHi", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            data-testid="input-nameHi"
          />
        </div>

        {/* Description (English) */}
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">
            Description (English)
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            data-testid="input-description"
          />
        </div>

        {/* Description (Hindi) */}
        <div>
          <label htmlFor="descriptionHi" className="mb-1 block text-sm font-medium text-gray-700">
            Description (Hindi)
          </label>
          <textarea
            id="descriptionHi"
            name="descriptionHi"
            rows={3}
            value={form.descriptionHi}
            onChange={(e) => updateField("descriptionHi", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            data-testid="input-descriptionHi"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Category */}
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-gray-700">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              id="category"
              name="category"
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none ${
                fieldErrors.category ? "border-red-500" : "border-gray-300"
              }`}
              data-testid="input-category"
            >
              <option value="">Select category</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {fieldErrors.category && (
              <p className="mt-1 text-xs text-error" data-testid="error-category">
                {fieldErrors.category}
              </p>
            )}
          </div>

          {/* Price */}
          <div>
            <label htmlFor="price" className="mb-1 block text-sm font-medium text-gray-700">
              Price (INR) <span className="text-red-500">*</span>
            </label>
            <input
              id="price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => updateField("price", e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none ${
                fieldErrors.price ? "border-red-500" : "border-gray-300"
              }`}
              data-testid="input-price"
            />
            {fieldErrors.price && (
              <p className="mt-1 text-xs text-error" data-testid="error-price">
                {fieldErrors.price}
              </p>
            )}
          </div>
        </div>

        {/* SKU */}
        <div>
          <label htmlFor="sku" className="mb-1 block text-sm font-medium text-gray-700">
            SKU
          </label>
          <input
            id="sku"
            name="sku"
            type="text"
            value={form.sku}
            onChange={(e) => updateField("sku", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            data-testid="input-sku"
          />
        </div>

        {/* Combo Images */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Combo Images
          </label>
          <p className="text-xs text-gray-400 mb-2">
            3 images: first is wide (3:2), second and third are square (1:1)
          </p>
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="mb-2">
              <input
                type="text"
                value={form.images[idx] || ""}
                onChange={(e) => {
                  const updated = [...form.images];
                  updated[idx] = e.target.value;
                  setForm((prev) => ({ ...prev, images: updated }));
                }}
                placeholder={idx === 0 ? "Wide image (3:2)" : `Square image ${idx} (1:1)`}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                data-testid={`input-image-${idx}`}
              />
            </div>
          ))}
          {/* Bento preview */}
          {form.images.filter(Boolean).length > 0 && (
            <div className="mt-3 w-64 space-y-1">
              {form.images[0] && (
                <img src={form.images[0]} alt="Wide" className="w-full h-40 object-cover rounded-t border bg-gray-50" />
              )}
              <div className="flex gap-1">
                {form.images[1] && (
                  <img src={form.images[1]} alt="Square 1" className="w-1/2 h-28 object-cover rounded-bl border bg-gray-50" />
                )}
                {form.images[2] && (
                  <img src={form.images[2]} alt="Square 2" className="w-1/2 h-28 object-cover rounded-br border bg-gray-50" />
                )}
              </div>
            </div>
          )}
        </div>
        {/* Legacy Image URL (hidden, auto-set from first image) */}
        <input type="hidden" value={form.images[0] || form.imageUrl} />

        <div className="grid gap-6 sm:grid-cols-3">
          {/* Warranty */}
          <div>
            <label htmlFor="warranty" className="mb-1 block text-sm font-medium text-gray-700">
              Warranty
            </label>
            <input
              id="warranty"
              name="warranty"
              type="text"
              value={form.warranty}
              onChange={(e) => updateField("warranty", e.target.value)}
              placeholder="e.g. 24F+24P"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="input-warranty"
            />
          </div>

          {/* AH */}
          <div>
            <label htmlFor="ah" className="mb-1 block text-sm font-medium text-gray-700">
              AH / VA
            </label>
            <input
              id="ah"
              name="ah"
              type="text"
              value={form.ah}
              onChange={(e) => updateField("ah", e.target.value)}
              placeholder="e.g. 65"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="input-ah"
            />
          </div>

          {/* Remark */}
          <div>
            <label htmlFor="remark" className="mb-1 block text-sm font-medium text-gray-700">
              Remark
            </label>
            <input
              id="remark"
              name="remark"
              type="text"
              value={form.remark}
              onChange={(e) => updateField("remark", e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="input-remark"
            />
          </div>
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-3">
          <input
            id="isActive"
            name="isActive"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => updateField("isActive", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            data-testid="input-isActive"
          />
          <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
            Active
          </label>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
          data-testid="submit-button"
        >
          {saving
            ? "Saving..."
            : mode === "create"
            ? "Add Product"
            : "Save Changes"}
        </button>
        <a
          href="/admin/products"
          className="rounded-md border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          data-testid="cancel-button"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
