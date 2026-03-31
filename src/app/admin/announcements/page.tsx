"use client";

import { useState, useEffect, useCallback } from "react";

interface Announcement {
  id: string;
  titleEn: string;
  titleHi: string | null;
  contentEn: string;
  contentHi: string | null;
  isPinned: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_FORM = {
  titleEn: "",
  titleHi: "",
  contentEn: "",
  contentHi: "",
  isPinned: false,
};

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/announcements");
    if (res.ok) {
      const data = await res.json();
      setAnnouncements(data.announcements);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  }

  function openEdit(a: Announcement) {
    setEditId(a.id);
    setForm({
      titleEn: a.titleEn,
      titleHi: a.titleHi || "",
      contentEn: a.contentEn,
      contentHi: a.contentHi || "",
      isPinned: a.isPinned,
    });
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.titleEn.trim() || !form.contentEn.trim()) {
      setError("Title and content (English) are required");
      return;
    }

    setSaving(true);

    if (editId) {
      const res = await fetch("/api/admin/announcements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, ...form }),
      });
      if (!res.ok) {
        setError("Failed to update");
        setSaving(false);
        return;
      }
    } else {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError("Failed to create");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowForm(false);
    fetchAnnouncements();
  }

  async function togglePin(a: Announcement) {
    await fetch("/api/admin/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, isPinned: !a.isPinned }),
    });
    fetchAnnouncements();
  }

  async function toggleActive(a: Announcement) {
    await fetch("/api/admin/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, isActive: !a.isActive }),
    });
    fetchAnnouncements();
  }

  return (
    <div className="mx-auto max-w-4xl" data-testid="admin-announcements-page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          data-testid="create-announcement-btn"
        >
          Create Announcement
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" data-testid="announcement-form">
            <h2 className="mb-4 text-lg font-semibold">
              {editId ? "Edit Announcement" : "Create Announcement"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Title (English) *</label>
                <input
                  type="text"
                  value={form.titleEn}
                  onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  data-testid="input-title-en"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Title (Hindi)</label>
                <input
                  type="text"
                  value={form.titleHi}
                  onChange={(e) => setForm({ ...form, titleHi: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  data-testid="input-title-hi"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Content (English) *</label>
                <textarea
                  value={form.contentEn}
                  onChange={(e) => setForm({ ...form, contentEn: e.target.value })}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  data-testid="input-content-en"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Content (Hindi)</label>
                <textarea
                  value={form.contentHi}
                  onChange={(e) => setForm({ ...form, contentHi: e.target.value })}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  data-testid="input-content-hi"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pin-toggle"
                  checked={form.isPinned}
                  onChange={(e) => setForm({ ...form, isPinned: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  data-testid="pin-toggle"
                />
                <label htmlFor="pin-toggle" className="text-sm text-gray-700">Pin this announcement</label>
              </div>

              {error && (
                <p className="text-sm text-red-600" data-testid="form-error">{error}</p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  data-testid="cancel-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                  data-testid="submit-announcement"
                >
                  {saving ? "Saving..." : editId ? "Save Changes" : "Publish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Announcements list */}
      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : announcements.length === 0 ? (
        <div className="py-12 text-center text-gray-500" data-testid="announcements-empty">
          No announcements yet
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className={`rounded-lg border p-4 ${
                !a.isActive ? "border-gray-200 bg-gray-50 opacity-60" : a.isPinned ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"
              }`}
              data-testid={`announcement-${a.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {a.isPinned && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700" data-testid={`pinned-badge-${a.id}`}>
                        Pinned
                      </span>
                    )}
                    {!a.isActive && (
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600" data-testid={`inactive-badge-${a.id}`}>
                        Inactive
                      </span>
                    )}
                    <h3 className="text-sm font-semibold text-gray-900">{a.titleEn}</h3>
                  </div>
                  {a.titleHi && (
                    <p className="mt-0.5 text-xs text-gray-500">{a.titleHi}</p>
                  )}
                  <p className="mt-2 text-sm text-gray-700 line-clamp-2">{a.contentEn}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => openEdit(a)}
                    className="rounded border px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    data-testid={`edit-${a.id}`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => togglePin(a)}
                    className={`rounded border px-2.5 py-1 text-xs font-medium ${
                      a.isPinned ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "text-gray-700 hover:bg-gray-100"
                    }`}
                    data-testid={`toggle-pin-${a.id}`}
                  >
                    {a.isPinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    onClick={() => toggleActive(a)}
                    className={`rounded border px-2.5 py-1 text-xs font-medium ${
                      a.isActive ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"
                    }`}
                    data-testid={`toggle-active-${a.id}`}
                  >
                    {a.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
