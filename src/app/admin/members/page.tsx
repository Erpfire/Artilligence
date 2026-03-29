import { prisma } from "@/lib/db";
import MembersTable from "./MembersTable";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: {
    page?: string;
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortOrder?: string;
  };
}) {
  const page = Math.max(1, parseInt(searchParams.page || "1"));
  const limit = 10;
  const search = searchParams.search?.trim() || "";
  const status = searchParams.status?.trim() || "";
  const dateFrom = searchParams.dateFrom?.trim() || "";
  const dateTo = searchParams.dateTo?.trim() || "";
  const sortBy = searchParams.sortBy?.trim() || "createdAt";
  const sortOrder = searchParams.sortOrder?.trim() === "asc" ? "asc" as const : "desc" as const;

  const where: Record<string, unknown> = { role: "MEMBER" };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { referralCode: { contains: search, mode: "insensitive" } },
    ];
  }

  if (status && ["ACTIVE", "BLOCKED", "DEACTIVATED"].includes(status)) {
    where.status = status;
  }

  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    where.createdAt = createdAt;
  }

  const allowedSorts: Record<string, string> = {
    name: "name",
    email: "email",
    createdAt: "createdAt",
    depth: "depth",
    status: "status",
  };
  const orderField = allowedSorts[sortBy] || "createdAt";

  const [members, total, memberCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [orderField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        depth: true,
        status: true,
        referralCode: true,
        createdAt: true,
        sponsor: { select: { id: true, name: true } },
        _count: { select: { children: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { role: "MEMBER" } }),
  ]);

  // Get downline counts
  const membersWithDownline = await Promise.all(
    members.map(async (m) => {
      const downlineCount = await prisma.user.count({
        where: { path: { contains: m.id }, id: { not: m.id } },
      });
      return { ...m, downlineCount };
    })
  );

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="members-title">
          Members
        </h1>
        {memberCount === 0 && (
          <a
            href="/admin/members/create-root"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
            data-testid="create-root-button"
          >
            Create Root Member
          </a>
        )}
      </div>

      <MembersTable
        members={JSON.parse(JSON.stringify(membersWithDownline))}
        total={total}
        page={page}
        totalPages={totalPages}
        search={search}
        status={status}
        dateFrom={dateFrom}
        dateTo={dateTo}
        sortBy={sortBy}
        sortOrder={sortOrder}
      />
    </div>
  );
}
