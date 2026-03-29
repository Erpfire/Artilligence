// Factory functions for creating test data
// These produce plain objects matching Prisma model shapes for use in unit tests.

import { Decimal } from "@prisma/client/runtime/library";
import { store } from "@/lib/store";

let counter = 0;
function nextId() {
  counter++;
  return `test-uuid-${counter.toString().padStart(4, "0")}`;
}

export function resetFactoryCounter() {
  counter = 0;
}

// ---- Members ----

export interface MemberData {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
  role: "ADMIN" | "MEMBER";
  sponsorId: string | null;
  parentId: string | null;
  position: number | null;
  depth: number;
  path: string;
  referralCode: string;
  status: "ACTIVE" | "BLOCKED" | "DEACTIVATED";
  preferredLanguage: "en" | "hi";
  hasCompletedOnboarding: boolean;
  registrationIp: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function createMember(overrides: Partial<MemberData> = {}): MemberData {
  const id = overrides.id ?? nextId();
  const member = {
    id,
    email: `member-${id}@test.com`,
    passwordHash: "$2b$12$fakehashfortest",
    name: `Test Member ${id}`,
    phone: `+91${id.replace(/\D/g, "").padStart(10, "0")}`,
    role: "MEMBER",
    sponsorId: null,
    parentId: null,
    position: null,
    depth: 0,
    path: `/${id}`,
    referralCode: `REF-${id}`,
    status: "ACTIVE",
    preferredLanguage: "en",
    hasCompletedOnboarding: true,
    registrationIp: "127.0.0.1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
  store.members.set(member.id, member);
  return member;
}

// ---- Sales ----

export interface SaleData {
  id: string;
  memberId: string;
  billCode: string;
  totalAmount: Decimal;
  customerName: string;
  customerPhone: string | null;
  saleDate: Date;
  billPhotoPath: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "RETURNED";
  rejectionReason: string | null;
  returnReason: string | null;
  returnedAt: Date | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function createSale(overrides: Partial<SaleData> = {}): SaleData {
  const id = overrides.id ?? nextId();
  const sale = {
    id,
    memberId: overrides.memberId ?? nextId(),
    billCode: `MB-${id}`,
    totalAmount: new Decimal("10000.00"),
    customerName: `Customer ${id}`,
    customerPhone: "+919876543210",
    saleDate: new Date("2026-01-15"),
    billPhotoPath: null,
    status: "APPROVED",
    rejectionReason: null,
    returnReason: null,
    returnedAt: null,
    approvedById: null,
    approvedAt: new Date("2026-01-15"),
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
    ...overrides,
  };
  store.sales.set(sale.id, sale);
  return sale;
}

// ---- Wallets ----

export interface WalletData {
  id: string;
  userId: string;
  totalEarned: Decimal;
  pending: Decimal;
  paidOut: Decimal;
  createdAt: Date;
  updatedAt: Date;
}

export function createWallet(overrides: Partial<WalletData> = {}): WalletData {
  const id = overrides.id ?? nextId();
  const wallet = {
    id,
    userId: overrides.userId ?? nextId(),
    totalEarned: new Decimal("0.00"),
    pending: new Decimal("0.00"),
    paidOut: new Decimal("0.00"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
  store.walletsByUserId.set(wallet.userId, wallet);
  return wallet;
}

// ---- Commissions ----

export interface CommissionData {
  id: string;
  saleId: string;
  beneficiaryId: string;
  sourceMemberId: string;
  level: number;
  percentage: Decimal;
  amount: Decimal;
  type: "EARNING" | "REVERSAL";
  createdAt: Date;
}

export function createCommission(
  overrides: Partial<CommissionData> = {}
): CommissionData {
  const id = overrides.id ?? nextId();
  const commission = {
    id,
    saleId: overrides.saleId ?? nextId(),
    beneficiaryId: overrides.beneficiaryId ?? nextId(),
    sourceMemberId: overrides.sourceMemberId ?? nextId(),
    level: 1,
    percentage: new Decimal("10.00"),
    amount: new Decimal("1000.00"),
    type: "EARNING",
    createdAt: new Date("2026-01-15"),
    ...overrides,
  };
  store.commissions.push(commission);
  return commission;
}

// ---- Commission Settings ----

export interface CommissionSettingData {
  id: string;
  level: number;
  percentage: Decimal;
  updatedAt: Date;
}

/** Returns the default 7-level commission settings */
export function createCommissionSettings(): CommissionSettingData[] {
  const rates = [10.0, 6.0, 4.0, 3.0, 2.0, 1.0, 0.5];
  const settings = rates.map((rate, i) => ({
    id: nextId(),
    level: i + 1,
    percentage: new Decimal(rate.toFixed(2)),
    updatedAt: new Date("2026-01-01"),
  }));
  store.commissionSettingsArray = settings;
  return settings;
}

// ---- Wallet Transactions ----

export interface WalletTransactionData {
  id: string;
  walletId: string;
  type: "COMMISSION" | "COMMISSION_REVERSAL" | "PAYOUT" | "ADJUSTMENT";
  amount: Decimal;
  description: string | null;
  referenceId: string | null;
  createdById: string | null;
  createdAt: Date;
}

export function createWalletTransaction(
  overrides: Partial<WalletTransactionData> = {}
): WalletTransactionData {
  const id = overrides.id ?? nextId();
  return {
    id,
    walletId: overrides.walletId ?? nextId(),
    type: "COMMISSION",
    amount: new Decimal("1000.00"),
    description: "Test commission",
    referenceId: null,
    createdById: null,
    createdAt: new Date("2026-01-15"),
    ...overrides,
  };
}

// ---- Notifications ----

export interface NotificationData {
  id: string;
  userId: string;
  title: string;
  titleHi: string | null;
  body: string | null;
  bodyHi: string | null;
  isRead: boolean;
  createdAt: Date;
}

export function createNotification(
  overrides: Partial<NotificationData> = {}
): NotificationData {
  const id = overrides.id ?? nextId();
  return {
    id,
    userId: overrides.userId ?? nextId(),
    title: "Test notification",
    titleHi: null,
    body: null,
    bodyHi: null,
    isRead: false,
    createdAt: new Date("2026-01-15"),
    ...overrides,
  };
}

// ---- App Settings ----

export interface AppSettingData {
  key: string;
  value: string;
  updatedAt: Date;
}

export function createAppSetting(
  overrides: Partial<AppSettingData> & { key: string } = { key: "default_key" }
): AppSettingData {
  const setting = {
    key: overrides.key,
    value: "0",
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
  store.appSettings.set(setting.key, setting);
  return setting;
}

// ---- Tree Builders ----

/**
 * Build a linear chain of members: root → child1 → child2 → ...
 * Returns array where index 0 is root, index 1 is child, etc.
 */
export function buildMemberChain(length: number): MemberData[] {
  const members: MemberData[] = [];
  for (let i = 0; i < length; i++) {
    const id = nextId();
    const parent = members[i - 1] ?? null;
    members.push(
      createMember({
        id,
        parentId: parent?.id ?? null,
        sponsorId: parent?.id ?? null,
        position: parent ? 1 : null,
        depth: i,
        path: parent ? `${parent.path}/${id}` : `/${id}`,
      })
    );
  }
  return members;
}
