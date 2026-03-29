import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import { prisma } from "./db";

export async function requireAuth(requiredRole?: "ADMIN" | "MEMBER") {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true, role: true },
  });

  if (!user || user.status !== "ACTIVE") {
    redirect("/login?error=blocked");
  }

  if (requiredRole && user.role !== requiredRole) {
    redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return session;
}
