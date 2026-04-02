import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sanitizeText } from "@/lib/sanitize";
import { saveKycFile } from "@/lib/upload";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

// GET /api/admin/members/[id] — member detail
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
        select: {
          sales: true,
          commissionsEarned: true,
        },
      },
    },
  });

  if (!member || member.role !== "MEMBER") {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Get downline count
  const downlineCount = await prisma.user.count({
    where: {
      path: { contains: member.id },
      id: { not: member.id },
    },
  });

  // Get recent sales
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

  // Get recent commissions
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
      sale: {
        select: { billCode: true },
      },
    },
  });

  return NextResponse.json({
    member: {
      ...member,
      downlineCount,
      recentSales: JSON.parse(JSON.stringify(recentSales)),
      recentCommissions: JSON.parse(JSON.stringify(recentCommissions)),
    },
  });
}

// PUT /api/admin/members/[id] — edit member profile & KYC
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || existing.role !== "MEMBER") {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const formData = await request.formData();

  const name = formData.get("name") as string | null;
  const email = formData.get("email") as string | null;
  const phone = formData.get("phone") as string | null;
  const preferredLanguage = formData.get("preferredLanguage") as string | null;
  const aadharNumber = (formData.get("aadharNumber") as string | null)?.trim() || null;
  const panNumber = (formData.get("panNumber") as string | null)?.trim().toUpperCase() || null;
  const bankAccountNumber = (formData.get("bankAccountNumber") as string | null)?.trim() || null;
  const bankIfscCode = (formData.get("bankIfscCode") as string | null)?.trim().toUpperCase() || null;
  const bankName = (formData.get("bankName") as string | null)?.trim() || null;

  const aadharFile = formData.get("aadharFile") as File | null;
  const panFile = formData.get("panFile") as File | null;
  const passportPhoto = formData.get("passportPhoto") as File | null;

  const errors: Array<{ field: string; message: string }> = [];

  if (!name?.trim()) errors.push({ field: "name", message: "Name is required" });
  if (!email?.trim()) errors.push({ field: "email", message: "Email is required" });
  if (!phone?.trim()) errors.push({ field: "phone", message: "Phone is required" });

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ field: "email", message: "Invalid email format" });
  }

  const phoneDigits = phone?.replace(/\D/g, "").slice(-10) || "";
  if (phoneDigits && !/^[6-9]\d{9}$/.test(phoneDigits)) {
    errors.push({ field: "phone", message: "Phone must be 10 digits starting with 6-9" });
  }

  if (aadharNumber && !/^\d{12}$/.test(aadharNumber)) {
    errors.push({ field: "aadharNumber", message: "Aadhar number must be 12 digits" });
  }

  if (panNumber && !/^[A-Z]{5}\d{4}[A-Z]$/.test(panNumber)) {
    errors.push({ field: "panNumber", message: "Invalid PAN format (e.g. ABCDE1234F)" });
  }

  if (bankAccountNumber && (bankAccountNumber.length < 9 || bankAccountNumber.length > 18)) {
    errors.push({ field: "bankAccountNumber", message: "Bank account number must be 9-18 digits" });
  }

  if (bankIfscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfscCode)) {
    errors.push({ field: "bankIfscCode", message: "Invalid IFSC code format" });
  }

  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const normalizedPhone = "+91" + phoneDigits;

  // Check email uniqueness (excluding current member)
  if (email !== existing.email) {
    const emailTaken = await prisma.user.findFirst({
      where: { email: email!, id: { not: existing.id } },
    });
    if (emailTaken) {
      return NextResponse.json({ errors: [{ field: "email", message: "Email already in use" }] }, { status: 400 });
    }
  }

  // Check phone uniqueness (excluding current member)
  if (normalizedPhone !== existing.phone) {
    const phoneTaken = await prisma.user.findFirst({
      where: { phone: normalizedPhone, id: { not: existing.id } },
    });
    if (phoneTaken) {
      return NextResponse.json({ errors: [{ field: "phone", message: "Phone already in use" }] }, { status: 400 });
    }
  }

  // Handle file uploads
  const fileUpdates: Record<string, string> = {};

  if (aadharFile && aadharFile.size > 0) {
    const buffer = Buffer.from(await aadharFile.arrayBuffer());
    const result = await saveKycFile(buffer, existing.id, "aadhar");
    if (result.success) fileUpdates.aadharFilePath = result.filePath;
  }

  if (panFile && panFile.size > 0) {
    const buffer = Buffer.from(await panFile.arrayBuffer());
    const result = await saveKycFile(buffer, existing.id, "pan");
    if (result.success) fileUpdates.panFilePath = result.filePath;
  }

  if (passportPhoto && passportPhoto.size > 0) {
    const buffer = Buffer.from(await passportPhoto.arrayBuffer());
    const result = await saveKycFile(buffer, existing.id, "passport-photo");
    if (result.success) fileUpdates.passportPhotoPath = result.filePath;
  }

  const member = await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: sanitizeText(name!, 100),
      email: email!,
      phone: normalizedPhone,
      preferredLanguage: preferredLanguage === "hi" ? "hi" : "en",
      aadharNumber,
      panNumber,
      bankAccountNumber,
      bankIfscCode,
      bankName: bankName ? sanitizeText(bankName, 100) : null,
      ...fileUpdates,
    },
    select: { id: true, name: true, email: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "MEMBER_UPDATED",
      entity: "User",
      entityId: member.id,
      details: `Updated member profile: ${member.name} (${member.email})`,
    },
  });

  return NextResponse.json({ member });
}

// PATCH /api/admin/members/[id] — block/unblock
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || existing.role !== "MEMBER") {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const body = await request.json();
  const { status } = body;

  if (!status || !["ACTIVE", "BLOCKED"].includes(status)) {
    return NextResponse.json({ error: "Status must be ACTIVE or BLOCKED" }, { status: 400 });
  }

  if (status === existing.status) {
    return NextResponse.json({ error: `Member is already ${status}` }, { status: 400 });
  }

  const member = await prisma.user.update({
    where: { id: params.id },
    data: { status },
    select: { id: true, name: true, email: true, status: true },
  });

  const action = status === "BLOCKED" ? "MEMBER_BLOCKED" : "MEMBER_UNBLOCKED";
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action,
      entity: "User",
      entityId: member.id,
      details: `${status === "BLOCKED" ? "Blocked" : "Unblocked"} member: ${member.name} (${member.email})`,
    },
  });

  return NextResponse.json({ member });
}
