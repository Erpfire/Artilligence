import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const entity = searchParams.get("entity") || undefined;
  const entityId = searchParams.get("entityId") || undefined;
  const action = searchParams.get("action") || undefined;
  const userId = searchParams.get("userId") || undefined;
  const dateFrom = searchParams.get("dateFrom") || undefined;
  const dateTo = searchParams.get("dateTo") || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

  const where: Record<string, unknown> = {};
  if (entity) where.entity = entity;
  if (entityId) where.entityId = entityId;
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (userId) where.userId = userId;
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }) as Promise<{ id: string; userId: string; action: string; entity: string; entityId: string | null; details: string | null; createdAt: Date }[]>,
    db.auditLog.count({ where }) as Promise<number>,
  ]);

  // Collect unique userIds and fetch user names
  const userIds: string[] = [...new Set(logs.map((l: { userId: string }) => l.userId))];
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, { name: u.name, email: u.email }]));

  // Also fetch all distinct actors and actions/entities for filter dropdowns
  const [distinctActions, distinctEntities, actorRows] = await Promise.all([
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }) as Promise<{ action: string }[]>,
    db.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }) as Promise<{ entity: string }[]>,
    db.auditLog.findMany({ distinct: ["userId"], select: { userId: true } }) as Promise<{ userId: string }[]>,
  ]);

  const actorIds = actorRows.map((r: { userId: string }) => r.userId);
  const actors = actorIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];

  const enrichedLogs = logs.map((log: { id: string; userId: string; action: string; entity: string; entityId: string | null; details: string | null; createdAt: Date }) => ({
    ...log,
    actorName: userMap[log.userId]?.name || "Unknown",
    actorEmail: userMap[log.userId]?.email || "",
  }));

  return NextResponse.json({
    logs: enrichedLogs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    filters: {
      actions: distinctActions.map((a: { action: string }) => a.action),
      entities: distinctEntities.map((e: { entity: string }) => e.entity),
      actors: actors.map((a) => ({ id: a.id, name: a.name, email: a.email })),
    },
  });
}
