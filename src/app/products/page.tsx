"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";

interface Product {
  id: string;
  name: string;
  price: string;
  category: string | null;
  imageUrl: string | null;
  warranty: string | null;
  ah: string | null;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.products);
        setCategories(data.categories);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = products;
    if (activeCategory) {
      result = result.filter((p) => p.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.ah?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, activeCategory, search]);

  // Group products by category for display
  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      const cat = p.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return map;
  }, [filtered]);

  return (
    <div className="bg-surface text-white min-h-screen font-body">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-surface/95 backdrop-blur-md border-b border-surface-border shadow-lg shadow-black/20">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-heading tracking-wide text-white">
              ARTILLIGENCE
            </span>
            <span className="hidden sm:inline text-[10px] text-muted font-body tracking-[0.2em] uppercase">
              Powered by Exide
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="hidden md:inline-block text-sm text-gray-400 hover:text-white transition-colors font-body"
            >
              Home
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-exide px-5 py-2 text-sm font-semibold text-white hover:bg-exide-dark transition-colors font-body"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-exide/10 to-transparent pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-6 pt-16 pb-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-px w-12 bg-exide" />
            <span className="text-xs font-semibold tracking-[0.2em] text-exide uppercase font-body">
              Product Catalog
            </span>
          </div>
          <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-4">
            Exide Battery
            <br />
            <span className="text-muted">Product Range</span>
          </h1>
          <p className="text-gray-400 font-body max-w-2xl text-lg mb-8">
            Browse our complete range of batteries and inverters. From
            two-wheelers to heavy commercial vehicles, inverters to home
            solutions.
          </p>

          {/* Search */}
          <div className="max-w-md">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, category, or AH..."
                className="w-full rounded-full bg-surface-card border border-surface-border pl-11 pr-4 py-3 text-sm text-white placeholder:text-muted focus:outline-none focus:border-exide/50 transition-colors"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Category Filters */}
      <section className="sticky top-[65px] z-40 bg-surface/95 backdrop-blur-md border-b border-surface-border">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveCategory("")}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                !activeCategory
                  ? "bg-exide text-white"
                  : "bg-surface-card border border-surface-border text-gray-400 hover:text-white hover:border-exide/40"
              }`}
            >
              All ({products.length})
            </button>
            {categories.map((cat) => {
              const count = products.filter((p) => p.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() =>
                    setActiveCategory(activeCategory === cat ? "" : cat)
                  }
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    activeCategory === cat
                      ? "bg-exide text-white"
                      : "bg-surface-card border border-surface-border text-gray-400 hover:text-white hover:border-exide/40"
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="mx-auto max-w-7xl px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-exide border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted text-lg">No products found</p>
            <button
              onClick={() => {
                setSearch("");
                setActiveCategory("");
              }}
              className="mt-4 text-exide hover:underline text-sm"
            >
              Clear filters
            </button>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category} className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="font-heading text-2xl font-bold text-white">
                  {category}
                </h2>
                <span className="text-xs text-muted bg-surface-card border border-surface-border rounded-full px-3 py-0.5">
                  {items.length} {items.length === 1 ? "product" : "products"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((product) => (
                  <div
                    key={product.id}
                    className="group rounded-2xl bg-surface-card border border-surface-border overflow-hidden transition-all duration-300 hover:border-exide/40 hover:shadow-xl hover:shadow-exide/5 hover:-translate-y-1"
                  >
                    {/* Image */}
                    <div className="relative h-48 bg-white flex items-center justify-center p-4 overflow-hidden">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          width={180}
                          height={180}
                          className="object-contain max-h-full group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                          <svg
                            className="w-8 h-8 text-gray-300"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.5}
                            viewBox="0 0 24 24"
                          >
                            <rect
                              x="6"
                              y="6"
                              width="12"
                              height="14"
                              rx="1.5"
                            />
                            <path d="M10 4v2m4-2v2" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-5">
                      <h3 className="font-heading text-lg font-bold text-white mb-2 tracking-tight">
                        {product.name}
                      </h3>

                      <div className="flex flex-wrap gap-2 mb-4">
                        {product.ah && (
                          <span className="text-[11px] font-medium text-gray-400 bg-surface-raised px-2.5 py-1 rounded-full border border-surface-border">
                            {product.ah.includes("VA")
                              ? product.ah
                              : `${product.ah} AH`}
                          </span>
                        )}
                        {product.warranty && (
                          <span className="text-[11px] font-medium text-gray-400 bg-surface-raised px-2.5 py-1 rounded-full border border-surface-border">
                            {product.warranty} warranty
                          </span>
                        )}
                      </div>

                      <div className="flex items-end justify-between">
                        <div>
                          <span className="text-xs text-muted">MRP</span>
                          <p className="text-xl font-bold font-heading text-exide">
                            {Number(product.price).toLocaleString("en-IN", {
                              style: "currency",
                              currency: "INR",
                              maximumFractionDigits: 0,
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Footer */}
      <footer className="bg-surface border-t border-surface-border">
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-heading tracking-wide text-white">
              ARTILLIGENCE
            </span>
            <span className="text-xs text-muted font-body">
              Powered by Exide Industries
            </span>
          </div>
          <p className="text-xs text-muted font-body">
            &copy; {new Date().getFullYear()} Artilligence. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
