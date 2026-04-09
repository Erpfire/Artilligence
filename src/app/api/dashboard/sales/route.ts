import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveUploadedFile } from "@/lib/upload";
import { sanitizeText } from "@/lib/sanitize";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // PENDING, APPROVED, REJECTED, RETURNED, or null for all

  const where: Record<string, unknown> = { memberId: session.user.id };
  if (status && ["PENDING", "APPROVED", "REJECTED", "RETURNED"].includes(status)) {
    where.status = status;
  }

  const sales = await prisma.sale.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      saleItems: {
        include: {
          product: {
            select: { id: true, name: true, nameHi: true, price: true },
          },
        },
      },
    },
  });

  return NextResponse.json({
    sales: sales.map((s) => ({
      id: s.id,
      billCode: s.billCode,
      totalAmount: s.totalAmount.toString(),
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      saleDate: s.saleDate.toISOString(),
      billPhotoPath: s.billPhotoPath,
      status: s.status,
      rejectionReason: s.rejectionReason,
      returnReason: s.returnReason,
      createdAt: s.createdAt.toISOString(),
      items: s.saleItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        productNameHi: item.product.nameHi,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        subtotal: item.subtotal.toString(),
      })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Parse multipart form data
  const formData = await request.formData();
  const billCode = formData.get("billCode") as string | null;
  const saleDate = formData.get("saleDate") as string | null;
  const customerName = formData.get("customerName") as string | null;
  const customerPhone = formData.get("customerPhone") as string | null;
  const itemsJson = formData.get("items") as string | null;
  const billPhoto = formData.get("billPhoto") as File | null;

  // --- Validation ---
  const errors: Record<string, string> = {};

  if (!billCode || !billCode.trim()) {
    errors.billCode = "Bill code is required";
  }
  if (!saleDate) {
    errors.saleDate = "Sale date is required";
  } else {
    const saleDateObj = new Date(saleDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (saleDateObj > today) {
      errors.saleDate = "Sale date cannot be in the future";
    }
  }
  if (!customerName || !customerName.trim()) {
    errors.customerName = "Customer name is required";
  } else if (customerName.length > 200) {
    errors.customerName = "Customer name is too long";
  }
  if (!customerPhone || !customerPhone.trim()) {
    errors.customerPhone = "Customer phone is required";
  }
  if (!billPhoto) {
    errors.billPhoto = "Bill photo is required";
  }
  if (billCode && billCode.length > 100) {
    errors.billCode = "Bill code is too long";
  }

  let items: { productId: string; quantity: number; customPrice?: number; remark?: string }[] = [];
  try {
    items = itemsJson ? JSON.parse(itemsJson) : [];
  } catch {
    errors.items = "Invalid items data";
  }
  if (items.length === 0) {
    errors.items = "At least one product is required";
  }

  // Validate item quantities
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      errors.items = "All product quantities must be positive whole numbers";
      break;
    }
    if (item.quantity > 10000) {
      errors.items = "Quantity cannot exceed 10,000";
      break;
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  // --- Bill code validation ---
  // Format check
  const formatSetting = await prisma.appSetting.findUnique({
    where: { key: "bill_code_format" },
  });
  if (formatSetting?.value) {
    try {
      const regex = new RegExp(formatSetting.value);
      if (!regex.test(billCode!)) {
        return NextResponse.json(
          { errors: { billCode: "Bill code format is invalid" } },
          { status: 400 }
        );
      }
    } catch {
      // Invalid regex in settings — skip format check
    }
  }

  // Uniqueness check
  const existingSale = await prisma.sale.findUnique({
    where: { billCode: billCode! },
  });
  if (existingSale) {
    return NextResponse.json(
      { errors: { billCode: "This bill code has already been submitted" } },
      { status: 400 }
    );
  }

  // --- Rate limiting ---
  const now = new Date();

  const dailyLimitSetting = await prisma.appSetting.findUnique({
    where: { key: "daily_sale_limit" },
  });
  const weeklyLimitSetting = await prisma.appSetting.findUnique({
    where: { key: "weekly_sale_limit" },
  });
  const minGapSetting = await prisma.appSetting.findUnique({
    where: { key: "min_sale_gap_minutes" },
  });

  const dailyLimit = parseInt(dailyLimitSetting?.value ?? "10");
  const weeklyLimit = parseInt(weeklyLimitSetting?.value ?? "50");
  const minGapMinutes = parseInt(minGapSetting?.value ?? "5");

  // Daily count
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dailyCount = await prisma.sale.count({
    where: {
      memberId: userId,
      createdAt: { gte: todayStart },
    },
  });
  if (dailyCount >= dailyLimit) {
    return NextResponse.json(
      { errors: { _form: "You've reached the maximum sales submissions for today. Please try again tomorrow." } },
      { status: 429 }
    );
  }

  // Weekly count
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weeklyCount = await prisma.sale.count({
    where: {
      memberId: userId,
      createdAt: { gte: weekAgo },
    },
  });
  if (weeklyCount >= weeklyLimit) {
    return NextResponse.json(
      { errors: { _form: "You've reached the maximum sales submissions for this week." } },
      { status: 429 }
    );
  }

  // Min gap
  const lastSale = await prisma.sale.findFirst({
    where: { memberId: userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastSale) {
    const gapMs = now.getTime() - lastSale.createdAt.getTime();
    const gapMinutes = gapMs / 60000;
    if (gapMinutes < minGapMinutes) {
      return NextResponse.json(
        { errors: { _form: `Please wait ${Math.ceil(minGapMinutes - gapMinutes)} minutes before submitting another sale.` } },
        { status: 429 }
      );
    }
  }

  // --- Validate products and custom orders (before file upload) ---
  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: { id: true, price: true, sku: true },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Verify all products exist
  for (const item of items) {
    if (!productMap.has(item.productId)) {
      return NextResponse.json(
        { errors: { items: `Product not found: ${item.productId}` } },
        { status: 400 }
      );
    }
  }

  // Validate custom order items
  for (const item of items) {
    const product = productMap.get(item.productId)!;
    if (product.sku === "COMBO-CUSTOM") {
      if (!item.customPrice || item.customPrice <= 0) {
        return NextResponse.json(
          { errors: { items: "Custom order requires a valid price" } },
          { status: 400 }
        );
      }
      if (!item.remark || !item.remark.trim()) {
        return NextResponse.json(
          { errors: { items: "Custom order requires a description of included products" } },
          { status: 400 }
        );
      }
    }
  }

  // --- File upload ---
  const fileBuffer = Buffer.from(await billPhoto!.arrayBuffer());
  // We'll save with a temp ID first, then update path
  const saleId = crypto.randomUUID();
  const uploadResult = await saveUploadedFile(fileBuffer, saleId);
  if (!uploadResult.success) {
    return NextResponse.json(
      { errors: { billPhoto: uploadResult.error } },
      { status: 400 }
    );
  }

  let totalAmount = 0;
  const saleItemsData = items.map((item) => {
    const product = productMap.get(item.productId)!;
    // For Custom Order (price=0), use the member-provided custom price
    const unitPrice = product.sku === "COMBO-CUSTOM" && item.customPrice
      ? item.customPrice
      : Number(product.price);
    const subtotal = unitPrice * item.quantity;
    totalAmount += subtotal;
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      subtotal,
      remark: item.remark?.trim() || null,
    };
  });

  // Reject zero-amount sales
  if (totalAmount <= 0) {
    return NextResponse.json(
      { errors: { _form: "Sale total must be greater than zero" } },
      { status: 400 }
    );
  }

  // --- Create sale + items in transaction ---
  const sale = await prisma.$transaction(async (tx) => {
    const newSale = await tx.sale.create({
      data: {
        id: saleId,
        memberId: userId,
        billCode: billCode!,
        totalAmount,
        customerName: sanitizeText(customerName!, 200),
        customerPhone: customerPhone!.trim(),
        saleDate: new Date(saleDate!),
        billPhotoPath: uploadResult.filePath,
        status: "PENDING",
      },
    });

    for (const item of saleItemsData) {
      await tx.saleItem.create({
        data: {
          saleId: newSale.id,
          ...item,
        },
      });
    }

    return newSale;
  });

  // --- Run fraud detection (async, non-blocking — flags don't block submission) ---
  detectAndSaveFlags(sale.id).catch(() => {
    // Fraud detection failure should not affect sale submission
  });

  return NextResponse.json(
    {
      sale: {
        id: sale.id,
        billCode: sale.billCode,
        totalAmount: sale.totalAmount.toString(),
        status: sale.status,
      },
    },
    { status: 201 }
  );
}

async function detectAndSaveFlags(saleId: string) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { member: { select: { createdAt: true } } },
  });
  if (!sale) return;

  const flags: { type: string; severity: "LOW" | "MEDIUM" | "HIGH"; details?: string }[] = [];

  // REPEAT_CUSTOMER
  if (sale.customerName) {
    const sameNameCount = await prisma.sale.groupBy({
      by: ["memberId"],
      where: { customerName: sale.customerName },
      _count: true,
    });
    const totalSalesWithName = await prisma.sale.count({
      where: { customerName: sale.customerName },
    });
    if (totalSalesWithName >= 3 && sameNameCount.length >= 2) {
      flags.push({ type: "REPEAT_CUSTOMER", severity: "MEDIUM", details: `Customer "${sale.customerName}" appears in ${totalSalesWithName} sales across ${sameNameCount.length} members` });
    }
  }

  // REPEAT_PHONE
  if (sale.customerPhone) {
    const samePhoneCount = await prisma.sale.groupBy({
      by: ["memberId"],
      where: { customerPhone: sale.customerPhone },
      _count: true,
    });
    const totalSalesWithPhone = await prisma.sale.count({
      where: { customerPhone: sale.customerPhone },
    });
    if (totalSalesWithPhone >= 3 && samePhoneCount.length >= 2) {
      flags.push({ type: "REPEAT_PHONE", severity: "MEDIUM", details: `Phone "${sale.customerPhone}" appears in ${totalSalesWithPhone} sales across ${samePhoneCount.length} members` });
    }
  }

  // HIGH_AMOUNT
  const avgResult = await prisma.sale.aggregate({
    where: { id: { not: saleId } },
    _avg: { totalAmount: true },
    _count: true,
  });
  if (avgResult._count > 0 && avgResult._avg.totalAmount) {
    const avg = Number(avgResult._avg.totalAmount);
    if (Number(sale.totalAmount) > avg * 2) {
      flags.push({ type: "HIGH_AMOUNT", severity: "LOW", details: `Sale amount is more than 2x the average` });
    }
  }

  // RAPID_SALES
  const oneHourAgo = new Date(sale.createdAt.getTime() - 60 * 60 * 1000);
  const oneHourAhead = new Date(sale.createdAt.getTime() + 60 * 60 * 1000);
  const rapidCount = await prisma.sale.count({
    where: {
      memberId: sale.memberId,
      createdAt: { gte: oneHourAgo, lte: oneHourAhead },
    },
  });
  if (rapidCount >= 3) {
    flags.push({ type: "RAPID_SALES", severity: "HIGH", details: `${rapidCount} sales within 1 hour` });
  }

  // ROUND_NUMBERS
  const amount = Number(sale.totalAmount);
  if (amount > 0 && amount % 10000 === 0) {
    flags.push({ type: "ROUND_NUMBERS", severity: "LOW", details: `Exact round amount` });
  }

  // NEW_MEMBER_HIGH_SALE
  if (sale.member) {
    const ageMs = sale.createdAt.getTime() - sale.member.createdAt.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (ageMs < sevenDaysMs && avgResult._count > 0 && avgResult._avg.totalAmount) {
      const avg = Number(avgResult._avg.totalAmount);
      if (amount > avg) {
        flags.push({ type: "NEW_MEMBER_HIGH_SALE", severity: "MEDIUM", details: `New member (< 7 days) with above-average sale` });
      }
    }
  }

  // Save flags
  if (flags.length > 0) {
    await prisma.saleFlag.createMany({
      data: flags.map((f) => ({
        saleId,
        type: f.type,
        severity: f.severity,
        details: f.details,
      })),
    });
  }
}
