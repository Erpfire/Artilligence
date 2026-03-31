import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}

function serializeDecimal(val: Prisma.Decimal | null | undefined): string {
  return val ? val.toString() : "0";
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") || "sales";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
  const skip = (page - 1) * limit;

  switch (type) {
    case "sales":
      return handleSalesReport(searchParams, skip, limit, page);
    case "commissions":
      return handleCommissionsReport(searchParams, skip, limit, page);
    case "members":
      return handleMembersReport(searchParams, skip, limit, page);
    case "payouts":
      return handlePayoutsReport(searchParams, skip, limit, page);
    case "top-performers":
      return handleTopPerformers(searchParams);
    case "tree-overview":
      return handleTreeOverview();
    case "financial-year":
      return handleFinancialYear(searchParams, skip, limit, page);
    case "monthly-payout":
      return handleMonthlyPayout(searchParams);
    default:
      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  }
}

async function handleSalesReport(
  params: URLSearchParams,
  skip: number,
  limit: number,
  page: number
) {
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const memberId = params.get("memberId");
  const productId = params.get("productId");
  const status = params.get("status");

  const where: Prisma.SaleWhereInput = {};
  if (dateFrom || dateTo) {
    where.saleDate = {};
    if (dateFrom) where.saleDate.gte = new Date(dateFrom);
    if (dateTo) where.saleDate.lte = new Date(dateTo);
  }
  if (memberId) where.memberId = memberId;
  if (status) where.status = status as Prisma.EnumSaleStatusFilter;
  if (productId) {
    where.saleItems = { some: { productId } };
  }

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { saleDate: "desc" },
      skip,
      take: limit,
      include: {
        member: { select: { id: true, name: true, email: true } },
        saleItems: { include: { product: { select: { name: true } } } },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  const summary = await prisma.sale.aggregate({
    where,
    _sum: { totalAmount: true },
    _count: true,
  });

  return NextResponse.json({
    items: items.map((s) => ({
      id: s.id,
      billCode: s.billCode,
      memberName: s.member.name,
      memberEmail: s.member.email,
      customerName: s.customerName,
      totalAmount: serializeDecimal(s.totalAmount),
      saleDate: s.saleDate.toISOString(),
      status: s.status,
      products: s.saleItems.map((si) => si.product.name).join(", "),
    })),
    summary: {
      totalSales: summary._count,
      totalAmount: serializeDecimal(summary._sum.totalAmount),
    },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

async function handleCommissionsReport(
  params: URLSearchParams,
  skip: number,
  limit: number,
  page: number
) {
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const beneficiaryId = params.get("beneficiaryId");
  const sourceMemberId = params.get("sourceMemberId");
  const level = params.get("level");

  const where: Prisma.CommissionWhereInput = {};
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo + "T23:59:59Z");
  }
  if (beneficiaryId) where.beneficiaryId = beneficiaryId;
  if (sourceMemberId) where.sourceMemberId = sourceMemberId;
  if (level) where.level = parseInt(level);

  const [items, total] = await Promise.all([
    prisma.commission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        beneficiary: { select: { id: true, name: true } },
        sourceMember: { select: { id: true, name: true } },
        sale: { select: { billCode: true, totalAmount: true } },
      },
    }),
    prisma.commission.count({ where }),
  ]);

  const summary = await prisma.commission.aggregate({
    where,
    _sum: { amount: true },
    _count: true,
  });

  return NextResponse.json({
    items: items.map((c) => ({
      id: c.id,
      beneficiaryName: c.beneficiary.name,
      beneficiaryId: c.beneficiaryId,
      sourceMemberName: c.sourceMember.name,
      billCode: c.sale.billCode,
      saleAmount: serializeDecimal(c.sale.totalAmount),
      level: c.level,
      percentage: serializeDecimal(c.percentage),
      amount: serializeDecimal(c.amount),
      type: c.type,
      createdAt: c.createdAt.toISOString(),
    })),
    summary: {
      totalCommissions: summary._count,
      totalAmount: serializeDecimal(summary._sum.amount),
    },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

async function handleMembersReport(
  params: URLSearchParams,
  skip: number,
  limit: number,
  page: number
) {
  const status = params.get("status");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const sponsorId = params.get("sponsorId");

  const where: Prisma.UserWhereInput = { role: "MEMBER" };
  if (status) where.status = status as Prisma.EnumMemberStatusFilter;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo + "T23:59:59Z");
  }
  if (sponsorId) where.sponsorId = sponsorId;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        sponsor: { select: { name: true } },
        wallet: { select: { totalEarned: true, pending: true, paidOut: true } },
        _count: { select: { sales: true, sponsored: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      sponsorName: u.sponsor?.name || "—",
      totalSales: u._count.sales,
      directReferrals: u._count.sponsored,
      totalEarned: serializeDecimal(u.wallet?.totalEarned),
      pending: serializeDecimal(u.wallet?.pending),
      paidOut: serializeDecimal(u.wallet?.paidOut),
      joinedAt: u.createdAt.toISOString(),
    })),
    summary: { totalMembers: total },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

async function handlePayoutsReport(
  params: URLSearchParams,
  skip: number,
  limit: number,
  page: number
) {
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const memberId = params.get("memberId");

  const where: Prisma.WalletTransactionWhereInput = { type: "PAYOUT" };
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo + "T23:59:59Z");
  }
  if (memberId) {
    where.wallet = { userId: memberId };
  }

  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        wallet: { include: { user: { select: { id: true, name: true, email: true } } } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  const summary = await prisma.walletTransaction.aggregate({
    where,
    _sum: { amount: true },
    _count: true,
  });

  return NextResponse.json({
    items: items.map((t) => ({
      id: t.id,
      memberName: t.wallet.user.name,
      memberEmail: t.wallet.user.email,
      amount: serializeDecimal(t.amount),
      description: t.description,
      paidBy: t.createdBy?.name || "System",
      paidAt: t.createdAt.toISOString(),
    })),
    summary: {
      totalPayouts: summary._count,
      totalAmount: serializeDecimal(summary._sum.amount),
    },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

async function handleTopPerformers(params: URLSearchParams) {
  const metric = params.get("metric") || "sales";
  const topN = Math.min(100, Math.max(1, parseInt(params.get("topN") || "10")));
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");

  const dateFilter: Prisma.SaleWhereInput = { status: "APPROVED" };
  if (dateFrom || dateTo) {
    dateFilter.saleDate = {};
    if (dateFrom) dateFilter.saleDate.gte = new Date(dateFrom);
    if (dateTo) dateFilter.saleDate.lte = new Date(dateTo);
  }

  if (metric === "sales") {
    const members = await prisma.user.findMany({
      where: { role: "MEMBER", status: "ACTIVE" },
      include: {
        sales: { where: dateFilter },
        wallet: { select: { totalEarned: true } },
      },
    });

    const ranked = members
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        salesCount: m.sales.length,
        salesAmount: m.sales
          .reduce((sum, s) => sum + parseFloat(s.totalAmount.toString()), 0)
          .toFixed(2),
        totalEarned: serializeDecimal(m.wallet?.totalEarned),
      }))
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, topN);

    return NextResponse.json({ items: ranked, metric, topN });
  }

  if (metric === "earnings") {
    const commDateFilter: Prisma.CommissionWhereInput = { type: "EARNING" };
    if (dateFrom || dateTo) {
      commDateFilter.createdAt = {};
      if (dateFrom) commDateFilter.createdAt.gte = new Date(dateFrom);
      if (dateTo) commDateFilter.createdAt.lte = new Date(dateTo + "T23:59:59Z");
    }

    const members = await prisma.user.findMany({
      where: { role: "MEMBER", status: "ACTIVE" },
      include: {
        commissionsEarned: { where: commDateFilter },
        _count: { select: { sales: true } },
      },
    });

    const ranked = members
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        salesCount: m._count.sales,
        totalEarned: m.commissionsEarned
          .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0)
          .toFixed(2),
      }))
      .sort((a, b) => parseFloat(b.totalEarned) - parseFloat(a.totalEarned))
      .slice(0, topN);

    return NextResponse.json({ items: ranked, metric, topN });
  }

  if (metric === "referrals") {
    const members = await prisma.user.findMany({
      where: { role: "MEMBER", status: "ACTIVE" },
      include: {
        _count: { select: { sponsored: true, sales: true } },
        wallet: { select: { totalEarned: true } },
      },
    });

    const ranked = members
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        referralCount: m._count.sponsored,
        salesCount: m._count.sales,
        totalEarned: serializeDecimal(m.wallet?.totalEarned),
      }))
      .sort((a, b) => b.referralCount - a.referralCount)
      .slice(0, topN);

    return NextResponse.json({ items: ranked, metric, topN });
  }

  return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
}

async function handleTreeOverview() {
  const totalMembers = await prisma.user.count({ where: { role: "MEMBER" } });
  const activeMembers = await prisma.user.count({
    where: { role: "MEMBER", status: "ACTIVE" },
  });
  const blockedMembers = await prisma.user.count({
    where: { role: "MEMBER", status: "BLOCKED" },
  });

  const maxDepthResult = await prisma.user.aggregate({
    where: { role: "MEMBER" },
    _max: { depth: true },
  });
  const maxDepth = maxDepthResult._max.depth || 0;

  // Distribution by depth
  const depthDistribution: { depth: number; count: number }[] = [];
  for (let d = 0; d <= maxDepth; d++) {
    const count = await prisma.user.count({
      where: { role: "MEMBER", depth: d },
    });
    if (count > 0) depthDistribution.push({ depth: d, count });
  }

  // Top sponsors
  const topSponsors = await prisma.user.findMany({
    where: { role: "MEMBER", status: "ACTIVE" },
    include: { _count: { select: { sponsored: true } } },
    orderBy: { sponsored: { _count: "desc" } },
    take: 5,
  });

  return NextResponse.json({
    totalMembers,
    activeMembers,
    blockedMembers,
    maxDepth,
    depthDistribution,
    topSponsors: topSponsors.map((s) => ({
      name: s.name,
      email: s.email,
      referrals: s._count.sponsored,
    })),
  });
}

async function handleFinancialYear(
  params: URLSearchParams,
  skip: number,
  limit: number,
  page: number
) {
  const fyParam = params.get("fy");
  // Default: current FY (April-March). If month >= April, FY starts this year, else last year.
  const now = new Date();
  const currentFYStart =
    now.getMonth() >= 3
      ? new Date(now.getFullYear(), 3, 1)
      : new Date(now.getFullYear() - 1, 3, 1);
  const currentFYEnd = new Date(currentFYStart.getFullYear() + 1, 2, 31, 23, 59, 59);

  let fyStart = currentFYStart;
  let fyEnd = currentFYEnd;
  if (fyParam) {
    // Format: "2025-26"
    const startYear = parseInt(fyParam.split("-")[0]);
    fyStart = new Date(startYear, 3, 1);
    fyEnd = new Date(startYear + 1, 2, 31, 23, 59, 59);
  }

  const members = await prisma.user.findMany({
    where: { role: "MEMBER" },
    include: {
      commissionsEarned: {
        where: {
          type: "EARNING",
          createdAt: { gte: fyStart, lte: fyEnd },
        },
      },
      wallet: { select: { paidOut: true } },
    },
    skip,
    take: limit,
    orderBy: { name: "asc" },
  });

  const total = await prisma.user.count({ where: { role: "MEMBER" } });

  const TDS_THRESHOLD = 15000;

  const items = members.map((m) => {
    const totalEarnings = m.commissionsEarned.reduce(
      (sum, c) => sum + parseFloat(c.amount.toString()),
      0
    );
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      totalEarnings: totalEarnings.toFixed(2),
      tdsApplicable: totalEarnings > TDS_THRESHOLD,
      commissionsCount: m.commissionsEarned.length,
    };
  });

  const fyLabel = `${fyStart.getFullYear()}-${(fyEnd.getFullYear() % 100).toString().padStart(2, "0")}`;

  return NextResponse.json({
    items,
    fy: fyLabel,
    fyStart: fyStart.toISOString(),
    fyEnd: fyEnd.toISOString(),
    tdsThreshold: TDS_THRESHOLD,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

async function handleMonthlyPayout(params: URLSearchParams) {
  const year = parseInt(params.get("year") || new Date().getFullYear().toString());
  const month = parseInt(params.get("month") || (new Date().getMonth() + 1).toString());

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const payouts = await prisma.walletTransaction.findMany({
    where: {
      type: "PAYOUT",
      createdAt: { gte: startDate, lte: endDate },
    },
    include: {
      wallet: { include: { user: { select: { name: true, email: true, phone: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const summary = await prisma.walletTransaction.aggregate({
    where: {
      type: "PAYOUT",
      createdAt: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
    _count: true,
  });

  return NextResponse.json({
    items: payouts.map((p) => ({
      id: p.id,
      memberName: p.wallet.user.name,
      memberEmail: p.wallet.user.email,
      memberPhone: p.wallet.user.phone,
      amount: serializeDecimal(p.amount),
      description: p.description,
      paidAt: p.createdAt.toISOString(),
    })),
    summary: {
      totalPayouts: summary._count,
      totalAmount: serializeDecimal(summary._sum.amount),
    },
    month,
    year,
    monthLabel: new Date(year, month - 1).toLocaleString("en-IN", {
      month: "long",
      year: "numeric",
    }),
  });
}
