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

// PATCH /api/admin/sales/[id]/dismiss-flag — dismiss a specific flag
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { flagId } = body as { flagId: string };

  if (!flagId) {
    return NextResponse.json(
      { error: "Flag ID is required" },
      { status: 400 }
    );
  }

  // Verify flag belongs to this sale
  const flag = await prisma.saleFlag.findUnique({
    where: { id: flagId },
  });

  if (!flag || flag.saleId !== params.id) {
    return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  }

  // Delete the flag (dismiss)
  await prisma.saleFlag.delete({
    where: { id: flagId },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "FLAG_DISMISSED",
      entity: "SaleFlag",
      entityId: flagId,
      details: JSON.stringify({
        saleId: params.id,
        flagType: flag.type,
        flagSeverity: flag.severity,
      }),
    },
  });

  return NextResponse.json({ success: true });
}
