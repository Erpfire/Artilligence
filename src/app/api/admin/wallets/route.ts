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

// GET /api/admin/wallets — list all member wallets with search + total pending
export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10")));
  const search = searchParams.get("search")?.trim() || "";

  const pendingOnly = searchParams.get("pendingOnly") === "true";
  const sortBy = searchParams.get("sortBy") || "pending";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

  const userWhere: Record<string, unknown> = { role: "MEMBER" };
  if (search) {
    userWhere.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }

  const walletWhere: Record<string, unknown> = { user: userWhere };
  if (pendingOnly) {
    walletWhere.pending = { gt: 0 };
  }

  // Sortable columns
  const validSortColumns = ["pending", "totalEarned", "paidOut"];
  const orderByColumn = validSortColumns.includes(sortBy) ? sortBy : "pending";

  const [wallets, total, pendingSum] = await Promise.all([
    prisma.wallet.findMany({
      where: walletWhere,
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, status: true },
        },
      },
      orderBy: { [orderByColumn]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.wallet.count({ where: walletWhere }),
    prisma.wallet.aggregate({
      where: { user: { role: "MEMBER" } },
      _sum: { pending: true },
    }),
  ]);

  return NextResponse.json({
    wallets: wallets.map((w) => ({
      id: w.id,
      userId: w.userId,
      totalEarned: w.totalEarned.toString(),
      pending: w.pending.toString(),
      paidOut: w.paidOut.toString(),
      user: w.user,
    })),
    totalPendingPayouts: (pendingSum._sum.pending || 0).toString(),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
