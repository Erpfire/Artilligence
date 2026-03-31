import { prisma } from "@/lib/db";
import CommissionSettingsClient from "./CommissionSettingsClient";

export const dynamic = "force-dynamic";

export default async function CommissionSettingsPage() {
  const [settings, history] = await Promise.all([
    prisma.commissionSetting.findMany({
      orderBy: { level: "asc" },
    }),
    prisma.commissionRateHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold" data-testid="commissions-title">
        Commission Settings
      </h1>
      <p className="mt-1 text-sm text-gray-500" data-testid="commissions-warning">
        Changes apply to future sales only. Existing commissions are never recalculated.
      </p>

      <CommissionSettingsClient
        initialSettings={JSON.parse(
          JSON.stringify(
            settings.map((s) => ({
              id: s.id,
              level: s.level,
              percentage: s.percentage.toString(),
              updatedAt: s.updatedAt.toISOString(),
            }))
          )
        )}
        initialHistory={JSON.parse(
          JSON.stringify(
            history.map((h) => ({
              id: h.id,
              level: h.level,
              oldPercentage: h.oldPercentage?.toString() || null,
              newPercentage: h.newPercentage?.toString() || null,
              action: h.action,
              createdAt: h.createdAt.toISOString(),
            }))
          )
        )}
      />
    </div>
  );
}
