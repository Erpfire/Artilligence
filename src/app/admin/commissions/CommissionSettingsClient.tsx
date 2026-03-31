"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CommissionSetting {
  id: string;
  level: number;
  percentage: string;
  updatedAt: string;
}

interface HistoryEntry {
  id: string;
  level: number;
  oldPercentage: string | null;
  newPercentage: string | null;
  action: string;
  createdAt: string;
}

export default function CommissionSettingsClient({
  initialSettings,
  initialHistory,
}: {
  initialSettings: CommissionSetting[];
  initialHistory: HistoryEntry[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [history] = useState(initialHistory);
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingLevel, setSavingLevel] = useState<number | null>(null);
  const [removingLevel, setRemovingLevel] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newLevel, setNewLevel] = useState("");
  const [newPercentage, setNewPercentage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function showMessage(msg: string, isError: boolean) {
    if (isError) {
      setError(msg);
      setSuccess("");
    } else {
      setSuccess(msg);
      setError("");
    }
    setTimeout(() => { setError(""); setSuccess(""); }, 3000);
  }

  function startEdit(setting: CommissionSetting) {
    setEditingLevel(setting.level);
    setEditValue(setting.percentage);
  }

  function cancelEdit() {
    setEditingLevel(null);
    setEditValue("");
  }

  async function saveLevel(level: number) {
    const pct = Number(editValue);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      showMessage("Percentage must be between 0 and 100", true);
      return;
    }

    setSavingLevel(level);
    try {
      const res = await fetch("/api/admin/commissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, percentage: pct }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Failed to save", true);
        return;
      }
      setEditingLevel(null);
      setEditValue("");
      showMessage(`Level ${level} updated to ${pct}%`, false);
      router.refresh();
    } catch {
      showMessage("Network error", true);
    } finally {
      setSavingLevel(null);
    }
  }

  async function removeLevel(level: number) {
    if (!confirm(`Remove commission level ${level}? This cannot be undone.`)) return;

    setRemovingLevel(level);
    try {
      const res = await fetch(`/api/admin/commissions/${level}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Failed to remove", true);
        return;
      }
      setSettings(settings.filter((s) => s.level !== level));
      showMessage(`Level ${level} removed`, false);
      router.refresh();
    } catch {
      showMessage("Network error", true);
    } finally {
      setRemovingLevel(null);
    }
  }

  async function addLevel() {
    const lvl = parseInt(newLevel);
    const pct = Number(newPercentage);

    if (isNaN(lvl) || lvl < 1) {
      showMessage("Level must be a positive integer", true);
      return;
    }
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      showMessage("Percentage must be between 0 and 100", true);
      return;
    }
    if (settings.some((s) => s.level === lvl)) {
      showMessage(`Level ${lvl} already exists`, true);
      return;
    }

    setSavingLevel(-1);
    try {
      const res = await fetch("/api/admin/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: lvl, percentage: pct }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Failed to add", true);
        return;
      }
      setAddingNew(false);
      setNewLevel("");
      setNewPercentage("");
      showMessage(`Level ${lvl} added at ${pct}%`, false);
      router.refresh();
    } catch {
      showMessage("Network error", true);
    } finally {
      setSavingLevel(null);
    }
  }

  const totalPct = settings.reduce((sum, s) => sum + Number(s.percentage), 0);

  return (
    <div className="mt-6 space-y-8">
      {/* Messages */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" data-testid="commission-error">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700" data-testid="commission-success">
          {success}
        </div>
      )}

      {/* Commission Rates Table */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold" data-testid="rates-table-title">Commission Rates</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500" data-testid="total-payout">
              Total payout: {totalPct.toFixed(2)}%
            </span>
            <button
              onClick={() => setAddingNew(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
              data-testid="add-level-button"
              disabled={addingNew}
            >
              Add Level
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" data-testid="commission-rates-table">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-sm font-medium text-gray-500">
                <th className="px-6 py-3">Level</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3">Percentage</th>
                <th className="px-6 py-3">Last Updated</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {settings.map((setting) => (
                <tr key={setting.id} data-testid={`commission-row-${setting.level}`}>
                  <td className="px-6 py-4 text-sm font-medium" data-testid={`level-${setting.level}`}>
                    Level {setting.level}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {getLevelDescription(setting.level)}
                  </td>
                  <td className="px-6 py-4">
                    {editingLevel === setting.level ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="100"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                          data-testid={`edit-percentage-${setting.level}`}
                          autoFocus
                        />
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                    ) : (
                      <span className="text-sm" data-testid={`percentage-${setting.level}`}>
                        {Number(setting.percentage).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(setting.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {editingLevel === setting.level ? (
                        <>
                          <button
                            onClick={() => saveLevel(setting.level)}
                            disabled={savingLevel === setting.level}
                            className="rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            data-testid={`save-level-${setting.level}`}
                          >
                            {savingLevel === setting.level ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                            data-testid={`cancel-edit-${setting.level}`}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(setting)}
                            className="rounded bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                            data-testid={`edit-level-${setting.level}`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => removeLevel(setting.level)}
                            disabled={removingLevel === setting.level}
                            className="rounded bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                            data-testid={`remove-level-${setting.level}`}
                          >
                            {removingLevel === setting.level ? "Removing..." : "Remove"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {/* Add new level row */}
              {addingNew && (
                <tr data-testid="add-level-row">
                  <td className="px-6 py-4">
                    <input
                      type="number"
                      min="1"
                      value={newLevel}
                      onChange={(e) => setNewLevel(e.target.value)}
                      placeholder="Level"
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                      data-testid="new-level-input"
                      autoFocus
                    />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    —
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="100"
                        value={newPercentage}
                        onChange={(e) => setNewPercentage(e.target.value)}
                        placeholder="0.00"
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        data-testid="new-percentage-input"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">—</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={addLevel}
                        disabled={savingLevel === -1}
                        className="rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        data-testid="confirm-add-level"
                      >
                        {savingLevel === -1 ? "Adding..." : "Add"}
                      </button>
                      <button
                        onClick={() => { setAddingNew(false); setNewLevel(""); setNewPercentage(""); }}
                        className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                        data-testid="cancel-add-level"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {settings.length === 0 && !addingNew && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500" data-testid="no-commission-settings">
                    No commission levels configured. Click &quot;Add Level&quot; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rate Change History */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold" data-testid="history-table-title">Rate Change History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="commission-history-table">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-sm font-medium text-gray-500">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Level</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">Old Rate</th>
                <th className="px-6 py-3">New Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((entry) => (
                <tr key={entry.id} data-testid={`history-row-${entry.id}`}>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-sm font-medium">
                    Level {entry.level}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        entry.action === "ADDED"
                          ? "bg-green-100 text-green-700"
                          : entry.action === "REMOVED"
                          ? "bg-red-100 text-red-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                      data-testid={`history-action-${entry.id}`}
                    >
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {entry.oldPercentage ? `${entry.oldPercentage}%` : "—"}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {entry.newPercentage ? `${entry.newPercentage}%` : "—"}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500" data-testid="no-history">
                    No rate changes recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function getLevelDescription(level: number): string {
  const descriptions: Record<number, string> = {
    1: "Direct parent (sponsor)",
    2: "Grandparent",
    3: "Great-grandparent",
    4: "4th ancestor",
    5: "5th ancestor",
    6: "6th ancestor",
    7: "7th ancestor",
  };
  return descriptions[level] || `${level}th ancestor`;
}
