import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/dashboard/commission-rates — commission rates for member earnings table
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.commissionSetting.findMany({
    orderBy: { level: "asc" },
  });

  return NextResponse.json({
    settings: settings.map((s) => ({
      level: s.level,
      percentage: s.percentage.toString(),
    })),
  });
}
