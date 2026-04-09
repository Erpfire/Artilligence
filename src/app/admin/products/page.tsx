import { prisma } from "@/lib/db";
import ProductsTable from "./ProductsTable";

const CATEGORIES = ["COMBO"];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { page?: string; search?: string; category?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page || "1"));
  const limit = 10;
  const search = searchParams.search?.trim() || "";
  const category = searchParams.category?.trim() || "";

  const where: Record<string, unknown> = { isCombo: true };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { nameHi: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
    ];
  }

  if (category) {
    where.category = category;
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="products-title">
          Products
        </h1>
        <a
          href="/admin/products/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
          data-testid="add-product-button"
        >
          Add Product
        </a>
      </div>

      <ProductsTable
        products={JSON.parse(JSON.stringify(products))}
        total={total}
        page={page}
        totalPages={totalPages}
        search={search}
        category={category}
        categories={CATEGORIES}
      />
    </div>
  );
}
