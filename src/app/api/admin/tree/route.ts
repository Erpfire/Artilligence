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

// GET /api/admin/tree?rootId=xxx&depth=3
export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const rootId = searchParams.get("rootId")?.trim() || "";
  const maxDepth = Math.min(5, Math.max(1, parseInt(searchParams.get("depth") || "3")));

  // Find the root node
  let rootMember;
  if (rootId) {
    rootMember = await prisma.user.findUnique({
      where: { id: rootId },
      select: { id: true, name: true, email: true, status: true, depth: true, referralCode: true },
    });
  } else {
    // Find the actual tree root (member with no parent)
    rootMember = await prisma.user.findFirst({
      where: { role: "MEMBER", parentId: null },
      select: { id: true, name: true, email: true, status: true, depth: true, referralCode: true },
    });
  }

  if (!rootMember) {
    return NextResponse.json({ tree: null, message: "No members in tree" });
  }

  // Build tree recursively up to maxDepth
  async function buildTree(
    memberId: string,
    currentDepth: number
  ): Promise<Record<string, unknown>> {
    const member = await prisma.user.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        depth: true,
        referralCode: true,
        children: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            depth: true,
            position: true,
            referralCode: true,
          },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!member) return {};

    const childNodes: (Record<string, unknown> | null)[] = [];

    // Always show 3 slots (ternary tree)
    for (let pos = 1; pos <= 3; pos++) {
      const child = member.children.find((c) => c.position === pos);
      if (child && currentDepth < maxDepth) {
        childNodes.push(await buildTree(child.id, currentDepth + 1));
      } else if (child) {
        // At max depth, show child but no grandchildren
        const grandchildCount = await prisma.user.count({
          where: { parentId: child.id },
        });
        childNodes.push({
          id: child.id,
          name: child.name,
          email: child.email,
          status: child.status,
          depth: child.depth,
          referralCode: child.referralCode,
          hasChildren: grandchildCount > 0,
          children: [],
        });
      } else {
        childNodes.push(null); // Empty slot
      }
    }

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      status: member.status,
      depth: member.depth,
      referralCode: member.referralCode,
      children: childNodes,
    };
  }

  const tree = await buildTree(rootMember.id, 0);

  return NextResponse.json({ tree });
}
