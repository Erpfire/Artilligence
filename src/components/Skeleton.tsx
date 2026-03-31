"use client";

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 ${className}`}
      data-testid="skeleton-line"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm" data-testid="skeleton-card">
      <SkeletonLine className="mb-3 h-3 w-24" />
      <SkeletonLine className="h-7 w-32" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-skeleton">
      {/* Welcome */}
      <SkeletonLine className="h-8 w-64" />
      {/* Time filters */}
      <div className="mt-4 flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonLine key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      {/* Wallet cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      {/* Referrals + Downline */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      {/* Referral link */}
      <div className="mt-4 rounded-lg border bg-white p-5 shadow-sm">
        <SkeletonLine className="mb-3 h-4 w-32" />
        <SkeletonLine className="h-10 w-full" />
      </div>
    </div>
  );
}

export function SalesListSkeleton() {
  return (
    <div data-testid="sales-skeleton">
      <div className="mb-4">
        <SkeletonLine className="h-9 w-full rounded-lg" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex justify-between">
              <div>
                <SkeletonLine className="mb-2 h-4 w-28" />
                <SkeletonLine className="mb-1 h-3 w-40" />
                <SkeletonLine className="h-3 w-24" />
              </div>
              <div className="text-right">
                <SkeletonLine className="mb-2 h-5 w-20" />
                <SkeletonLine className="h-5 w-16 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WalletSkeleton() {
  return (
    <div data-testid="wallet-skeleton">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonLine className="mb-3 h-6 w-48" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SkeletonLine className="h-9 w-36" />
        <SkeletonLine className="h-9 w-36" />
        <SkeletonLine className="h-9 w-36" />
      </div>
      <div className="rounded-lg border bg-white shadow-sm">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
            <SkeletonLine className="h-5 w-24 rounded-full" />
            <SkeletonLine className="h-4 w-48 flex-1" />
            <SkeletonLine className="h-4 w-20" />
            <SkeletonLine className="h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamSkeleton() {
  return (
    <div data-testid="team-skeleton">
      <SkeletonLine className="mb-4 h-9 w-full sm:max-w-xs" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border bg-white p-3 shadow-sm">
            <div className="flex justify-between mb-1">
              <SkeletonLine className="h-4 w-32" />
              <SkeletonLine className="h-5 w-16 rounded-full" />
            </div>
            <SkeletonLine className="mt-2 h-3 w-48" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NotificationsSkeleton() {
  return (
    <div data-testid="notifications-skeleton">
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border p-4">
            <SkeletonLine className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" />
            <div className="flex-1">
              <div className="flex justify-between">
                <SkeletonLine className="h-4 w-40" />
                <SkeletonLine className="h-3 w-20" />
              </div>
              <SkeletonLine className="mt-2 h-3 w-64" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div data-testid="profile-skeleton">
      <SkeletonLine className="h-8 w-32 mb-6" />
      <div className="max-w-lg rounded-lg border bg-white p-6 shadow-sm">
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <SkeletonLine className="mb-1 h-4 w-16" />
              <SkeletonLine className="h-10 w-full" />
            </div>
          ))}
        </div>
        <SkeletonLine className="mt-4 h-10 w-32" />
      </div>
    </div>
  );
}

export function AnnouncementsSkeleton() {
  return (
    <div data-testid="announcements-skeleton">
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-4">
            <SkeletonLine className="h-5 w-48 mb-2" />
            <SkeletonLine className="h-3 w-full mb-1" />
            <SkeletonLine className="h-3 w-3/4" />
            <SkeletonLine className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
