import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/dashboard/announcements — active announcements for members, pinned first
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const announcements = await prisma.announcement.findMany({
    where: { isActive: true },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    announcements: announcements.map((a) => ({
      id: a.id,
      titleEn: a.titleEn,
      titleHi: a.titleHi,
      contentEn: a.contentEn,
      contentHi: a.contentHi,
      isPinned: a.isPinned,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
