import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getReversalPreview } from "@/lib/commission-reversal-engine";

// GET /api/admin/sales/[id]/preview-return — preview affected members + amounts
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, billCode: true, totalAmount: true },
  });

  if (!sale) {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }

  if (sale.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Only approved sales can be returned" },
      { status: 400 }
    );
  }

  const preview = await getReversalPreview(prisma, params.id);

  return NextResponse.json({ preview });
}
