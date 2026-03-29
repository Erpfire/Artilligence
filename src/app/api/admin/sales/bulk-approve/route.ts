import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateCommissionsForSale } from "@/lib/commission-engine";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

// POST /api/admin/sales/bulk-approve — approve multiple sales
export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { saleIds } = body as { saleIds: string[] };

  if (!saleIds || !Array.isArray(saleIds) || saleIds.length === 0) {
    return NextResponse.json(
      { error: "No sales selected" },
      { status: 400 }
    );
  }

  // Fetch all pending sales
  const sales = await prisma.sale.findMany({
    where: { id: { in: saleIds }, status: "PENDING" },
  });

  if (sales.length === 0) {
    return NextResponse.json(
      { error: "No pending sales found" },
      { status: 400 }
    );
  }

  const results: { saleId: string; status: string; commissions: number }[] = [];

  for (const sale of sales) {
    // Update status
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        status: "APPROVED",
        approvedById: session.user.id,
        approvedAt: new Date(),
      },
    });

    // Calculate commissions
    const commissions = await calculateCommissionsForSale(prisma, sale.id);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "SALE_APPROVED",
        entity: "Sale",
        entityId: sale.id,
        details: JSON.stringify({
          billCode: sale.billCode,
          totalAmount: sale.totalAmount.toString(),
          commissionsGenerated: commissions.length,
          bulkApproval: true,
        }),
      },
    });

    results.push({
      saleId: sale.id,
      status: "APPROVED",
      commissions: commissions.length,
    });
  }

  return NextResponse.json({
    approved: results.length,
    results,
  });
}
