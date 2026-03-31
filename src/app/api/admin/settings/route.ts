import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

const SETTING_DEFINITIONS: Record<string, { label: string; type: "number" | "string"; section: string }> = {
  daily_sale_limit: { label: "Max sales per day", type: "number", section: "fraud" },
  weekly_sale_limit: { label: "Max sales per week", type: "number", section: "fraud" },
  min_sale_gap_minutes: { label: "Min gap between sales (minutes)", type: "number", section: "fraud" },
  bill_code_format: { label: "Bill code format (regex)", type: "string", section: "fraud" },
  ghost_member_inactive_days: { label: "Inactive days for ghost flag", type: "number", section: "fraud" },
  company_name: { label: "Company name", type: "string", section: "company" },
};

// GET /api/admin/settings — list all app settings
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.appSetting.findMany();

  const settingsMap: Record<string, string> = {};
  for (const s of settings) {
    settingsMap[s.key] = s.value;
  }

  return NextResponse.json({
    settings: settingsMap,
    definitions: SETTING_DEFINITIONS,
  });
}

// PUT /api/admin/settings — save all settings
export async function PUT(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { settings } = body as { settings: Record<string, string> };

  if (!settings || typeof settings !== "object") {
    return NextResponse.json(
      { error: "Settings object is required" },
      { status: 400 }
    );
  }

  // Validate known settings
  for (const [key, value] of Object.entries(settings)) {
    const def = SETTING_DEFINITIONS[key];
    if (!def) continue;

    if (def.type === "number" && value !== "") {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        return NextResponse.json(
          { error: `${def.label} must be a valid non-negative number` },
          { status: 400 }
        );
      }
    }
  }

  // Get current settings for audit trail
  const currentSettings = await prisma.appSetting.findMany();
  const currentMap: Record<string, string> = {};
  for (const s of currentSettings) {
    currentMap[s.key] = s.value;
  }

  // Upsert each setting
  const changes: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    if (!SETTING_DEFINITIONS[key]) continue;

    const oldValue = currentMap[key];
    if (oldValue !== value) {
      changes.push(`${key}: "${oldValue || "(empty)"}" -> "${value}"`);
    }

    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  // Audit log only if there were actual changes
  if (changes.length > 0) {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "APP_SETTINGS_UPDATED",
        entity: "AppSetting",
        details: changes.join("; "),
      },
    });
  }

  return NextResponse.json({ success: true });
}
