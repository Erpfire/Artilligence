import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateCommissionsForSale } from "@/lib/commission-engine";
import {
  reverseCommissionsForSale,
  getReversalPreview,
} from "@/lib/commission-reversal-engine";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

// GET /api/admin/sales/[id] — sale detail
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
    include: {
      member: {
        select: { id: true, name: true, email: true, phone: true, referralCode: true },
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
      commissions: {
        include: {
          beneficiary: {
            select: { id: true, name: true },
          },
        },
        orderBy: { level: "asc" },
      },
    },
  });

  if (!sale) {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }

  return NextResponse.json({
    sale: {
      id: sale.id,
      billCode: sale.billCode,
      totalAmount: sale.totalAmount.toString(),
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      saleDate: sale.saleDate.toISOString(),
      billPhotoPath: sale.billPhotoPath,
      status: sale.status,
      rejectionReason: sale.rejectionReason,
      returnReason: sale.returnReason,
      returnedAt: sale.returnedAt?.toISOString() || null,
      createdAt: sale.createdAt.toISOString(),
      approvedAt: sale.approvedAt?.toISOString() || null,
      member: sale.member,
      approvedBy: sale.approvedBy,
      items: sale.saleItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        productNameHi: item.product.nameHi,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        subtotal: item.subtotal.toString(),
      })),
      flags: sale.saleFlags.map((f) => ({
        id: f.id,
        type: f.type,
        severity: f.severity,
        details: f.details,
      })),
      commissions: sale.commissions.map((c) => ({
        id: c.id,
        level: c.level,
        percentage: c.percentage.toString(),
        amount: c.amount.toString(),
        type: c.type,
        beneficiary: c.beneficiary,
      })),
    },
  });
}

// PATCH /api/admin/sales/[id] — approve or reject
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, reason } = body as { action: string; reason?: string };

  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
  });

  if (!sale) {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }

  // Return action works on APPROVED sales
  if (action === "return") {
    if (sale.status === "RETURNED") {
      return NextResponse.json(
        { error: "Sale already returned" },
        { status: 400 }
      );
    }
    if (sale.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Only approved sales can be returned" },
        { status: 400 }
      );
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: "Return reason is required" },
        { status: 400 }
      );
    }

    const reversals = await reverseCommissionsForSale(
      prisma,
      params.id,
      reason,
      session.user.id
    );

    return NextResponse.json({
      sale: { id: params.id, status: "RETURNED", returnReason: reason.trim() },
      reversals: reversals.map((r) => ({
        beneficiaryId: r.beneficiaryId,
        beneficiaryName: r.beneficiaryName,
        level: r.level,
        amount: r.amount.toString(),
      })),
    });
  }

  // Approve/reject only work on PENDING sales
  if (sale.status !== "PENDING") {
    return NextResponse.json(
      { error: "Only pending sales can be approved or rejected" },
      { status: 400 }
    );
  }

  if (action === "approve") {
    // Update sale status
    await prisma.sale.update({
      where: { id: params.id },
      data: {
        status: "APPROVED",
        approvedById: session.user.id,
        approvedAt: new Date(),
      },
    });

    // Calculate commissions
    const commissions = await calculateCommissionsForSale(prisma, params.id);

    // Audit log: sale approved
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "SALE_APPROVED",
        entity: "Sale",
        entityId: params.id,
        details: JSON.stringify({
          billCode: sale.billCode,
          totalAmount: sale.totalAmount.toString(),
          commissionsGenerated: commissions.length,
        }),
      },
    });

    // Audit log: commissions calculated
    if (commissions.length > 0) {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "COMMISSIONS_CALCULATED",
          entity: "Sale",
          entityId: params.id,
          details: JSON.stringify({
            billCode: sale.billCode,
            commissions: commissions.map((c) => ({
              beneficiaryId: c.beneficiaryId,
              level: c.level,
              amount: c.amount.toString(),
            })),
          }),
        },
      });
    }

    // Notify the member that their sale was approved
    await prisma.notification.create({
      data: {
        userId: sale.memberId,
        title: `Sale ${sale.billCode} approved`,
        titleHi: `बिक्री ${sale.billCode} स्वीकृत`,
        body: `Your sale of ₹${Number(sale.totalAmount).toFixed(2)} has been approved.`,
        bodyHi: `आपकी ₹${Number(sale.totalAmount).toFixed(2)} की बिक्री स्वीकृत हो गई है।`,
        link: "/dashboard/sales",
      },
    });

    return NextResponse.json({
      sale: { id: params.id, status: "APPROVED" },
      commissions,
    });
  } else if (action === "reject") {
    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: "Rejection reason is required" },
        { status: 400 }
      );
    }

    await prisma.sale.update({
      where: { id: params.id },
      data: {
        status: "REJECTED",
        rejectionReason: reason.trim(),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "SALE_REJECTED",
        entity: "Sale",
        entityId: params.id,
        details: JSON.stringify({
          billCode: sale.billCode,
          reason: reason.trim(),
        }),
      },
    });

    // Notify the member that their sale was rejected
    await prisma.notification.create({
      data: {
        userId: sale.memberId,
        title: `Sale ${sale.billCode} rejected`,
        titleHi: `बिक्री ${sale.billCode} अस्वीकृत`,
        body: `Your sale has been rejected. Reason: ${reason.trim()}`,
        bodyHi: `आपकी बिक्री अस्वीकृत हो गई है। कारण: ${reason.trim()}`,
        link: "/dashboard/sales",
      },
    });

    return NextResponse.json({
      sale: { id: params.id, status: "REJECTED", rejectionReason: reason.trim() },
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
