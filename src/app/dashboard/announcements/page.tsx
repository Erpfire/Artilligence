"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { formatDate } from "@/lib/i18n";
import { AnnouncementsSkeleton } from "@/components/Skeleton";

interface Announcement {
  id: string;
  titleEn: string;
  titleHi: string | null;
  contentEn: string;
  contentHi: string | null;
  isPinned: boolean;
  createdAt: string;
}

export default function MemberAnnouncementsPage() {
  const { locale, t } = useLanguage();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/dashboard/announcements");
    if (res.ok) {
      const data = await res.json();
      setAnnouncements(data.announcements);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  function getTitle(a: Announcement) {
    return locale === "hi" && a.titleHi ? a.titleHi : a.titleEn;
  }

  function getContent(a: Announcement) {
    return locale === "hi" && a.contentHi ? a.contentHi : a.contentEn;
  }

  return (
    <div className="mx-auto max-w-3xl" data-testid="member-announcements-page">
      <h1 className="mb-6 text-2xl font-bold text-gray-900" data-testid="announcements-heading">
        {t("announcements.title")}
      </h1>

      {loading ? (
        <AnnouncementsSkeleton />
      ) : announcements.length === 0 ? (
        <div className="py-12 text-center text-gray-500" data-testid="announcements-empty">
          {t("announcements.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className={`rounded-lg border p-4 ${
                a.isPinned ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"
              }`}
              data-testid={`announcement-card-${a.id}`}
            >
              <div className="flex items-center gap-2">
                {a.isPinned && (
                  <span
                    className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700"
                    data-testid={`pin-label-${a.id}`}
                  >
                    {t("announcements.pinned")}
                  </span>
                )}
                <h2 className="text-base font-semibold text-gray-900">{getTitle(a)}</h2>
              </div>
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{getContent(a)}</p>
              <p className="mt-2 text-xs text-gray-400">
                {formatDate(a.createdAt, locale)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
