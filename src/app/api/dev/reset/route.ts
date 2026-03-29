import { NextResponse } from "next/server";
import { resetRateLimit } from "@/lib/rate-limit";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  // Reset all rate limits by clearing the module-level map
  // We expose a resetAll function for this
  const { resetAll } = await import("@/lib/rate-limit");
  resetAll();

  return NextResponse.json({ ok: true });
}
