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

// GET /api/admin/products/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ product });
}

// PUT /api/admin/products/[id] — update product
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.product.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
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

  // Check duplicate SKU (exclude self)
  if (sku?.trim()) {
    const duplicate = await prisma.product.findFirst({
      where: { sku: sku.trim(), id: { not: params.id } },
    });
    if (duplicate) {
      return NextResponse.json({ error: "A product with this SKU already exists" }, { status: 409 });
    }
  }

  const product = await prisma.product.update({
    where: { id: params.id },
    data: {
      name: name.trim(),
      nameHi: nameHi?.trim() || null,
      description: description?.trim() || null,
      descriptionHi: descriptionHi?.trim() || null,
      price: Number(price),
      sku: sku?.trim() || null,
      category: category.trim(),
      imageUrl: imageUrl?.trim() || null,
      images: images || existing.images,
      warranty: warranty?.trim() || null,
      ah: ah?.trim() || null,
      remark: remark?.trim() || null,
      isActive: isActive !== undefined ? isActive : existing.isActive,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PRODUCT_UPDATED",
      entity: "Product",
      entityId: product.id,
      details: `Updated product: ${product.name} (SKU: ${product.sku || "N/A"})`,
    },
  });

  return NextResponse.json({ product });
}

// PATCH /api/admin/products/[id] — toggle active status
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.product.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const body = await request.json();
  const { isActive } = body;

  if (typeof isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
  }

  const product = await prisma.product.update({
    where: { id: params.id },
    data: { isActive },
  });

  const action = isActive ? "PRODUCT_ACTIVATED" : "PRODUCT_DEACTIVATED";
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action,
      entity: "Product",
      entityId: product.id,
      details: `${isActive ? "Activated" : "Deactivated"} product: ${product.name}`,
    },
  });

  return NextResponse.json({ product });
}
