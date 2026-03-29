import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

// GET /api/admin/sales — list with status filter, search, pagination
export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
  const status = searchParams.get("status")?.trim() || "";
  const search = searchParams.get("search")?.trim() || "";

  const where: Record<string, unknown> = {};

  if (status && ["PENDING", "APPROVED", "REJECTED", "RETURNED"].includes(status)) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { billCode: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { member: { name: { contains: search, mode: "insensitive" } } },
      { member: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        member: {
          select: { id: true, name: true, email: true, referralCode: true },
        },
        saleItems: {
          include: {
            product: {
              select: { id: true, name: true, nameHi: true, price: true },
            },
          },
        },
        saleFlags: true,
        approvedBy: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  const response = NextResponse.json({
    sales: sales.map((s) => ({
      id: s.id,
      billCode: s.billCode,
      totalAmount: s.totalAmount.toString(),
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      saleDate: s.saleDate.toISOString(),
      billPhotoPath: s.billPhotoPath,
      status: s.status,
      rejectionReason: s.rejectionReason,
      returnReason: s.returnReason,
      createdAt: s.createdAt.toISOString(),
      approvedAt: s.approvedAt?.toISOString() || null,
      member: s.member,
      approvedBy: s.approvedBy,
      items: s.saleItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        productNameHi: item.product.nameHi,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        subtotal: item.subtotal.toString(),
      })),
      flags: s.saleFlags.map((f) => ({
        id: f.id,
        type: f.type,
        severity: f.severity,
        details: f.details,
      })),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}
