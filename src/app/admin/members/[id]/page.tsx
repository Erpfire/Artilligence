import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import MemberDetail from "./MemberDetail";

export default async function MemberDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const member = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      depth: true,
      position: true,
      path: true,
      status: true,
      referralCode: true,
      createdAt: true,
      updatedAt: true,
      hasCompletedOnboarding: true,
      preferredLanguage: true,
      aadharNumber: true,
      aadharFilePath: true,
      panNumber: true,
      panFilePath: true,
      passportPhotoPath: true,
      bankAccountNumber: true,
      bankIfscCode: true,
      bankName: true,
      sponsor: {
        select: { id: true, name: true, email: true, referralCode: true },
      },
      parent: {
        select: { id: true, name: true, email: true },
      },
      children: {
        select: { id: true, name: true, email: true, position: true, status: true },
        orderBy: { position: "asc" },
      },
      wallet: {
        select: { totalEarned: true, pending: true, paidOut: true },
      },
      _count: {
        select: { sales: true, commissionsEarned: true },
      },
    },
  });

  if (!member || member.role !== "MEMBER") {
    notFound();
  }

  const downlineCount = await prisma.user.count({
    where: { path: { contains: member.id }, id: { not: member.id } },
  });

  const recentSales = await prisma.sale.findMany({
    where: { memberId: member.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      billCode: true,
      totalAmount: true,
      status: true,
      saleDate: true,
    },
  });

  const recentCommissions = await prisma.commission.findMany({
    where: { beneficiaryId: member.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      amount: true,
      level: true,
      type: true,
      createdAt: true,
      sale: { select: { billCode: true } },
    },
  });

  const data = {
    ...member,
    downlineCount,
    recentSales,
    recentCommissions,
  };

  return <MemberDetail member={JSON.parse(JSON.stringify(data))} />;
}
