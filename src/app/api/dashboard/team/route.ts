import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/dashboard/team?rootId=xxx&depth=3
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = request.nextUrl;
  const rootId = searchParams.get("rootId")?.trim() || "";
  const maxDepth = Math.min(5, Math.max(1, parseInt(searchParams.get("depth") || "3")));

  // Verify the requested root is the member themselves or within their downline
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, path: true },
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let rootMemberId = userId;
  if (rootId) {
    // Check that rootId is within this member's downline
    const target = await prisma.user.findUnique({
      where: { id: rootId },
      select: { id: true, path: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    // Must be self or in downline (path starts with currentUser's path)
    const isDownline = target.path.startsWith(currentUser.path + "/") || target.id === userId;
    if (!isDownline) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    rootMemberId = rootId;
  }

  async function buildTree(
    memberId: string,
    currentDepth: number
  ): Promise<Record<string, unknown> | null> {
    const member = await prisma.user.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        depth: true,
        path: true,
        referralCode: true,
        children: {
          select: {
            id: true,
            position: true,
          },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!member) return null;

    // Count total downline using materialized path
    const totalDownline = await prisma.user.count({
      where: {
        path: { startsWith: member.path + "/" },
        id: { not: member.id },
      },
    });

    // Sum total approved sales amount for this member
    const salesAgg = await prisma.sale.aggregate({
      where: { memberId: member.id, status: "APPROVED" },
      _sum: { totalAmount: true },
      _count: true,
    });

    const childNodes: (Record<string, unknown> | null)[] = [];

    // Always show 3 slots (ternary tree)
    for (let pos = 1; pos <= 3; pos++) {
      const child = member.children.find((c) => c.position === pos);
      if (child && currentDepth < maxDepth) {
        childNodes.push(await buildTree(child.id, currentDepth + 1));
      } else if (child) {
        // At max depth, show child but no grandchildren
        const childMember = await prisma.user.findUnique({
          where: { id: child.id },
          select: { id: true, name: true, email: true, status: true, depth: true, path: true, referralCode: true },
        });
        if (childMember) {
          const childDownline = await prisma.user.count({
            where: { path: { startsWith: childMember.path + "/" }, id: { not: childMember.id } },
          });
          const childSales = await prisma.sale.aggregate({
            where: { memberId: childMember.id, status: "APPROVED" },
            _sum: { totalAmount: true },
          });
          const grandchildCount = await prisma.user.count({ where: { parentId: child.id } });
          childNodes.push({
            id: childMember.id,
            name: childMember.name,
            email: childMember.email,
            status: childMember.status,
            depth: childMember.depth,
            referralCode: childMember.referralCode,
            totalDownline: childDownline,
            totalSales: (childSales._sum.totalAmount || 0).toString(),
            hasChildren: grandchildCount > 0,
            children: [],
          });
        } else {
          childNodes.push(null);
        }
      } else {
        childNodes.push(null);
      }
    }

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      status: member.status,
      depth: member.depth,
      referralCode: member.referralCode,
      totalDownline,
      totalSales: (salesAgg._sum.totalAmount || 0).toString(),
      salesCount: salesAgg._count,
      children: childNodes,
    };
  }

  const tree = await buildTree(rootMemberId, 0);

  return NextResponse.json({ tree });
}
