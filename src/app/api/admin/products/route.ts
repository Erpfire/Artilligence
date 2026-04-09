import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

// GET /api/admin/products — list with search + pagination
export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10")));
  const search = searchParams.get("search")?.trim() || "";
  const category = searchParams.get("category")?.trim() || "";

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

  return NextResponse.json({
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// POST /api/admin/products — create product
export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, nameHi, description, descriptionHi, price, sku, category, imageUrl, images, warranty, ah, remark, isActive } = body;

  // Validation
  const errors: string[] = [];
  if (!name?.trim()) errors.push("Product name is required");
  if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0)
    errors.push("Valid price is required");
  if (!category?.trim()) errors.push("Category is required");

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
  }

  // Check duplicate SKU
  if (sku?.trim()) {
    const existing = await prisma.product.findUnique({ where: { sku: sku.trim() } });
    if (existing) {
      return NextResponse.json({ error: "A product with this SKU already exists" }, { status: 409 });
    }
  }

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      nameHi: nameHi?.trim() || null,
      description: description?.trim() || null,
      descriptionHi: descriptionHi?.trim() || null,
      price: Number(price),
      sku: sku?.trim() || null,
      category: category.trim(),
      imageUrl: imageUrl?.trim() || null,
      images: images || null,
      warranty: warranty?.trim() || null,
      ah: ah?.trim() || null,
      remark: remark?.trim() || null,
      isCombo: true,
      isActive: isActive !== false,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PRODUCT_CREATED",
      entity: "Product",
      entityId: product.id,
      details: `Created product: ${product.name} (SKU: ${product.sku || "N/A"})`,
    },
  });

  return NextResponse.json({ product }, { status: 201 });
}
