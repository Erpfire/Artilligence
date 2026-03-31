import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// GET /api/dashboard/team/list?search=xxx&sort=name&order=asc&page=1&limit=10
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim() || "";
  const sort = searchParams.get("sort") || "depth";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(5, parseInt(searchParams.get("limit") || "10")));

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, path: true, depth: true },
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Build where clause — all downline members (path starts with current user's path)
  const where: Prisma.UserWhereInput = {
    path: { startsWith: currentUser.path + "/" },
    id: { not: userId },
    role: "MEMBER",
  };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ];
  }

  // Determine sort field
  const allowedSorts: Record<string, Prisma.UserOrderByWithRelationInput> = {
    name: { name: order },
    depth: { depth: order },
    status: { status: order },
    createdAt: { createdAt: order },
  };
  const orderBy = allowedSorts[sort] || { depth: order as Prisma.SortOrder };

  const [total, members] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        depth: true,
        createdAt: true,
        sponsor: {
          select: { name: true },
        },
        _count: {
          select: {
            sales: {
              where: { status: "APPROVED" },
            },
          },
        },
      },
    }),
  ]);

  const data = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    status: m.status,
    level: m.depth - currentUser.depth,
    sponsorName: m.sponsor?.name || "-",
    salesCount: m._count.sales,
    joinedAt: m.createdAt.toISOString(),
  }));

  return NextResponse.json({
    members: data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
