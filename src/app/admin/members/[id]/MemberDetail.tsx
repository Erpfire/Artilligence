"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

interface MemberData {
  id: string;
  name: string;
  email: string;
  phone: string;
  depth: number;
  position: number | null;
  path: string;
  status: string;
  referralCode: string;
  createdAt: string;
  updatedAt: string;
  hasCompletedOnboarding: boolean;
  preferredLanguage: string;
  sponsor: { id: string; name: string; email: string; referralCode: string } | null;
  parent: { id: string; name: string; email: string } | null;
  children: { id: string; name: string; email: string; position: number; status: string }[];
  wallet: { totalEarned: string; pending: string; paidOut: string } | null;
  downlineCount: number;
  _count: { sales: number; commissionsEarned: number };
  recentSales: {
    id: string;
    billCode: string;
    totalAmount: string;
    status: string;
    saleDate: string;
  }[];
  recentCommissions: {
    id: string;
    amount: string;
    level: number;
    type: string;
    createdAt: string;
    sale: { billCode: string };
  }[];
}

const statusColor: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  BLOCKED: "bg-red-100 text-red-800",
  DEACTIVATED: "bg-gray-100 text-gray-800",
};

const saleStatusColor: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  RETURNED: "bg-gray-100 text-gray-800",
};

function formatINR(val: string | number) {
  return Number(val).toLocaleString("en-IN", { style: "currency", currency: "INR" });
}

export default function MemberDetail({ member }: { member: MemberData }) {
  const router = useRouter();
  const [blocking, setBlocking] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function toggleBlock() {
    setBlocking(true);
    try {
      const newStatus = member.status === "BLOCKED" ? "ACTIVE" : "BLOCKED";
      const res = await fetch(`/api/admin/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setBlocking(false);
    }
  }

  async function resetPassword() {
    setResettingPassword(true);
    try {
      const res = await fetch(`/api/admin/members/${member.id}/reset-password`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setTempPassword(data.tempPassword);
      }
    } finally {
      setResettingPassword(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin/members"
            className="text-sm text-gray-500 hover:text-gray-700"
            data-testid="back-to-members"
          >
            &larr; Back to Members
          </Link>
          <h1 className="text-2xl font-bold mt-1" data-testid="member-name">
            {member.name}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetPassword}
            disabled={resettingPassword}
            className="rounded-md bg-yellow-100 px-4 py-2 text-sm font-medium text-yellow-800 hover:bg-yellow-200 transition-colors disabled:opacity-50"
            data-testid="reset-password-button"
          >
            {resettingPassword ? "Resetting..." : "Reset Password"}
          </button>
          <button
            onClick={toggleBlock}
            disabled={blocking}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              member.status === "BLOCKED"
                ? "bg-green-100 text-green-800 hover:bg-green-200"
                : "bg-red-100 text-red-800 hover:bg-red-200"
            }`}
            data-testid="block-button"
          >
            {blocking
              ? "..."
              : member.status === "BLOCKED"
              ? "Unblock Member"
              : "Block Member"}
          </button>
        </div>
      </div>

      {/* Temp password alert */}
      {tempPassword && (
        <div
          className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 p-4"
          data-testid="temp-password-alert"
        >
          <p className="font-medium text-yellow-800">Temporary Password Generated</p>
          <p className="mt-1 text-sm text-yellow-700">
            Share this with the member. They will be required to change it on next login.
          </p>
          <p className="mt-2 font-mono text-lg font-bold text-yellow-900" data-testid="temp-password">
            {tempPassword}
          </p>
        </div>
      )}

      {/* Profile + Status cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Profile */}
        <div className="rounded-lg border bg-white p-6 shadow-sm" data-testid="profile-card">
          <h2 className="text-lg font-semibold mb-4">Profile</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Email</dt>
              <dd data-testid="member-email">{member.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Phone</dt>
              <dd data-testid="member-phone">{member.phone}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Referral Code</dt>
              <dd data-testid="member-referral">{member.referralCode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Status</dt>
              <dd>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[member.status]}`} data-testid="member-status">
                  {member.status}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Language</dt>
              <dd>{member.preferredLanguage === "hi" ? "Hindi" : "English"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Joined</dt>
              <dd data-testid="member-joined">{new Date(member.createdAt).toLocaleDateString("en-IN")}</dd>
            </div>
          </dl>
        </div>

        {/* Tree Position */}
        <div className="rounded-lg border bg-white p-6 shadow-sm" data-testid="tree-card">
          <h2 className="text-lg font-semibold mb-4">Tree Position</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Depth</dt>
              <dd data-testid="member-depth">{member.depth}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Position</dt>
              <dd>{member.position ?? "Root"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Sponsor</dt>
              <dd data-testid="member-sponsor">
                {member.sponsor ? (
                  <Link href={`/admin/members/${member.sponsor.id}`} className="text-primary hover:underline">
                    {member.sponsor.name}
                  </Link>
                ) : (
                  "-"
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Parent</dt>
              <dd data-testid="member-parent">
                {member.parent ? (
                  <Link href={`/admin/members/${member.parent.id}`} className="text-primary hover:underline">
                    {member.parent.name}
                  </Link>
                ) : (
                  "-"
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Direct Children</dt>
              <dd>{member.children.length}/3</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Total Downline</dt>
              <dd data-testid="member-downline">{member.downlineCount}</dd>
            </div>
          </dl>
          {member.children.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">CHILDREN</p>
              {member.children.map((child) => (
                <Link
                  key={child.id}
                  href={`/admin/members/${child.id}`}
                  className="block text-sm text-primary hover:underline"
                >
                  {child.name} (Pos {child.position})
                  {child.status === "BLOCKED" && (
                    <span className="ml-1 text-xs text-red-600">[Blocked]</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Wallet */}
        <div className="rounded-lg border bg-white p-6 shadow-sm" data-testid="wallet-card">
          <h2 className="text-lg font-semibold mb-4">Wallet</h2>
          {member.wallet ? (
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Total Earned</dt>
                <dd className="font-medium" data-testid="wallet-earned">
                  {formatINR(member.wallet.totalEarned)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Pending</dt>
                <dd className="font-medium" data-testid="wallet-pending">
                  {formatINR(member.wallet.pending)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Paid Out</dt>
                <dd className="font-medium" data-testid="wallet-paidout">
                  {formatINR(member.wallet.paidOut)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-500" data-testid="no-wallet">No wallet created yet</p>
          )}

          <div className="mt-4 border-t pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Sales</span>
              <span className="font-medium" data-testid="total-sales">{member._count.sales}</span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-gray-500">Commissions Earned</span>
              <span className="font-medium" data-testid="total-commissions">{member._count.commissionsEarned}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="mt-6 rounded-lg border bg-white p-6 shadow-sm" data-testid="recent-sales">
        <h2 className="text-lg font-semibold mb-4">Recent Sales</h2>
        {member.recentSales.length === 0 ? (
          <p className="text-sm text-gray-500">No sales yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Bill Code</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {member.recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="px-4 py-2">{sale.billCode}</td>
                    <td className="px-4 py-2">{formatINR(sale.totalAmount)}</td>
                    <td className="px-4 py-2">{new Date(sale.saleDate).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${saleStatusColor[sale.status] || ""}`}>
                        {sale.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Commissions */}
      <div className="mt-6 rounded-lg border bg-white p-6 shadow-sm" data-testid="recent-commissions">
        <h2 className="text-lg font-semibold mb-4">Recent Commissions</h2>
        {member.recentCommissions.length === 0 ? (
          <p className="text-sm text-gray-500">No commissions yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Sale</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Level</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {member.recentCommissions.map((comm) => (
                  <tr key={comm.id}>
                    <td className="px-4 py-2">{comm.sale.billCode}</td>
                    <td className="px-4 py-2">L{comm.level}</td>
                    <td className="px-4 py-2">{formatINR(comm.amount)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        comm.type === "EARNING" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}>
                        {comm.type}
                      </span>
                    </td>
                    <td className="px-4 py-2">{new Date(comm.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
