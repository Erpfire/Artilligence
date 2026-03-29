"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  depth: number;
  status: string;
  referralCode: string;
  createdAt: string;
  sponsor: { id: string; name: string } | null;
  downlineCount: number;
  _count: { children: number };
}

export default function MembersTable({
  members,
  total,
  page,
  totalPages,
  search,
  status,
  dateFrom,
  dateTo,
  sortBy,
  sortOrder,
}: {
  members: Member[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  sortOrder: string;
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(search);
  const [statusFilter, setStatusFilter] = useState(status);
  const [fromDate, setFromDate] = useState(dateFrom);
  const [toDate, setToDate] = useState(dateTo);

  function buildParams(overrides: Record<string, string> = {}) {
    const params = new URLSearchParams();
    const vals = {
      search: searchInput,
      status: statusFilter,
      dateFrom: fromDate,
      dateTo: toDate,
      sortBy,
      sortOrder,
      ...overrides,
    };
    Object.entries(vals).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return params.toString();
  }

  function applyFilters() {
    router.push(`/admin/members?${buildParams({ page: "" })}`);
  }

  function goToPage(p: number) {
    router.push(`/admin/members?${buildParams({ page: p > 1 ? String(p) : "" })}`);
  }

  function toggleSort(field: string) {
    const newOrder = sortBy === field && sortOrder === "asc" ? "desc" : "asc";
    router.push(`/admin/members?${buildParams({ sortBy: field, sortOrder: newOrder, page: "" })}`);
  }

  function SortIcon({ field }: { field: string }) {
    if (sortBy !== field) return <span className="ml-1 text-gray-300">&uarr;&darr;</span>;
    return <span className="ml-1">{sortOrder === "asc" ? "\u2191" : "\u2193"}</span>;
  }

  const statusColor: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    BLOCKED: "bg-red-100 text-red-800",
    DEACTIVATED: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="mt-6">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end mb-4">
        <form
          onSubmit={(e) => { e.preventDefault(); applyFilters(); }}
          className="flex gap-2 flex-1"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, email, phone..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            data-testid="search-input"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            data-testid="search-button"
          >
            Search
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          data-testid="status-filter"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="BLOCKED">Blocked</option>
          <option value="DEACTIVATED">Deactivated</option>
        </select>

        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          data-testid="date-from"
          placeholder="From"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          data-testid="date-to"
          placeholder="To"
        />

        <button
          onClick={applyFilters}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
          data-testid="apply-filters"
        >
          Apply
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200" data-testid="members-table">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer select-none"
                onClick={() => toggleSort("name")}
                data-testid="sort-name"
              >
                Name <SortIcon field="name" />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Phone
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Sponsor
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer select-none"
                onClick={() => toggleSort("depth")}
                data-testid="sort-depth"
              >
                Depth <SortIcon field="depth" />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Downline
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer select-none"
                onClick={() => toggleSort("status")}
                data-testid="sort-status"
              >
                Status <SortIcon field="status" />
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer select-none"
                onClick={() => toggleSort("createdAt")}
                data-testid="sort-joined"
              >
                Joined <SortIcon field="createdAt" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {members.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500" data-testid="no-members">
                  No members found
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr
                  key={member.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/admin/members/${member.id}`)}
                  data-testid={`member-row-${member.id}`}
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {member.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {member.email}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {member.phone}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {member.sponsor ? member.sponsor.name : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {member.depth}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500" data-testid={`downline-${member.id}`}>
                    {member.downlineCount}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[member.status] || ""}`}
                      data-testid={`member-status-${member.id}`}
                    >
                      {member.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(member.createdAt).toLocaleDateString("en-IN")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between" data-testid="pagination">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * 10 + 1}&ndash;{Math.min(page * 10, total)} of{" "}
            {total} members
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              data-testid="prev-page"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => goToPage(p)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  p === page ? "bg-primary text-white border-primary" : "hover:bg-gray-50"
                }`}
                data-testid={`page-${p}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              data-testid="next-page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
