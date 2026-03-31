"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
  actorName: string;
  actorEmail: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface FilterOptions {
  actions: string[];
  entities: string[];
  actors: { id: string; name: string; email: string }[];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatActionLabel(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseDetails(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}

function DetailValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  if (typeof value === "object") return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}

export default function AuditLogClient() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const [filterActor, setFilterActor] = useState("");

  const fetchLogs = useCallback(
    async (pageNum: number) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      const params = new URLSearchParams({ page: pageNum.toString(), limit: "20" });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (filterAction) params.set("action", filterAction);
      if (filterEntity) params.set("entity", filterEntity);
      if (filterActor) params.set("userId", filterActor);

      try {
        const res = await fetch(`/api/admin/audit-logs?${params}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          setLogs(json.logs);
          setPagination(json.pagination);
          if (json.filters) setFilterOptions(json.filters);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, filterAction, filterEntity, filterActor]
  );

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  function handleApplyFilters() {
    setPage(1);
    setExpandedId(null);
    fetchLogs(1);
  }

  function handleClearFilters() {
    setDateFrom("");
    setDateTo("");
    setFilterAction("");
    setFilterEntity("");
    setFilterActor("");
    setPage(1);
    setExpandedId(null);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    setExpandedId(null);
    fetchLogs(newPage);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleExport(format: "pdf" | "excel") {
    setExporting(format);
    try {
      // Fetch all matching logs (up to 10000)
      const params = new URLSearchParams({ page: "1", limit: "10000" });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (filterAction) params.set("action", filterAction);
      if (filterEntity) params.set("entity", filterEntity);
      if (filterActor) params.set("userId", filterActor);

      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      if (format === "pdf") {
        await exportPDF(data.logs);
      } else {
        await exportExcel(data.logs);
      }
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(null);
    }
  }

  async function exportPDF(allLogs: AuditEntry[]) {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Artilligence", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Exide Battery MLM Platform", pageWidth / 2, 22, { align: "center" });
    doc.text(
      `Audit Log — Generated ${new Date().toLocaleDateString("en-IN")}`,
      pageWidth / 2,
      28,
      { align: "center" }
    );

    const head = ["Date/Time", "Actor", "Action", "Entity", "Entity ID", "Details"];
    const body = allLogs.map((log) => [
      formatDateTime(log.createdAt),
      log.actorName,
      formatActionLabel(log.action),
      log.entity,
      log.entityId || "—",
      log.details ? summarizeDetails(log.details) : "—",
    ]);

    autoTable(doc, {
      head: [head],
      body,
      startY: 35,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        5: { cellWidth: 80 },
      },
      didDrawPage: (hookData) => {
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.text(
          `Page ${hookData.pageNumber} of ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: "center" }
        );
      },
    });

    doc.save("audit-log.pdf");
  }

  async function exportExcel(allLogs: AuditEntry[]) {
    const ExcelJS = await import("exceljs");
    const { saveAs } = await import("file-saver");

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Artilligence";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Audit Log");
    const head = ["Date/Time", "Actor", "Email", "Action", "Entity", "Entity ID", "Details"];

    const headerRow = sheet.addRow(head);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF3B82F6" },
      };
      cell.alignment = { horizontal: "center" };
    });

    for (const log of allLogs) {
      sheet.addRow([
        formatDateTime(log.createdAt),
        log.actorName,
        log.actorEmail,
        formatActionLabel(log.action),
        log.entity,
        log.entityId || "",
        log.details ? summarizeDetails(log.details) : "",
      ]);
    }

    sheet.columns.forEach((col) => {
      let maxLen = 12;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value || "").length;
        if (len > maxLen) maxLen = Math.min(len, 50);
      });
      col.width = maxLen + 2;
    });

    const buf = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "audit-log.xlsx");
  }

  function summarizeDetails(details: string): string {
    try {
      const parsed = JSON.parse(details);
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(", ");
    } catch {
      return details;
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900" data-testid="audit-log-title">
          Audit Log
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            data-testid="export-pdf-btn"
          >
            {exporting === "pdf" ? "Exporting..." : "Export PDF"}
          </button>
          <button
            onClick={() => handleExport("excel")}
            disabled={exporting !== null}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            data-testid="export-excel-btn"
          >
            {exporting === "excel" ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-lg border bg-white p-4 shadow-sm" data-testid="audit-filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="filter-date-from"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="filter-date-to"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Action</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="filter-action"
            >
              <option value="">All Actions</option>
              {filterOptions?.actions.map((a) => (
                <option key={a} value={a}>
                  {formatActionLabel(a)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Entity</label>
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="filter-entity"
            >
              <option value="">All Entities</option>
              {filterOptions?.entities.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Actor</label>
            <select
              value={filterActor}
              onChange={(e) => setFilterActor(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="filter-actor"
            >
              <option value="">All Actors</option>
              {filterOptions?.actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.email})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleApplyFilters}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
            data-testid="apply-filters-btn"
          >
            Apply Filters
          </button>
          <button
            onClick={handleClearFilters}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            data-testid="clear-filters-btn"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Results count */}
      {pagination && (
        <p className="mb-3 text-sm text-gray-500" data-testid="audit-count">
          Showing {logs.length} of {pagination.total} entries
        </p>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12" data-testid="audit-loading">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-gray-500" data-testid="audit-empty">
            No audit log entries found.
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="audit-table">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Date/Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Entity ID</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                const details = parseDetails(log.details);
                return (
                  <tr key={log.id} className="group" data-testid={`audit-row-${log.id}`}>
                    <td colSpan={6} className="p-0">
                      <div
                        className={`flex cursor-pointer items-center border-b transition-colors ${
                          isExpanded ? "bg-blue-50" : "hover:bg-gray-50"
                        }`}
                        onClick={() => toggleExpand(log.id)}
                        data-testid={`audit-row-toggle-${log.id}`}
                      >
                        <div className="px-4 py-3 w-8">
                          <svg
                            className={`h-4 w-4 text-gray-400 transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <div className="px-4 py-3 flex-shrink-0 w-44 text-gray-600">
                          {formatDateTime(log.createdAt)}
                        </div>
                        <div className="px-4 py-3 flex-1 min-w-0">
                          <span className="font-medium text-gray-900">{log.actorName}</span>
                        </div>
                        <div className="px-4 py-3 flex-1 min-w-0">
                          <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800" data-testid={`audit-action-${log.id}`}>
                            {formatActionLabel(log.action)}
                          </span>
                        </div>
                        <div className="px-4 py-3 flex-shrink-0 w-32 text-gray-700" data-testid={`audit-entity-${log.id}`}>
                          {log.entity}
                        </div>
                        <div className="px-4 py-3 flex-shrink-0 w-28 font-mono text-xs text-gray-500">
                          {log.entityId ? log.entityId.substring(0, 8) + "..." : "—"}
                        </div>
                      </div>
                      {/* Expanded details */}
                      {isExpanded && (
                        <div
                          className="border-b bg-gray-50 px-8 py-4"
                          data-testid={`audit-details-${log.id}`}
                        >
                          <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                            Details
                          </h4>
                          {details ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {Object.entries(details).map(([key, value]) => (
                                <div key={key} className="rounded bg-white p-2 border">
                                  <span className="text-xs font-medium text-gray-500">
                                    {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                                  </span>
                                  <div className="mt-0.5 text-sm text-gray-900">
                                    <DetailValue value={value} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No additional details recorded.</p>
                          )}
                          <div className="mt-3 flex gap-4 text-xs text-gray-400">
                            <span>Log ID: {log.id}</span>
                            <span>Actor Email: {log.actorEmail}</span>
                            {log.entityId && <span>Full Entity ID: {log.entityId}</span>}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between" data-testid="audit-pagination">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-gray-50"
              data-testid="pagination-prev"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= pagination.totalPages}
              className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-gray-50"
              data-testid="pagination-next"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
