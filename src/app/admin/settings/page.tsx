import { prisma } from "@/lib/db";
import AppSettingsClient from "./AppSettingsClient";

export const dynamic = "force-dynamic";

export default async function AppSettingsPage() {
  const settings = await prisma.appSetting.findMany();

  const settingsMap: Record<string, string> = {};
  for (const s of settings) {
    settingsMap[s.key] = s.value;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold" data-testid="settings-title">
        App Settings
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Configure fraud prevention, company details, and other application settings.
      </p>

      <AppSettingsClient initialSettings={settingsMap} />
    </div>
  );
}
