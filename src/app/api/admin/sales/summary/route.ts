import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

// GET /api/admin/sales/summary — aggregated sales stats with optional date filter
export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  // Build date filter
  const dateFilter: Prisma.SaleWhereInput = {};
  if (dateFrom || dateTo) {
    dateFilter.saleDate = {};
    if (dateFrom) {
      dateFilter.saleDate.gte = new Date(dateFrom);
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.saleDate.lte = endDate;
    }
  }

  // Get counts by status
  const [approvedAgg, pendingCount, rejectedCount, returnedCount] = await Promise.all([
    prisma.sale.aggregate({
      where: { status: "APPROVED", ...dateFilter },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.sale.count({ where: { status: "PENDING", ...dateFilter } }),
    prisma.sale.count({ where: { status: "REJECTED", ...dateFilter } }),
    prisma.sale.count({ where: { status: "RETURNED", ...dateFilter } }),
  ]);

  return NextResponse.json({
    totalApprovedAmount: (approvedAgg._sum.totalAmount ?? new Prisma.Decimal(0)).toString(),
    totalApprovedCount: approvedAgg._count,
    breakdown: {
      PENDING: pendingCount,
      APPROVED: approvedAgg._count,
      REJECTED: rejectedCount,
      RETURNED: returnedCount,
    },
  });
}
