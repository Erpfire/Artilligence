"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/LanguageProvider";
import { formatINR, formatDate } from "@/lib/i18n";
import { DashboardSkeleton } from "@/components/Skeleton";
import OnboardingTour from "./OnboardingTour";

interface PinnedAnnouncement {
  id: string;
  titleEn: string;
  titleHi: string | null;
  contentEn: string;
  contentHi: string | null;
  isPinned: boolean;
  createdAt: string;
}

interface DashboardStats {
  wallet: { totalEarned: string; pending: string; paidOut: string };
  directReferrals: number;
  totalDownline: number;
  referralCode: string;
  memberName: string;
  recentCommissions: {
    id: string;
    level: number;
    amount: string;
    percentage: string;
    createdAt: string;
    billCode: string;
    saleAmount: string;
    sourceMemberName: string;
  }[];
}

type Period = "today" | "week" | "month" | "all";

export default function DashboardHome({ showOnboarding }: { showOnboarding: boolean }) {
  const { locale, t } = useLanguage();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runOnboarding, setRunOnboarding] = useState(false);
  const [pinnedAnnouncements, setPinnedAnnouncements] = useState<PinnedAnnouncement[]>([]);

  const fetchStats = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/stats?period=${p}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(period);
  }, [period, fetchStats]);

  useEffect(() => {
    fetch("/api/dashboard/announcements")
      .then((r) => r.ok ? r.json() : { announcements: [] })
      .then((data) => setPinnedAnnouncements(data.announcements.filter((a: PinnedAnnouncement) => a.isPinned)))
      .catch(() => {});
  }, []);

  // Trigger onboarding after data loads
  useEffect(() => {
    if (showOnboarding && stats && !loading) {
      const timer = setTimeout(() => setRunOnboarding(true), 500);
      return () => clearTimeout(timer);
    }
  }, [showOnboarding, stats, loading]);

  function handleCopy() {
    if (!stats) return;
    const link = `${window.location.origin}/join/${stats.referralCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handlePeriodChange(p: Period) {
    setPeriod(p);
  }

  const periods: { key: Period; labelKey: "filter.today" | "filter.thisWeek" | "filter.thisMonth" | "filter.allTime" }[] = [
    { key: "today", labelKey: "filter.today" },
    { key: "week", labelKey: "filter.thisWeek" },
    { key: "month", labelKey: "filter.thisMonth" },
    { key: "all", labelKey: "filter.allTime" },
  ];

  if (loading && !stats) {
    return <DashboardSkeleton />;
  }

  if (!stats) return null;

  return (
    <div data-testid="dashboard-home">
      {/* Welcome */}
      <h1 className="text-2xl font-bold text-gray-900" data-testid="dashboard-welcome">
        {t("dashboard.welcome")}, {stats.memberName}
      </h1>

      {/* Time filters */}
      <div className="mt-4 flex flex-wrap gap-2" data-testid="time-filters">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => handlePeriodChange(p.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              period === p.key
                ? "bg-primary text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
            data-testid={`filter-${p.key}`}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      {/* Wallet summary cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="wallet-summary">
        <div className="rounded-lg bg-white p-5 shadow-sm border" data-testid="wallet-total">
          <p className="text-sm text-gray-500">{t("dashboard.wallet.total")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900" data-testid="wallet-total-amount">
            {formatINR(stats.wallet.totalEarned)}
          </p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm border" data-testid="wallet-pending">
          <p className="text-sm text-gray-500">{t("dashboard.wallet.pending")}</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600" data-testid="wallet-pending-amount">
            {formatINR(stats.wallet.pending)}
          </p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm border" data-testid="wallet-paid">
          <p className="text-sm text-gray-500">{t("dashboard.wallet.paid")}</p>
          <p className="mt-1 text-2xl font-bold text-green-600" data-testid="wallet-paid-amount">
            {formatINR(stats.wallet.paidOut)}
          </p>
        </div>
      </div>

      {/* Referrals + Downline row */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-white p-5 shadow-sm border" data-testid="referral-count">
          <p className="text-sm text-gray-500">{t("dashboard.referrals.title")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            <span data-testid="referral-count-value">{stats.directReferrals}</span>
            <span className="text-base font-normal text-gray-500"> / 3</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">{t("dashboard.referrals.slots")}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm border" data-testid="downline-count">
          <p className="text-sm text-gray-500">{t("dashboard.downline.title")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900" data-testid="downline-count-value">
            {stats.totalDownline}
          </p>
          <p className="mt-1 text-xs text-gray-400">{t("dashboard.downline.members")}</p>
        </div>
      </div>

      {/* Referral link */}
      <div className="mt-4 rounded-lg bg-white p-5 shadow-sm border" data-testid="referral-link-section">
        <p className="text-sm font-medium text-gray-700">{t("dashboard.referralLink.title")}</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            readOnly
            value={typeof window !== "undefined" ? `${window.location.origin}/join/${stats.referralCode}` : `/join/${stats.referralCode}`}
            className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
            data-testid="referral-link-input"
          />
          <button
            onClick={handleCopy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            data-testid="copy-referral-link"
          >
            {copied ? t("dashboard.referralLink.copied") : t("dashboard.referralLink.copy")}
          </button>
        </div>
      </div>

      {/* Quick action */}
      <div className="mt-4">
        <Link
          href="/dashboard/sales/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          data-testid="quick-submit-sale"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t("dashboard.quickAction.submitSale")}
        </Link>
      </div>

      {/* Pinned announcements widget */}
      {pinnedAnnouncements.length > 0 && (
        <div className="mt-6" data-testid="pinned-announcements-widget">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{t("announcements.latestPinned")}</h2>
            <Link
              href="/dashboard/announcements"
              className="text-sm font-medium text-primary hover:underline"
              data-testid="view-all-announcements-link"
            >
              {t("announcements.viewAll")}
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {pinnedAnnouncements.slice(0, 3).map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-amber-300 bg-amber-50 p-4"
                data-testid={`pinned-widget-${a.id}`}
              >
                <h3 className="text-sm font-semibold text-gray-900">
                  {locale === "hi" && a.titleHi ? a.titleHi : a.titleEn}
                </h3>
                <p className="mt-1 text-sm text-gray-700 line-clamp-2">
                  {locale === "hi" && a.contentHi ? a.contentHi : a.contentEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent commissions */}
      <div className="mt-6" data-testid="recent-commissions">
        <h2 className="text-lg font-semibold text-gray-900">{t("dashboard.commissions.title")}</h2>
        {stats.recentCommissions.length === 0 ? (
          <div className="mt-3 rounded-lg bg-white p-6 text-center text-sm text-gray-500 shadow-sm border" data-testid="commissions-empty">
            {t("dashboard.commissions.empty")}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="mt-3 hidden sm:block overflow-x-auto rounded-lg bg-white shadow-sm border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">{t("dashboard.commissions.level")}</th>
                    <th className="px-4 py-3">{t("dashboard.commissions.billCode")}</th>
                    <th className="px-4 py-3">{t("dashboard.commissions.from")}</th>
                    <th className="px-4 py-3 text-right">{t("dashboard.commissions.amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stats.recentCommissions.map((c) => (
                    <tr key={c.id} data-testid={`commission-row-${c.id}`}>
                      <td className="px-4 py-3">L{c.level}</td>
                      <td className="px-4 py-3 font-mono text-xs">{c.billCode}</td>
                      <td className="px-4 py-3">{c.sourceMemberName}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">
                        {formatINR(c.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="mt-3 sm:hidden space-y-2" data-testid="commissions-cards">
              {stats.recentCommissions.map((c) => (
                <div key={c.id} className="rounded-lg border bg-white p-3 shadow-sm" data-testid={`commission-card-${c.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">L{c.level} — {c.sourceMemberName}</span>
                    <span className="font-medium text-green-600">{formatINR(c.amount)}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-gray-500">{c.billCode}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Onboarding */}
      {runOnboarding && (
        <OnboardingTour
          onComplete={() => setRunOnboarding(false)}
        />
      )}
    </div>
  );
}
