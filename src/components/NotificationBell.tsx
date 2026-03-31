"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { t as translate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

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

export default function NotificationBell({
  locale = "en",
  notificationsPath = "/dashboard/notifications",
}: {
  locale?: "en" | "hi";
  notificationsPath?: string;
}) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/notifications/unread-count", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch {}
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function toggleDropdown() {
    if (!dropdownOpen) {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/notifications?limit=5");
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications);
        }
      } catch {}
      setLoading(false);
    }
    setDropdownOpen(!dropdownOpen);
  }

  async function handleNotificationClick(n: Notification) {
    if (!n.isRead) {
      await fetch("/api/dashboard/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: n.id }),
      });
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
      );
    }
    setDropdownOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  }

  function getTitle(n: Notification) {
    if (locale === "hi" && n.titleHi) return n.titleHi;
    return n.title;
  }

  function getBody(n: Notification) {
    if (locale === "hi" && n.bodyHi) return n.bodyHi;
    return n.body;
  }

  const tt = (key: Parameters<typeof translate>[0]) => translate(key, locale as Locale);

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return tt("time.justNow");
    if (mins < 60) return `${mins}${tt("time.minutesShort")}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}${tt("time.hoursShort")}`;
    const days = Math.floor(hours / 24);
    return `${days}${tt("time.daysShort")}`;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="relative rounded-md p-2 text-gray-600 hover:bg-gray-100 transition-colors"
        data-testid="notification-bell"
        aria-label={tt("notifications.title")}
      >
        {/* Bell icon */}
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* Badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
            data-testid="notification-badge"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {dropdownOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-white shadow-lg"
          data-testid="notification-dropdown"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">
              {tt("notifications.title")}
            </h3>
            {unreadCount > 0 && (
              <span className="text-xs text-gray-500" data-testid="dropdown-unread-count">
                {unreadCount} {tt("notifications.unread")}
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-sm text-gray-500">
                {tt("common.loading")}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500" data-testid="dropdown-empty">
                {tt("notifications.empty")}
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                    !n.isRead ? "bg-blue-50/50" : ""
                  }`}
                  data-testid={`notification-item-${n.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-sm ${!n.isRead ? "font-semibold" : "font-medium"} text-gray-800`}>
                      {getTitle(n)}
                    </span>
                    <span className="shrink-0 text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                  </div>
                  {getBody(n) && (
                    <span className="text-xs text-gray-500 line-clamp-2">{getBody(n)}</span>
                  )}
                  {!n.isRead && (
                    <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-blue-500" data-testid="unread-dot" />
                  )}
                </button>
              ))
            )}
          </div>

          <div className="border-t px-4 py-2.5">
            <button
              onClick={() => {
                setDropdownOpen(false);
                router.push(notificationsPath);
              }}
              className="w-full text-center text-sm font-medium text-primary hover:underline"
              data-testid="view-all-notifications"
            >
              {tt("notifications.viewAll")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
