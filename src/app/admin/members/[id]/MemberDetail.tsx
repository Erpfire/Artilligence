"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
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
  aadharNumber: string | null;
  aadharFilePath: string | null;
  panNumber: string | null;
  panFilePath: string | null;
  passportPhotoPath: string | null;
  bankAccountNumber: string | null;
  bankIfscCode: string | null;
  bankName: string | null;
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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<Array<{ field: string; message: string }>>([]);

  const [editForm, setEditForm] = useState({
    name: member.name,
    email: member.email,
    phone: member.phone.replace("+91", ""),
    preferredLanguage: member.preferredLanguage,
    aadharNumber: member.aadharNumber || "",
    panNumber: member.panNumber || "",
    bankAccountNumber: member.bankAccountNumber || "",
    bankIfscCode: member.bankIfscCode || "",
    bankName: member.bankName || "",
  });

  const aadharFileRef = useRef<HTMLInputElement>(null);
  const panFileRef = useRef<HTMLInputElement>(null);
  const passportPhotoRef = useRef<HTMLInputElement>(null);

  function getEditError(field: string) {
    return editErrors.find((e) => e.field === field)?.message;
  }

  function handleEditChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setEditForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setEditErrors((prev) => prev.filter((err) => err.field !== e.target.name));
  }

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

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEditErrors([]);
    setSaving(true);

    try {
      const formData = new FormData();
      formData.append("name", editForm.name);
      formData.append("email", editForm.email);
      formData.append("phone", editForm.phone);
      formData.append("preferredLanguage", editForm.preferredLanguage);
      if (editForm.aadharNumber) formData.append("aadharNumber", editForm.aadharNumber);
      if (editForm.panNumber) formData.append("panNumber", editForm.panNumber);
      if (editForm.bankAccountNumber) formData.append("bankAccountNumber", editForm.bankAccountNumber);
      if (editForm.bankIfscCode) formData.append("bankIfscCode", editForm.bankIfscCode);
      if (editForm.bankName) formData.append("bankName", editForm.bankName);

      const aadharFile = aadharFileRef.current?.files?.[0];
      if (aadharFile) formData.append("aadharFile", aadharFile);

      const panFile = panFileRef.current?.files?.[0];
      if (panFile) formData.append("panFile", panFile);

      const passportPhoto = passportPhotoRef.current?.files?.[0];
      if (passportPhoto) formData.append("passportPhoto", passportPhoto);

      const res = await fetch(`/api/admin/members/${member.id}`, {
        method: "PUT",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setEditErrors(data.errors || [{ field: "general", message: "Update failed" }]);
        return;
      }

      setEditing(false);
      router.refresh();
    } catch {
      setEditErrors([{ field: "general", message: "Something went wrong" }]);
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none";

  const hasKycData = member.aadharNumber || member.panNumber || member.passportPhotoPath ||
    member.bankAccountNumber || member.aadharFilePath || member.panFilePath;

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
            onClick={() => {
              setEditing(!editing);
              setEditErrors([]);
            }}
            className="rounded-md bg-blue-100 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-200 transition-colors"
            data-testid="edit-member-button"
          >
            {editing ? "Cancel Edit" : "Edit Member"}
          </button>
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

      {/* Edit Form */}
      {editing && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-6" data-testid="edit-form">
          <h2 className="text-lg font-semibold mb-4">Edit Member Information</h2>

          {getEditError("general") && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {getEditError("general")}
            </div>
          )}

          <form onSubmit={handleEditSubmit} className="space-y-6">
            {/* Basic Info */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Basic Information</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-name" className="mb-1 block text-sm text-gray-600">Name</label>
                  <input id="edit-name" name="name" value={editForm.name} onChange={handleEditChange}
                    required className={inputClass} data-testid="edit-name" />
                  {getEditError("name") && <p className="mt-1 text-xs text-red-600">{getEditError("name")}</p>}
                </div>
                <div>
                  <label htmlFor="edit-email" className="mb-1 block text-sm text-gray-600">Email</label>
                  <input id="edit-email" name="email" type="email" value={editForm.email} onChange={handleEditChange}
                    required className={inputClass} data-testid="edit-email" />
                  {getEditError("email") && <p className="mt-1 text-xs text-red-600">{getEditError("email")}</p>}
                </div>
                <div>
                  <label htmlFor="edit-phone" className="mb-1 block text-sm text-gray-600">Phone</label>
                  <div className="flex">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-100 px-3 text-sm text-gray-500">+91</span>
                    <input id="edit-phone" name="phone" value={editForm.phone} onChange={handleEditChange}
                      required maxLength={10} className="w-full rounded-r-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                      data-testid="edit-phone" />
                  </div>
                  {getEditError("phone") && <p className="mt-1 text-xs text-red-600">{getEditError("phone")}</p>}
                </div>
                <div>
                  <label htmlFor="edit-language" className="mb-1 block text-sm text-gray-600">Language</label>
                  <select id="edit-language" name="preferredLanguage" value={editForm.preferredLanguage}
                    onChange={handleEditChange} className={inputClass} data-testid="edit-language">
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                  </select>
                </div>
              </div>
            </div>

            {/* KYC Info */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">KYC Documents</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-aadhar" className="mb-1 block text-sm text-gray-600">Aadhar Number</label>
                  <input id="edit-aadhar" name="aadharNumber" value={editForm.aadharNumber} onChange={handleEditChange}
                    maxLength={12} placeholder="12 digit Aadhar number" className={inputClass} data-testid="edit-aadhar" />
                  {getEditError("aadharNumber") && <p className="mt-1 text-xs text-red-600">{getEditError("aadharNumber")}</p>}
                </div>
                <div>
                  <label htmlFor="edit-aadhar-file" className="mb-1 block text-sm text-gray-600">
                    Aadhar Document {member.aadharFilePath && <span className="text-green-600">(uploaded)</span>}
                  </label>
                  <input id="edit-aadhar-file" ref={aadharFileRef} type="file" accept="image/jpeg,image/png,application/pdf"
                    className="w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                    data-testid="edit-aadhar-file" />
                </div>
                <div>
                  <label htmlFor="edit-pan" className="mb-1 block text-sm text-gray-600">PAN Number</label>
                  <input id="edit-pan" name="panNumber" value={editForm.panNumber} onChange={handleEditChange}
                    maxLength={10} placeholder="e.g. ABCDE1234F" className={inputClass} data-testid="edit-pan" />
                  {getEditError("panNumber") && <p className="mt-1 text-xs text-red-600">{getEditError("panNumber")}</p>}
                </div>
                <div>
                  <label htmlFor="edit-pan-file" className="mb-1 block text-sm text-gray-600">
                    PAN Document {member.panFilePath && <span className="text-green-600">(uploaded)</span>}
                  </label>
                  <input id="edit-pan-file" ref={panFileRef} type="file" accept="image/jpeg,image/png,application/pdf"
                    className="w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                    data-testid="edit-pan-file" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="edit-passport-photo" className="mb-1 block text-sm text-gray-600">
                    Passport Photo {member.passportPhotoPath && <span className="text-green-600">(uploaded)</span>}
                  </label>
                  <input id="edit-passport-photo" ref={passportPhotoRef} type="file" accept="image/jpeg,image/png"
                    className="w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                    data-testid="edit-passport-photo" />
                </div>
              </div>
            </div>

            {/* Bank Details */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Bank Details</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="edit-bank-account" className="mb-1 block text-sm text-gray-600">Account Number</label>
                  <input id="edit-bank-account" name="bankAccountNumber" value={editForm.bankAccountNumber}
                    onChange={handleEditChange} maxLength={18} placeholder="Bank account number" className={inputClass}
                    data-testid="edit-bank-account" />
                  {getEditError("bankAccountNumber") && <p className="mt-1 text-xs text-red-600">{getEditError("bankAccountNumber")}</p>}
                </div>
                <div>
                  <label htmlFor="edit-ifsc" className="mb-1 block text-sm text-gray-600">IFSC Code</label>
                  <input id="edit-ifsc" name="bankIfscCode" value={editForm.bankIfscCode} onChange={handleEditChange}
                    maxLength={11} placeholder="e.g. SBIN0001234" className={inputClass} data-testid="edit-ifsc" />
                  {getEditError("bankIfscCode") && <p className="mt-1 text-xs text-red-600">{getEditError("bankIfscCode")}</p>}
                </div>
                <div>
                  <label htmlFor="edit-bank-name" className="mb-1 block text-sm text-gray-600">Bank Name</label>
                  <input id="edit-bank-name" name="bankName" value={editForm.bankName} onChange={handleEditChange}
                    placeholder="e.g. State Bank of India" className={inputClass} data-testid="edit-bank-name" />
                  {getEditError("bankName") && <p className="mt-1 text-xs text-red-600">{getEditError("bankName")}</p>}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                data-testid="save-edit-button">
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" onClick={() => setEditing(false)}
                className="rounded-md border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profile + Status + KYC cards */}
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

      {/* KYC & Bank Details Card */}
      <div className="mt-6 rounded-lg border bg-white p-6 shadow-sm" data-testid="kyc-card">
        <h2 className="text-lg font-semibold mb-4">KYC & Bank Details</h2>
        {!hasKycData ? (
          <p className="text-sm text-gray-500">No KYC or bank details provided yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Aadhar */}
            <dl className="space-y-2 text-sm">
              <dt className="font-medium text-gray-700">Aadhar</dt>
              <dd data-testid="kyc-aadhar">
                {member.aadharNumber ? (
                  <span className="font-mono">{member.aadharNumber}</span>
                ) : (
                  <span className="text-gray-400">Not provided</span>
                )}
              </dd>
              <dd>
                {member.aadharFilePath ? (
                  <a href={member.aadharFilePath} target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline text-xs" data-testid="kyc-aadhar-file">
                    View Document
                  </a>
                ) : (
                  <span className="text-gray-400 text-xs">No document</span>
                )}
              </dd>
            </dl>

            {/* PAN */}
            <dl className="space-y-2 text-sm">
              <dt className="font-medium text-gray-700">PAN</dt>
              <dd data-testid="kyc-pan">
                {member.panNumber ? (
                  <span className="font-mono">{member.panNumber}</span>
                ) : (
                  <span className="text-gray-400">Not provided</span>
                )}
              </dd>
              <dd>
                {member.panFilePath ? (
                  <a href={member.panFilePath} target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline text-xs" data-testid="kyc-pan-file">
                    View Document
                  </a>
                ) : (
                  <span className="text-gray-400 text-xs">No document</span>
                )}
              </dd>
            </dl>

            {/* Passport Photo */}
            <dl className="space-y-2 text-sm">
              <dt className="font-medium text-gray-700">Passport Photo</dt>
              <dd>
                {member.passportPhotoPath ? (
                  <a href={member.passportPhotoPath} target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline text-xs" data-testid="kyc-passport-photo">
                    View Photo
                  </a>
                ) : (
                  <span className="text-gray-400">Not uploaded</span>
                )}
              </dd>
            </dl>

            {/* Bank Details */}
            {(member.bankAccountNumber || member.bankIfscCode || member.bankName) && (
              <dl className="space-y-2 text-sm sm:col-span-2 lg:col-span-3 border-t pt-4">
                <dt className="font-medium text-gray-700 mb-2">Bank Details</dt>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <span className="text-gray-500 text-xs">Account Number</span>
                    <dd className="font-mono" data-testid="kyc-bank-account">
                      {member.bankAccountNumber || <span className="text-gray-400 font-sans">-</span>}
                    </dd>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">IFSC Code</span>
                    <dd className="font-mono" data-testid="kyc-ifsc">
                      {member.bankIfscCode || <span className="text-gray-400 font-sans">-</span>}
                    </dd>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Bank Name</span>
                    <dd data-testid="kyc-bank-name">
                      {member.bankName || <span className="text-gray-400">-</span>}
                    </dd>
                  </div>
                </div>
              </dl>
            )}
          </div>
        )}
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
