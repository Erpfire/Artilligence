import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: { isActive: true, isCombo: true },
    select: {
      id: true,
      name: true,
      nameHi: true,
      price: true,
      sku: true,
      category: true,
      images: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      nameHi: p.nameHi,
      price: p.price.toString(),
      sku: p.sku,
      category: p.category,
      images: p.images,
    })),
  });
}
