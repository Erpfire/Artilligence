"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { useRouter } from "next/navigation";
import { formatDate as fmtDate } from "@/lib/i18n";
import { NotificationsSkeleton } from "@/components/Skeleton";

interface Notification {
  id: string;
  title: string;
  titleHi: string | null;
  body: string | null;
  bodyHi: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function NotificationsPage() {
  const { locale, t } = useLanguage();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (filter === "unread") params.set("filter", "unread");
    const res = await fetch(`/api/dashboard/notifications?${params}`);
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications);
      setPagination(data.pagination);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  async function handleMarkRead(id: string) {
    await fetch("/api/dashboard/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: id }),
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  }

  async function handleMarkAllRead() {
    await fetch("/api/dashboard/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  function handleClick(n: Notification) {
    if (!n.isRead) handleMarkRead(n.id);
    if (n.link) router.push(n.link);
  }

  function getTitle(n: Notification) {
    return locale === "hi" && n.titleHi ? n.titleHi : n.title;
  }

  function getBody(n: Notification) {
    return locale === "hi" && n.bodyHi ? n.bodyHi : n.body;
  }

  function formatDate(dateStr: string) {
    return fmtDate(dateStr, locale);
  }

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="mx-auto max-w-3xl" data-testid="notifications-page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900" data-testid="notifications-title">
          {t("notifications.title")}
        </h1>
        {hasUnread && (
          <button
            onClick={handleMarkAllRead}
            className="rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
            data-testid="mark-all-read"
          >
            {t("notifications.markAllRead")}
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2" data-testid="notification-filters">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === "all" ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
          data-testid="filter-all"
        >
          {t("notifications.filterAll")}
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === "unread" ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
          data-testid="filter-unread"
        >
          {t("notifications.filterUnread")}
        </button>
      </div>

      {/* Notifications list */}
      <div className="space-y-2">
        {loading ? (
          <NotificationsSkeleton />
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-gray-500" data-testid="notifications-empty">
            {t("notifications.empty")}
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                !n.isRead ? "border-blue-200 bg-blue-50/50" : "border-gray-200 bg-white"
              } ${n.link ? "cursor-pointer hover:bg-gray-50" : ""}`}
              onClick={() => handleClick(n)}
              data-testid={`notification-row-${n.id}`}
            >
              {/* Unread dot */}
              <div className="mt-1.5 shrink-0">
                {!n.isRead ? (
                  <span className="block h-2.5 w-2.5 rounded-full bg-blue-500" data-testid={`unread-indicator-${n.id}`} />
                ) : (
                  <span className="block h-2.5 w-2.5 rounded-full bg-gray-300" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`text-sm ${!n.isRead ? "font-semibold" : "font-medium"} text-gray-900`}>
                    {getTitle(n)}
                  </h3>
                  <span className="shrink-0 text-xs text-gray-400">{formatDate(n.createdAt)}</span>
                </div>
                {getBody(n) && (
                  <p className="mt-1 text-sm text-gray-600">{getBody(n)}</p>
                )}
              </div>

              {!n.isRead && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkRead(n.id);
                  }}
                  className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title={t("notifications.markRead")}
                  data-testid={`mark-read-${n.id}`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {t("wallet.showing")} {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} {t("wallet.of")} {pagination.total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => fetchNotifications(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              data-testid="notif-prev"
            >
              {t("wallet.prev")}
            </button>
            <button
              onClick={() => fetchNotifications(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              data-testid="notif-next"
            >
              {t("wallet.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
