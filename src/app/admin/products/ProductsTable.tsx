"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Product {
  id: string;
  name: string;
  nameHi: string | null;
  sku: string | null;
  category: string | null;
  price: string;
  imageUrl: string | null;
  images: string[] | null;
  warranty: string | null;
  ah: string | null;
  description: string | null;
  isActive: boolean;
}

export default function ProductsTable({
  products,
  total,
  page,
  totalPages,
  search,
  category,
  categories,
}: {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  category: string;
  categories: string[];
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(search);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function applyFilters(newSearch?: string, newCategory?: string) {
    const params = new URLSearchParams();
    const s = newSearch !== undefined ? newSearch : searchInput;
    const c = newCategory !== undefined ? newCategory : category;
    if (s) params.set("search", s);
    if (c) params.set("category", c);
    router.push(`/admin/products?${params.toString()}`);
  }

  function goToPage(p: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (p > 1) params.set("page", String(p));
    router.push(`/admin/products?${params.toString()}`);
  }

  async function toggleActive(product: Product) {
    setTogglingId(product.id);
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="mt-6">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
          }}
          className="flex gap-2 flex-1"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search products..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            data-testid="search-input"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            data-testid="search-button"
          >
            Search
          </button>
        </form>
        <select
          value={category}
          onChange={(e) => applyFilters(undefined, e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          data-testid="category-filter"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200" data-testid="products-table">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500" data-testid="no-products">
                  No products found
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const imgs: string[] = Array.isArray(product.images) ? product.images : [];
                return (
                <tr key={product.id} data-testid={`product-row-${product.id}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      {/* Bento grid: wide image top, two squares bottom */}
                      {imgs.length >= 3 ? (
                        <div className="w-24 shrink-0 space-y-0.5">
                          <img
                            src={imgs[0]}
                            alt={product.name}
                            className="w-24 h-16 object-cover rounded-t border border-b-0 bg-gray-50"
                          />
                          <div className="flex gap-0.5">
                            <img
                              src={imgs[1]}
                              alt={product.name}
                              className="w-[47.5%] h-12 object-cover rounded-bl border bg-gray-50"
                            />
                            <img
                              src={imgs[2]}
                              alt={product.name}
                              className="w-[47.5%] h-12 object-cover rounded-br border bg-gray-50"
                            />
                          </div>
                        </div>
                      ) : product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-10 h-10 object-contain rounded border bg-gray-50 p-0.5 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded border bg-gray-50 flex items-center justify-center shrink-0">
                          <span className="text-gray-300 text-xs">N/A</span>
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">{product.name}</div>
                        {product.sku && (
                          <div className="text-xs text-gray-400">{product.sku}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {product.category || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-700">
                    {Number(product.price).toLocaleString("en-IN", {
                      style: "currency",
                      currency: "INR",
                    })}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        product.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                      data-testid={`product-status-${product.id}`}
                    >
                      {product.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/admin/products/${product.id}/edit`}
                        className="text-primary hover:underline"
                        data-testid={`edit-product-${product.id}`}
                      >
                        Edit
                      </a>
                      <button
                        onClick={() => toggleActive(product)}
                        disabled={togglingId === product.id}
                        className={`text-sm font-medium ${
                          product.isActive
                            ? "text-red-600 hover:text-red-800"
                            : "text-green-600 hover:text-green-800"
                        } disabled:opacity-50`}
                        data-testid={`toggle-product-${product.id}`}
                      >
                        {product.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between" data-testid="pagination">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, total)} of{" "}
            {total} products
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              data-testid="prev-page"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => goToPage(p)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  p === page ? "bg-primary text-white border-primary" : "hover:bg-gray-50"
                }`}
                data-testid={`page-${p}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              data-testid="next-page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
