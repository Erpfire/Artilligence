import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/products — public product listing
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim() || "";
  const category = searchParams.get("category")?.trim() || "";

  const where: Record<string, unknown> = { isActive: true, isCombo: false };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
      { ah: { contains: search, mode: "insensitive" } },
    ];
  }

  if (category) {
    where.category = category;
  }

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        price: true,
        category: true,
        imageUrl: true,
        warranty: true,
        ah: true,
      },
    }),
    prisma.product.findMany({
      where: { isActive: true, isCombo: false, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);

  return NextResponse.json({
    products,
    categories: categories.map((c) => c.category).filter(Boolean),
  });
}
