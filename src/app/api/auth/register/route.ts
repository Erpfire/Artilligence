import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { saveKycFile } from "@/lib/upload";

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit registration by IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rateCheck = checkRateLimit(`register:${ip}`, "register");
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { errors: [{ field: "general", message: "Too many registration attempts. Please try again later." }] },
        { status: 429 }
      );
    }

    const formData = await req.formData();

    const email = formData.get("email") as string | null;
    const phone = formData.get("phone") as string | null;
    const password = formData.get("password") as string | null;
    const confirmPassword = formData.get("confirmPassword") as string | null;
    const referralCode = formData.get("referralCode") as string | null;
    const preferredLanguage = formData.get("preferredLanguage") as string | null;
    const rawName = formData.get("name") as string | null;
    const name = rawName ? sanitizeText(rawName, 100) : "";

    // Optional KYC fields
    const aadharNumber = (formData.get("aadharNumber") as string | null)?.trim() || null;
    const panNumber = (formData.get("panNumber") as string | null)?.trim().toUpperCase() || null;
    const bankAccountNumber = (formData.get("bankAccountNumber") as string | null)?.trim() || null;
    const bankIfscCode = (formData.get("bankIfscCode") as string | null)?.trim().toUpperCase() || null;
    const bankName = (formData.get("bankName") as string | null)?.trim() || null;

    // Optional file uploads
    const aadharFile = formData.get("aadharFile") as File | null;
    const panFile = formData.get("panFile") as File | null;
    const passportPhoto = formData.get("passportPhoto") as File | null;

    // Basic validation
    const errors: Array<{ field: string; message: string }> = [];

    if (!name) errors.push({ field: "name", message: "Name is required" });
    if (!email?.trim()) errors.push({ field: "email", message: "Email is required" });
    if (!phone?.trim()) errors.push({ field: "phone", message: "Phone is required" });
    if (!password) errors.push({ field: "password", message: "Password is required" });

    // Length validation
    if (name && name.length > 100) errors.push({ field: "name", message: "Name must be 100 characters or less" });
    if (email && email.length > 255) errors.push({ field: "email", message: "Email is too long" });
    if (password && password.length > 128) errors.push({ field: "password", message: "Password is too long" });

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: "email", message: "Invalid email format" });
    }

    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      errors.push({ field: "phone", message: "Phone must be 10 digits starting with 6-9" });
    }

    if (password && password.length < 8) {
      errors.push({ field: "password", message: "Password must be at least 8 characters" });
    }

    if (password && confirmPassword && password !== confirmPassword) {
      errors.push({ field: "confirmPassword", message: "Passwords do not match" });
    }

    // Optional KYC validation
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

    // Find sponsor
    const sponsor = await prisma.user.findUnique({
      where: { referralCode: referralCode! },
      select: { id: true, email: true, phone: true, status: true },
    });

    if (!sponsor) {
      return NextResponse.json(
        { errors: [{ field: "referralCode", message: "Invalid referral code" }] },
        { status: 400 }
      );
    }

    if (sponsor.status === "BLOCKED" || sponsor.status === "DEACTIVATED") {
      return NextResponse.json(
        { errors: [{ field: "referralCode", message: "Referral link no longer active" }] },
        { status: 400 }
      );
    }

    // Self-referral prevention
    if (sponsor.email === email) {
      return NextResponse.json(
        { errors: [{ field: "email", message: "Cannot use own referral code" }] },
        { status: 400 }
      );
    }

    const normalizedPhone = "+91" + phone!.replace(/\D/g, "").slice(-10);
    if (sponsor.phone === normalizedPhone) {
      return NextResponse.json(
        { errors: [{ field: "phone", message: "Cannot use own referral code" }] },
        { status: 400 }
      );
    }

    // Duplicate checks
    const existingEmail = await prisma.user.findUnique({ where: { email: email! } });
    if (existingEmail) {
      return NextResponse.json(
        { errors: [{ field: "email", message: "Email already registered" }] },
        { status: 400 }
      );
    }

    const existingPhone = await prisma.user.findFirst({ where: { phone: normalizedPhone } });
    if (existingPhone) {
      return NextResponse.json(
        { errors: [{ field: "phone", message: "Phone already registered" }] },
        { status: 400 }
      );
    }

    // Hash password (outside transaction for performance)
    const passwordHash = await bcrypt.hash(password!, 12);

    // Generate unique referral code
    let newReferralCode = generateReferralCode();
    while (await prisma.user.findUnique({ where: { referralCode: newReferralCode } })) {
      newReferralCode = generateReferralCode();
    }

    // Create user + wallet in a transaction with row locking to prevent concurrent position conflicts
    // Retry up to 3 times in case of lock contention from concurrent registrations
    let user;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        user = await prisma.$transaction(async (tx) => {
          // BFS placement INSIDE the transaction with row locking
          const placement = await findPlacementPositionWithLock(tx, sponsor.id);

          const newUser = await tx.user.create({
            data: {
              email: email!,
              passwordHash,
              name,
              phone: normalizedPhone,
              role: "MEMBER",
              sponsorId: sponsor.id,
              parentId: placement.parentId,
              position: placement.position,
              depth: placement.depth,
              path: placement.path,
              referralCode: newReferralCode,
              preferredLanguage: preferredLanguage === "hi" ? "hi" : "en",
              registrationIp: ip,
              aadharNumber,
              panNumber,
              bankAccountNumber,
              bankIfscCode,
              bankName: bankName ? sanitizeText(bankName, 100) : null,
            },
          });

          // Update path with actual user ID
          const correctPath = placement.path.replace(/[^/]+$/, newUser.id);
          await tx.user.update({
            where: { id: newUser.id },
            data: { path: correctPath },
          });

          // Create wallet
          await tx.wallet.create({
            data: { userId: newUser.id },
          });

          return newUser;
        }, {
          timeout: 15000,
        });
        break; // Success — exit retry loop
      } catch (txError: any) {
        if (attempt === 2) throw txError; // Last attempt — rethrow
        // Wait a bit before retrying (back off)
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }

    // Save KYC files after user is created (need the userId for file paths)
    const fileUpdates: Record<string, string> = {};

    if (aadharFile && aadharFile.size > 0) {
      const buffer = Buffer.from(await aadharFile.arrayBuffer());
      const result = await saveKycFile(buffer, user!.id, "aadhar");
      if (result.success) fileUpdates.aadharFilePath = result.filePath;
    }

    if (panFile && panFile.size > 0) {
      const buffer = Buffer.from(await panFile.arrayBuffer());
      const result = await saveKycFile(buffer, user!.id, "pan");
      if (result.success) fileUpdates.panFilePath = result.filePath;
    }

    if (passportPhoto && passportPhoto.size > 0) {
      const buffer = Buffer.from(await passportPhoto.arrayBuffer());
      const result = await saveKycFile(buffer, user!.id, "passport-photo");
      if (result.success) fileUpdates.passportPhotoPath = result.filePath;
    }

    if (Object.keys(fileUpdates).length > 0) {
      await prisma.user.update({
        where: { id: user!.id },
        data: fileUpdates,
      });
    }

    // Notify sponsor about new team member
    await prisma.notification.create({
      data: {
        userId: sponsor.id,
        title: `New team member: ${name}`,
        titleHi: `नया टीम सदस्य: ${name}`,
        body: `${name} has joined your team using your referral link.`,
        bodyHi: `${name} आपकी रेफरल लिंक से आपकी टीम में शामिल हो गए हैं।`,
        link: "/dashboard/team",
      },
    });

    // IP-based fraud flagging
    if (ip) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentFromIp = await prisma.user.count({
        where: { registrationIp: ip, createdAt: { gte: dayAgo } },
      });
      if (recentFromIp >= 3) {
        // Flag for review — not blocking
        console.warn(`Multiple registrations from IP ${ip}: ${recentFromIp} in 24h`);
      }
    }

    return NextResponse.json({ success: true, userId: user!.id }, { status: 201 });
  } catch (error: any) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { errors: [{ field: "general", message: "Registration failed. Please try again." }] },
      { status: 500 }
    );
  }
}

// BFS tree placement with row locking inside a transaction
async function findPlacementPositionWithLock(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  sponsorId: string
) {
  // Lock the sponsor row to prevent concurrent placements
  const sponsorRows = await tx.$queryRaw<Array<{ id: string; depth: number; path: string }>>`
    SELECT id, depth, path FROM users WHERE id = ${sponsorId} FOR UPDATE
  `;
  if (sponsorRows.length === 0) throw new Error("Sponsor not found");
  const sponsor = sponsorRows[0];

  const queue = [sponsor];

  while (queue.length > 0) {
    const node = queue.shift()!;
    // Lock child rows to prevent concurrent inserts at the same position
    const children = await tx.$queryRaw<Array<{ id: string; depth: number; path: string; position: number }>>`
      SELECT id, depth, path, position FROM users WHERE parent_id = ${node.id} ORDER BY position ASC FOR UPDATE
    `;

    if (children.length < 3) {
      const position = children.length + 1;
      const depth = node.depth + 1;
      const path = `${node.path}/placeholder`;
      return { parentId: node.id, position, depth, path };
    }

    queue.push(...children);
  }

  throw new Error("No available position found");
}
