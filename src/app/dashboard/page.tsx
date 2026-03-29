import { requireAuth } from "@/lib/auth-check";
import { prisma } from "@/lib/db";
import DashboardHome from "./DashboardHome";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { replay_onboarding?: string };
}) {
  const session = await requireAuth("MEMBER");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hasCompletedOnboarding: true },
  });

  const showOnboarding =
    !user?.hasCompletedOnboarding || searchParams.replay_onboarding === "1";

  // If replaying, reset the flag so driver.js runs again
  if (searchParams.replay_onboarding === "1" && user?.hasCompletedOnboarding) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { hasCompletedOnboarding: false },
    });
  }

  return <DashboardHome showOnboarding={showOnboarding} />;
}
