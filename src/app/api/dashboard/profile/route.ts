import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      preferredLanguage: true,
      hasCompletedOnboarding: true,
      referralCode: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const response = NextResponse.json(user);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }
    updateData.name = body.name.trim();
  }

  if (body.phone !== undefined) {
    const phone = body.phone.trim();
    if (!/^(\+91)?[6-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }
    // Check for duplicate
    const existing = await prisma.user.findFirst({
      where: { phone, id: { not: session.user.id } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Phone number already in use" },
        { status: 409 }
      );
    }
    updateData.phone = phone;
  }

  if (body.preferredLanguage !== undefined) {
    if (!["en", "hi"].includes(body.preferredLanguage)) {
      return NextResponse.json(
        { error: "Invalid language" },
        { status: 400 }
      );
    }
    updateData.preferredLanguage = body.preferredLanguage;
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      preferredLanguage: true,
      hasCompletedOnboarding: true,
      referralCode: true,
    },
  });

  return NextResponse.json(user);
}
