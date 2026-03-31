"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FRAUD_SETTINGS = [
  { key: "daily_sale_limit", label: "Max sales per day", type: "number", placeholder: "10" },
  { key: "weekly_sale_limit", label: "Max sales per week", type: "number", placeholder: "50" },
  { key: "min_sale_gap_minutes", label: "Min gap between sales (minutes)", type: "number", placeholder: "5" },
  { key: "bill_code_format", label: "Bill code format (regex)", type: "text", placeholder: "^MB-\\d{5,}$" },
  { key: "ghost_member_inactive_days", label: "Inactive days for ghost flag", type: "number", placeholder: "90" },
];

const COMPANY_SETTINGS = [
  { key: "company_name", label: "Company name", type: "text", placeholder: "Artilligence Technology Pvt Ltd" },
];

export default function AppSettingsClient({
  initialSettings,
}: {
  initialSettings: Record<string, string>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function updateValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: values }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save settings");
        return;
      }
      setSuccess("Settings saved successfully");
      setTimeout(() => setSuccess(""), 3000);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Messages */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" data-testid="settings-error">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700" data-testid="settings-success">
          {success}
        </div>
      )}

      {/* Fraud Prevention */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold" data-testid="fraud-section-title">Fraud Prevention</h2>
          <p className="mt-1 text-sm text-gray-500">Control rate limiting and validation for sale submissions.</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          {FRAUD_SETTINGS.map((setting) => (
            <div key={setting.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <label className="w-64 text-sm font-medium text-gray-700 shrink-0" htmlFor={setting.key}>
                {setting.label}
              </label>
              <input
                id={setting.key}
                type={setting.type}
                value={values[setting.key] || ""}
                onChange={(e) => updateValue(setting.key, e.target.value)}
                placeholder={setting.placeholder}
                className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                data-testid={`setting-${setting.key}`}
                min={setting.type === "number" ? "0" : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Company */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold" data-testid="company-section-title">Company</h2>
        </div>
        <div className="px-6 py-4 space-y-4">
          {COMPANY_SETTINGS.map((setting) => (
            <div key={setting.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <label className="w-64 text-sm font-medium text-gray-700 shrink-0" htmlFor={setting.key}>
                {setting.label}
              </label>
              <input
                id={setting.key}
                type={setting.type}
                value={values[setting.key] || ""}
                onChange={(e) => updateValue(setting.key, e.target.value)}
                placeholder={setting.placeholder}
                className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                data-testid={`setting-${setting.key}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
          data-testid="save-settings-button"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
