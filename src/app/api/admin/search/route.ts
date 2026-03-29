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

// GET /api/admin/search?q=term
export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (!q || q.length < 2) {
    return NextResponse.json({ members: [], products: [], sales: [] });
  }

  const [members, products, sales] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: "MEMBER",
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { referralCode: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, status: true },
      take: 5,
    }),
    prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, sku: true, isActive: true },
      take: 5,
    }),
    prisma.sale.findMany({
      where: {
        OR: [
          { billCode: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        billCode: true,
        customerName: true,
        totalAmount: true,
        status: true,
      },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    members,
    products: JSON.parse(JSON.stringify(products)),
    sales: JSON.parse(JSON.stringify(sales)),
  });
}
