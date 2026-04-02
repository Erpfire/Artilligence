import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";

export async function GET() {
  const cwd = process.cwd();
  const uploadsDir = path.join(cwd, "uploads");
  const results: Record<string, unknown> = { cwd, uploadsDir };

  try {
    const s = await stat(uploadsDir);
    results.uploadsExists = true;
    results.uploadsIsDir = s.isDirectory();
    results.uploadsPermissions = s.mode.toString(8);
  } catch (e: unknown) {
    results.uploadsExists = false;
    results.uploadsError = e instanceof Error ? e.message : String(e);
  }

  try {
    const files = await readdir(uploadsDir);
    results.uploadsContents = files;
    if (files.includes("bills")) {
      const billsDir = path.join(uploadsDir, "bills");
      const bills = await readdir(billsDir);
      results.billsContents = bills.slice(0, 10);
      if (bills.length > 0) {
        const firstBill = path.join(billsDir, bills[0]);
        const firstBillFiles = await readdir(firstBill);
        results.firstBillFiles = firstBillFiles;
      }
    }
  } catch (e: unknown) {
    results.readError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}
