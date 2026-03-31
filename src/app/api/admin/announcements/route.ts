import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sanitizeText, sanitizeAnnouncementContent } from "@/lib/sanitize";

// GET /api/admin/announcements — list all announcements
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const announcements = await prisma.announcement.findMany({
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
      isActive: a.isActive,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  });
}

// POST /api/admin/announcements — create announcement + notify all active members
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { titleEn, titleHi, contentEn, contentHi, isPinned } = body;

  if (!titleEn?.trim() || !contentEn?.trim()) {
    return NextResponse.json(
      { error: "Title and content (English) are required" },
      { status: 400 }
    );
  }

  // Sanitize inputs to prevent XSS
  const safeTitleEn = sanitizeText(titleEn, 200);
  const safeTitleHi = titleHi ? sanitizeText(titleHi, 200) : null;
  const safeContentEn = sanitizeAnnouncementContent(contentEn);
  const safeContentHi = contentHi ? sanitizeAnnouncementContent(contentHi) : null;

  const announcement = await prisma.announcement.create({
    data: {
      titleEn: safeTitleEn,
      titleHi: safeTitleHi,
      contentEn: safeContentEn,
      contentHi: safeContentHi,
      isPinned: isPinned || false,
    },
  });

  // Notify all active members
  const activeMembers = await prisma.user.findMany({
    where: { role: "MEMBER", status: "ACTIVE" },
    select: { id: true },
  });

  if (activeMembers.length > 0) {
    await prisma.notification.createMany({
      data: activeMembers.map((m) => ({
        userId: m.id,
        title: `New announcement: ${safeTitleEn}`,
        titleHi: safeTitleHi ? `नई घोषणा: ${safeTitleHi}` : null,
        body: safeContentEn.substring(0, 200),
        bodyHi: safeContentHi?.substring(0, 200) || null,
        link: "/dashboard/announcements",
      })),
    });
  }

  return NextResponse.json({ announcement: { id: announcement.id } }, { status: 201 });
}

// PATCH /api/admin/announcements — update announcement
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, titleEn, titleHi, contentEn, contentHi, isPinned, isActive } = body;

  if (!id) {
    return NextResponse.json({ error: "Announcement ID required" }, { status: 400 });
  }

  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (titleEn !== undefined) data.titleEn = sanitizeText(titleEn, 200);
  if (titleHi !== undefined) data.titleHi = titleHi ? sanitizeText(titleHi, 200) : null;
  if (contentEn !== undefined) data.contentEn = sanitizeAnnouncementContent(contentEn);
  if (contentHi !== undefined) data.contentHi = contentHi ? sanitizeAnnouncementContent(contentHi) : null;
  if (isPinned !== undefined) data.isPinned = isPinned;
  if (isActive !== undefined) data.isActive = isActive;

  await prisma.announcement.update({ where: { id }, data });

  return NextResponse.json({ success: true });
}
