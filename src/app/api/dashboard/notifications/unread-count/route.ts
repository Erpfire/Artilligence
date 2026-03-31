import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/dashboard/notifications/unread-count — lightweight polling endpoint
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  });

  // Cleanup: delete notifications older than 90 days (run opportunistically)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  prisma.notification.deleteMany({
    where: { userId: session.user.id, createdAt: { lt: ninetyDaysAgo } },
  }).catch(() => {});

  return NextResponse.json({ count }, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
