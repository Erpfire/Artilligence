import { prisma } from "@/lib/db";

export default async function AdminDashboardPage() {
  const [totalProducts, activeProducts, totalMembers, totalSales] =
    await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: "MEMBER" } }),
      prisma.sale.count(),
    ]);

  const stats = [
    { label: "Total Products", value: totalProducts, testId: "stat-total-products" },
    { label: "Active Products", value: activeProducts, testId: "stat-active-products" },
    { label: "Total Members", value: totalMembers, testId: "stat-total-members" },
    { label: "Total Sales", value: totalSales, testId: "stat-total-sales" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold" data-testid="dashboard-title">
        Admin Dashboard
      </h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.testId}
            className="rounded-lg border bg-white p-6 shadow-sm"
            data-testid={stat.testId}
          >
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-1 text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
