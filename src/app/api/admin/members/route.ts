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

// GET /api/admin/members — list with search, sort, filter, pagination
export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10")));
  const search = searchParams.get("search")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "";
  const dateFrom = searchParams.get("dateFrom")?.trim() || "";
  const dateTo = searchParams.get("dateTo")?.trim() || "";
  const sortBy = searchParams.get("sortBy")?.trim() || "createdAt";
  const sortOrder = searchParams.get("sortOrder")?.trim() === "asc" ? "asc" : "desc";

  const where: Record<string, unknown> = {
    role: "MEMBER",
  };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { referralCode: { contains: search, mode: "insensitive" } },
    ];
  }

  if (status && ["ACTIVE", "BLOCKED", "DEACTIVATED"].includes(status)) {
    where.status = status;
  }

  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    where.createdAt = createdAt;
  }

  // Allowed sort fields
  const allowedSorts: Record<string, string> = {
    name: "name",
    email: "email",
    createdAt: "createdAt",
    depth: "depth",
    status: "status",
  };
  const orderField = allowedSorts[sortBy] || "createdAt";

  const [members, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [orderField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        depth: true,
        status: true,
        referralCode: true,
        createdAt: true,
        sponsor: {
          select: { id: true, name: true },
        },
        _count: {
          select: { children: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Get downline counts for each member
  const membersWithDownline = await Promise.all(
    members.map(async (m) => {
      const downlineCount = await prisma.user.count({
        where: {
          path: { contains: m.id },
          id: { not: m.id },
        },
      });
      return {
        ...m,
        downlineCount,
      };
    })
  );

  return NextResponse.json({
    members: membersWithDownline,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
