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

// GET /api/admin/members/[id] — member detail
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      depth: true,
      position: true,
      path: true,
      status: true,
      referralCode: true,
      createdAt: true,
      updatedAt: true,
      hasCompletedOnboarding: true,
      preferredLanguage: true,
      sponsor: {
        select: { id: true, name: true, email: true, referralCode: true },
      },
      parent: {
        select: { id: true, name: true, email: true },
      },
      children: {
        select: { id: true, name: true, email: true, position: true, status: true },
        orderBy: { position: "asc" },
      },
      wallet: {
        select: { totalEarned: true, pending: true, paidOut: true },
      },
      _count: {
        select: {
          sales: true,
          commissionsEarned: true,
        },
      },
    },
  });

  if (!member || member.role !== "MEMBER") {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Get downline count
  const downlineCount = await prisma.user.count({
    where: {
      path: { contains: member.id },
      id: { not: member.id },
    },
  });

  // Get recent sales
  const recentSales = await prisma.sale.findMany({
    where: { memberId: member.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      billCode: true,
      totalAmount: true,
      status: true,
      saleDate: true,
    },
  });

  // Get recent commissions
  const recentCommissions = await prisma.commission.findMany({
    where: { beneficiaryId: member.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      amount: true,
      level: true,
      type: true,
      createdAt: true,
      sale: {
        select: { billCode: true },
      },
    },
  });

  return NextResponse.json({
    member: {
      ...member,
      downlineCount,
      recentSales: JSON.parse(JSON.stringify(recentSales)),
      recentCommissions: JSON.parse(JSON.stringify(recentCommissions)),
    },
  });
}

// PATCH /api/admin/members/[id] — block/unblock
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || existing.role !== "MEMBER") {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const body = await request.json();
  const { status } = body;

  if (!status || !["ACTIVE", "BLOCKED"].includes(status)) {
    return NextResponse.json({ error: "Status must be ACTIVE or BLOCKED" }, { status: 400 });
  }

  if (status === existing.status) {
    return NextResponse.json({ error: `Member is already ${status}` }, { status: 400 });
  }

  const member = await prisma.user.update({
    where: { id: params.id },
    data: { status },
    select: { id: true, name: true, email: true, status: true },
  });

  const action = status === "BLOCKED" ? "MEMBER_BLOCKED" : "MEMBER_UNBLOCKED";
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action,
      entity: "User",
      entityId: member.id,
      details: `${status === "BLOCKED" ? "Blocked" : "Unblocked"} member: ${member.name} (${member.email})`,
    },
  });

  return NextResponse.json({ member });
}
