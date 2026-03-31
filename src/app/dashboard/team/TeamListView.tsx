"use client";

import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { TeamSkeleton } from "@/components/Skeleton";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  level: number;
  sponsorName: string;
  salesCount: number;
  joinedAt: string;
}

interface ListResponse {
  members: TeamMember[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function TeamListView() {
  const { t } = useLanguage();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("depth");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const limit = 10;

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort,
        order,
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/dashboard/team/list?${params}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [search, sort, order, page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  function handleSort(field: string) {
    if (sort === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(field);
      setOrder("asc");
    }
    setPage(1);
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function SortIcon({ field }: { field: string }) {
    if (sort !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-primary ml-1">{order === "asc" ? "↑" : "↓"}</span>;
  }

  const statusColor: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    BLOCKED: "bg-gray-200 text-gray-600",
    DEACTIVATED: "bg-red-100 text-red-600",
  };

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder={t("team.searchPlaceholder")}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary sm:max-w-xs"
          data-testid="team-list-search"
        />
      </div>

      {loading ? (
        <TeamSkeleton />
      ) : !data || data.members.length === 0 ? (
        <div className="py-8 text-center text-gray-500" data-testid="team-list-empty">
          {search ? t("team.noSearchResults") : t("team.noMembers")}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto" data-testid="team-list-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th
                    className="pb-2 pr-4 cursor-pointer select-none"
                    onClick={() => handleSort("name")}
                    data-testid="sort-name"
                  >
                    {t("team.colName")}
                    <SortIcon field="name" />
                  </th>
                  <th
                    className="pb-2 pr-4 cursor-pointer select-none"
                    onClick={() => handleSort("depth")}
                    data-testid="sort-level"
                  >
                    {t("team.colLevel")}
                    <SortIcon field="depth" />
                  </th>
                  <th className="pb-2 pr-4">{t("team.colSponsor")}</th>
                  <th className="pb-2 pr-4">{t("team.colSales")}</th>
                  <th
                    className="pb-2 pr-4 cursor-pointer select-none"
                    onClick={() => handleSort("status")}
                    data-testid="sort-status"
                  >
                    {t("team.colStatus")}
                    <SortIcon field="status" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b last:border-0"
                    data-testid={`team-list-row-${m.id}`}
                  >
                    <td className="py-2.5 pr-4">
                      <div className="font-medium text-gray-900">{m.name}</div>
                      <div className="text-xs text-gray-400">{m.email}</div>
                    </td>
                    <td className="py-2.5 pr-4" data-testid={`team-level-${m.id}`}>
                      L{m.level}
                    </td>
                    <td className="py-2.5 pr-4">{m.sponsorName}</td>
                    <td className="py-2.5 pr-4" data-testid={`team-sales-${m.id}`}>
                      {m.salesCount}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusColor[m.status] || "bg-gray-100 text-gray-600"
                        }`}
                        data-testid={`team-status-${m.id}`}
                      >
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout */}
          <div className="sm:hidden space-y-3" data-testid="team-list-cards">
            {data.members.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border bg-white p-3 shadow-sm"
                data-testid={`team-card-${m.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900">{m.name}</span>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      statusColor[m.status] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div>{t("team.colLevel")}: L{m.level}</div>
                  <div>{t("team.colSponsor")}: {m.sponsorName}</div>
                  <div>{t("team.colSales")}: {m.salesCount}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div
              className="mt-4 flex items-center justify-between text-sm"
              data-testid="team-list-pagination"
            >
              <span className="text-gray-500">
                {t("wallet.showing")} {(data.page - 1) * data.limit + 1}-
                {Math.min(data.page * data.limit, data.total)} {t("wallet.of")} {data.total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  data-testid="team-list-prev"
                >
                  {t("wallet.prev")}
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= (data.totalPages || 1)}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  data-testid="team-list-next"
                >
                  {t("wallet.next")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
