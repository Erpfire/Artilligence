// Fraud detection engine

import { Decimal } from "@prisma/client/runtime/library";
import { store } from "./store";

export async function detectSaleFlags(saleId: string) {
  const sale = store.sales.get(saleId);
  if (!sale) throw new Error("Sale not found");

  const flags: Array<{ type: string; severity: string; details?: string }> = [];
  const allSales = Array.from(store.sales.values());

  // 1. REPEAT_CUSTOMER: same name in 3+ sales across 2+ different members
  if (sale.customerName) {
    const sameName = allSales.filter((s: any) => s.customerName === sale.customerName);
    const distinctMembers = new Set(sameName.map((s: any) => s.memberId));
    if (sameName.length >= 3 && distinctMembers.size >= 2) {
      flags.push({ type: "REPEAT_CUSTOMER", severity: "MEDIUM" });
    }
  }

  // 2. REPEAT_PHONE: same phone in 3+ sales across 2+ different members
  if (sale.customerPhone) {
    const samePhone = allSales.filter((s: any) => s.customerPhone === sale.customerPhone);
    const distinctMembers = new Set(samePhone.map((s: any) => s.memberId));
    if (samePhone.length >= 3 && distinctMembers.size >= 2) {
      flags.push({ type: "REPEAT_PHONE", severity: "MEDIUM" });
    }
  }

  // 3. HIGH_AMOUNT: sale > 2x average of all other sales
  const otherSales = allSales.filter((s: any) => s.id !== saleId);
  if (otherSales.length > 0) {
    const total = otherSales.reduce(
      (sum: Decimal, s: any) => sum.add(s.totalAmount),
      new Decimal("0")
    );
    const average = total.div(otherSales.length);
    if (sale.totalAmount.gt(average.mul(2))) {
      flags.push({ type: "HIGH_AMOUNT", severity: "LOW" });
    }
  }

  // 4. RAPID_SALES: 3+ sales from same member within 1 hour of target sale
  const saleTime = sale.createdAt.getTime();
  const memberSalesInHour = allSales.filter((s: any) => {
    if (s.memberId !== sale.memberId) return false;
    return Math.abs(saleTime - s.createdAt.getTime()) <= 60 * 60 * 1000;
  });
  if (memberSalesInHour.length >= 3) {
    flags.push({ type: "RAPID_SALES", severity: "HIGH" });
  }

  // 5. ROUND_NUMBERS: exact multiples of ₹10,000
  const amountNum = parseFloat(sale.totalAmount.toString());
  if (amountNum > 0 && amountNum % 10000 === 0) {
    flags.push({ type: "ROUND_NUMBERS", severity: "LOW" });
  }

  // 6. NEW_MEMBER_HIGH_SALE: member < 7 days old + sale above average
  const member = store.members.get(sale.memberId);
  if (member && otherSales.length > 0) {
    const ageMs = sale.createdAt.getTime() - member.createdAt.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (ageMs < sevenDaysMs) {
      const total = otherSales.reduce(
        (sum: Decimal, s: any) => sum.add(s.totalAmount),
        new Decimal("0")
      );
      const average = total.div(otherSales.length);
      if (sale.totalAmount.gt(average)) {
        flags.push({ type: "NEW_MEMBER_HIGH_SALE", severity: "MEDIUM" });
      }
    }
  }

  return flags;
}

export async function checkRateLimit(memberId: string) {
  const now = new Date();

  // Read configurable limits from app_settings
  const dailyLimit = parseInt(
    store.appSettings.get("rate_limit_daily")?.value ?? "5"
  );
  const weeklyLimit = parseInt(
    store.appSettings.get("rate_limit_weekly")?.value ?? "20"
  );
  const minGapMinutes = parseInt(
    store.appSettings.get("rate_limit_min_gap")?.value ?? "5"
  );

  const memberSales = Array.from(store.sales.values())
    .filter((s: any) => s.memberId === memberId)
    .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());

  // Check daily limit: count sales on the same calendar day (UTC)
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const todaySales = memberSales.filter((s: any) => {
    const t = s.createdAt.getTime();
    return t >= todayStart.getTime() && t < todayEnd.getTime();
  });

  if (todaySales.length >= dailyLimit) {
    return { allowed: false, message: "Daily sale limit reached" };
  }

  // Check weekly limit: sales within last 7 calendar days
  const weekAgo = new Date(now);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

  const weeklySales = memberSales.filter(
    (s: any) => s.createdAt.getTime() >= weekAgo.getTime()
  );

  if (weeklySales.length >= weeklyLimit) {
    return { allowed: false, message: "Weekly sale limit reached" };
  }

  // Check min gap: most recent sale must be > minGapMinutes ago
  if (memberSales.length > 0) {
    const lastSale = memberSales[0];
    const gapMs = now.getTime() - lastSale.createdAt.getTime();
    const gapMinutes = gapMs / 60000;
    if (gapMinutes > 0 && gapMinutes < minGapMinutes) {
      return {
        allowed: false,
        message: `Please wait ${Math.ceil(minGapMinutes - gapMinutes)} minutes between sales`,
      };
    }
  }

  return { allowed: true };
}

export async function validateBillCode(
  billCode: string,
  formatRegex: string | null
) {
  // 1. Format validation
  if (formatRegex !== null) {
    const regex = new RegExp(formatRegex);
    if (!regex.test(billCode)) {
      return { valid: false, error: "Bill code format is invalid" };
    }
  }

  // 2. Exact duplicate check
  const existingSales = Array.from(store.sales.values());
  const duplicate = existingSales.find((s: any) => s.billCode === billCode);
  if (duplicate) {
    return { valid: false, error: "Bill code already submitted" };
  }

  // 3. Similar bill code check (Levenshtein distance < 2)
  for (const s of existingSales) {
    if (levenshtein(billCode, s.billCode) < 2) {
      return { valid: true, warning: `Similar bill code found: ${s.billCode}` };
    }
  }

  return { valid: true };
}

function levenshtein(a: string, b: string): number {
  const m: number[][] = [];
  for (let i = 0; i <= a.length; i++) m[i] = [i];
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        m[i][j] = m[i - 1][j - 1];
      } else {
        m[i][j] = Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
      }
    }
  }
  return m[a.length][b.length];
}
