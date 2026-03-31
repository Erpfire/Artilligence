import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await prisma.reportJob.findMany({
    where: { createdById: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { type, format, filters } = body;

  if (!type || !format) {
    return NextResponse.json({ error: "type and format are required" }, { status: 400 });
  }

  const job = await prisma.reportJob.create({
    data: {
      type,
      format,
      filters: filters ? JSON.stringify(filters) : null,
      status: "PENDING",
      createdById: session.user.id,
    },
  });

  // Process the job immediately in the background (simulated)
  processReportJob(job.id).catch(console.error);

  return NextResponse.json({ job }, { status: 201 });
}

async function processReportJob(jobId: string) {
  await prisma.reportJob.update({
    where: { id: jobId },
    data: { status: "PROCESSING", progress: 10 },
  });

  const job = await prisma.reportJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const filters = job.filters ? JSON.parse(job.filters) : {};

  try {
    // Count the total rows for this report type
    let totalRows = 0;
    switch (job.type) {
      case "sales": {
        const where = buildSalesWhere(filters);
        totalRows = await prisma.sale.count({ where });
        break;
      }
      case "commissions": {
        const where = buildCommissionsWhere(filters);
        totalRows = await prisma.commission.count({ where });
        break;
      }
      case "members":
        totalRows = await prisma.user.count({ where: { role: "MEMBER" } });
        break;
      case "payouts":
        totalRows = await prisma.walletTransaction.count({ where: { type: "PAYOUT" } });
        break;
      default:
        totalRows = 0;
    }

    await prisma.reportJob.update({
      where: { id: jobId },
      data: { progress: 50, totalRows },
    });

    // Simulate processing time for large reports
    if (totalRows > 100) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    await prisma.reportJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: 100,
        completedAt: new Date(),
        filePath: `/api/admin/reports?type=${job.type}&limit=${totalRows}&format=${job.format}`,
      },
    });
  } catch (err) {
    await prisma.reportJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      },
    });
  }
}

function buildSalesWhere(filters: Record<string, string>) {
  const where: Record<string, unknown> = {};
  if (filters.dateFrom || filters.dateTo) {
    where.saleDate = {} as Record<string, Date>;
    if (filters.dateFrom) (where.saleDate as Record<string, Date>).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where.saleDate as Record<string, Date>).lte = new Date(filters.dateTo);
  }
  if (filters.memberId) where.memberId = filters.memberId;
  if (filters.status) where.status = filters.status;
  return where;
}

function buildCommissionsWhere(filters: Record<string, string>) {
  const where: Record<string, unknown> = {};
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {} as Record<string, Date>;
    if (filters.dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where.createdAt as Record<string, Date>).lte = new Date(filters.dateTo + "T23:59:59Z");
  }
  if (filters.beneficiaryId) where.beneficiaryId = filters.beneficiaryId;
  if (filters.level) where.level = parseInt(filters.level);
  return where;
}
