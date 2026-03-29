import { requireAuth } from "@/lib/auth-check";
import { prisma } from "@/lib/db";
import LanguageProvider from "@/components/LanguageProvider";
import DashboardShell from "./DashboardShell";
import type { Locale } from "@/lib/i18n";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth("MEMBER");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { preferredLanguage: true, hasCompletedOnboarding: true },
  });

  const locale = (user?.preferredLanguage || "en") as Locale;

  return (
    <LanguageProvider initialLocale={locale}>
      <DashboardShell userName={session.user.name || "Member"}>
        {children}
      </DashboardShell>
    </LanguageProvider>
  );
}
