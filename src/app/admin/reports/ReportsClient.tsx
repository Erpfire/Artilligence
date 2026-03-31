"use client";

import { useState, useCallback, useEffect, useRef } from "react";

type ReportType =
  | "sales"
  | "commissions"
  | "members"
  | "payouts"
  | "top-performers"
  | "tree-overview"
  | "financial-year"
  | "monthly-payout";

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ReportJob {
  id: string;
  type: string;
  format: string;
  status: string;
  progress: number;
  filePath: string | null;
  error: string | null;
  totalRows: number | null;
  createdAt: string;
  completedAt: string | null;
}

const REPORT_TABS: { key: ReportType; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "commissions", label: "Commissions" },
  { key: "members", label: "Members" },
  { key: "payouts", label: "Payouts" },
  { key: "top-performers", label: "Top Performers" },
  { key: "tree-overview", label: "Tree Overview" },
  { key: "financial-year", label: "FY Summary" },
  { key: "monthly-payout", label: "Monthly Payout" },
];

function formatINR(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(num);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ReportsClient() {
  const [activeTab, setActiveTab] = useState<ReportType>("sales");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ReportJob[]>([]);
  const [showJobs, setShowJobs] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMemberId, setFilterMemberId] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [filterMetric, setFilterMetric] = useState("sales");
  const [filterTopN, setFilterTopN] = useState("10");
  const [filterFY, setFilterFY] = useState("");
  const [filterMonth, setFilterMonth] = useState(
    (new Date().getMonth() + 1).toString()
  );
  const [filterYear, setFilterYear] = useState(
    new Date().getFullYear().toString()
  );

  const fetchReport = useCallback(
    async (reportType: ReportType, pageNum: number) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      const params = new URLSearchParams({ type: reportType, page: pageNum.toString(), limit: "20" });

      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      if (reportType === "sales" && filterStatus) params.set("status", filterStatus);
      if ((reportType === "sales" || reportType === "payouts") && filterMemberId)
        params.set("memberId", filterMemberId);
      if (reportType === "commissions" && filterLevel) params.set("level", filterLevel);
      if (reportType === "commissions" && filterMemberId)
        params.set("beneficiaryId", filterMemberId);
      if (reportType === "members" && filterStatus) params.set("status", filterStatus);
      if (reportType === "top-performers") {
        params.set("metric", filterMetric);
        params.set("topN", filterTopN);
      }
      if (reportType === "financial-year" && filterFY) params.set("fy", filterFY);
      if (reportType === "monthly-payout") {
        params.set("month", filterMonth);
        params.set("year", filterYear);
      }

      try {
        const res = await fetch(`/api/admin/reports?${params}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          setData(json);
          if (json.pagination) setPagination(json.pagination);
          else setPagination(null);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, filterStatus, filterMemberId, filterLevel, filterMetric, filterTopN, filterFY, filterMonth, filterYear]
  );

  useEffect(() => {
    setPage(1);
    fetchReport(activeTab, 1);
  }, [activeTab, fetchReport]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchReport(activeTab, newPage);
  }

  function handleApplyFilters() {
    setPage(1);
    fetchReport(activeTab, 1);
  }

  function handleClearFilters() {
    setDateFrom("");
    setDateTo("");
    setFilterStatus("");
    setFilterMemberId("");
    setFilterLevel("");
    setFilterMetric("sales");
    setFilterTopN("10");
    setFilterFY("");
    setFilterMonth((new Date().getMonth() + 1).toString());
    setFilterYear(new Date().getFullYear().toString());
    setPage(1);
    // Will re-fetch via useEffect when deps change
  }

  async function handleExport(format: "pdf" | "excel") {
    setExporting(format);

    // Check if this should be a background job (large dataset)
    if (pagination && pagination.total > 1000) {
      await createBackgroundJob(format);
      setExporting(null);
      return;
    }

    try {
      // Client-side export
      const params = new URLSearchParams({ type: activeTab, page: "1", limit: "10000" });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (filterStatus) params.set("status", filterStatus);
      if (filterMemberId) params.set("memberId", filterMemberId);
      if (filterLevel) params.set("level", filterLevel);

      const res = await fetch(`/api/admin/reports?${params}`);
      if (!res.ok) throw new Error("Failed to fetch report data");
      const reportData = await res.json();

      if (format === "pdf") {
        await exportPDF(activeTab, reportData);
      } else {
        await exportExcel(activeTab, reportData);
      }
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(null);
    }
  }

  async function createBackgroundJob(format: string) {
    const filters: Record<string, string> = {};
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (filterStatus) filters.status = filterStatus;
    if (filterMemberId) filters.memberId = filterMemberId;
    if (filterLevel) filters.level = filterLevel;

    const res = await fetch("/api/admin/reports/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: activeTab, format, filters }),
    });

    if (res.ok) {
      setShowJobs(true);
      pollJobs();
    }
  }

  async function pollJobs() {
    const res = await fetch("/api/admin/reports/jobs");
    if (res.ok) {
      const json = await res.json();
      setJobs(json.jobs);
    }
  }

  async function exportPDF(
    reportType: string,
    reportData: Record<string, unknown>
  ) {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Company header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Artilligence", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Exide Battery MLM Platform", pageWidth / 2, 22, { align: "center" });
    doc.text(
      `${reportType.charAt(0).toUpperCase() + reportType.slice(1).replace("-", " ")} Report — Generated ${new Date().toLocaleDateString("en-IN")}`,
      pageWidth / 2,
      28,
      { align: "center" }
    );

    const { head, body } = getTableData(reportType, reportData);

    autoTable(doc, {
      head: [head],
      body,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      didDrawPage: (hookData) => {
        // Page numbers
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

    // Summary at the end
    const summary = reportData.summary as Record<string, unknown> | undefined;
    if (summary) {
      const finalY = ((doc as unknown as Record<string, Record<string, number>>).lastAutoTable)?.finalY || 35;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      let yPos = finalY + 10;
      for (const [key, val] of Object.entries(summary)) {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
        const value = typeof val === "number" || !isNaN(Number(val)) ? formatINR(val as number) : String(val);
        doc.text(`${label}: ${value}`, 14, yPos);
        yPos += 6;
      }
    }

    doc.save(`${reportType}-report.pdf`);
  }

  async function exportExcel(
    reportType: string,
    reportData: Record<string, unknown>
  ) {
    const ExcelJS = await import("exceljs");
    const { saveAs } = await import("file-saver");

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Artilligence";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(
      reportType.charAt(0).toUpperCase() + reportType.slice(1).replace("-", " ")
    );

    const { head, body } = getTableData(reportType, reportData);

    // Header row
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

    // Data rows
    for (const row of body) {
      const dataRow = sheet.addRow(row);
      dataRow.eachCell((cell, colNumber) => {
        // Format currency columns (detect by header name)
        const headerName = head[colNumber - 1]?.toLowerCase() || "";
        if (
          headerName.includes("amount") ||
          headerName.includes("earned") ||
          headerName.includes("pending") ||
          headerName.includes("paid")
        ) {
          const numVal = parseFloat(String(cell.value));
          if (!isNaN(numVal)) {
            cell.value = numVal;
            cell.numFmt = '₹#,##0.00';
          }
        }
      });
    }

    // Auto-width columns
    sheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value || "").length;
        if (len > maxLen) maxLen = Math.min(len, 40);
      });
      col.width = maxLen + 2;
    });

    // Summary
    const summary = reportData.summary as Record<string, unknown> | undefined;
    if (summary) {
      sheet.addRow([]);
      for (const [key, val] of Object.entries(summary)) {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
        const summaryRow = sheet.addRow([label, val]);
        summaryRow.getCell(1).font = { bold: true };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${reportType}-report.xlsx`);
  }

  function getTableData(
    reportType: string,
    reportData: Record<string, unknown>
  ): { head: string[]; body: (string | number)[][] } {
    const items = (reportData.items || []) as Record<string, unknown>[];

    switch (reportType) {
      case "sales":
        return {
          head: ["Bill Code", "Member", "Customer", "Amount", "Date", "Status", "Products"],
          body: items.map((i) => [
            String(i.billCode),
            String(i.memberName),
            String(i.customerName),
            String(i.totalAmount),
            formatDate(String(i.saleDate)),
            String(i.status),
            String(i.products),
          ]),
        };
      case "commissions":
        return {
          head: ["Beneficiary", "Source", "Bill Code", "Sale Amount", "Level", "%", "Commission", "Type", "Date"],
          body: items.map((i) => [
            String(i.beneficiaryName),
            String(i.sourceMemberName),
            String(i.billCode),
            String(i.saleAmount),
            Number(i.level),
            String(i.percentage),
            String(i.amount),
            String(i.type),
            formatDate(String(i.createdAt)),
          ]),
        };
      case "members":
        return {
          head: ["Name", "Email", "Phone", "Status", "Sponsor", "Sales", "Referrals", "Earned", "Pending", "Paid Out", "Joined"],
          body: items.map((i) => [
            String(i.name),
            String(i.email),
            String(i.phone),
            String(i.status),
            String(i.sponsorName),
            Number(i.totalSales),
            Number(i.directReferrals),
            String(i.totalEarned),
            String(i.pending),
            String(i.paidOut),
            formatDate(String(i.joinedAt)),
          ]),
        };
      case "payouts":
        return {
          head: ["Member", "Email", "Amount", "Description", "Paid By", "Date"],
          body: items.map((i) => [
            String(i.memberName),
            String(i.memberEmail),
            String(i.amount),
            String(i.description || ""),
            String(i.paidBy),
            formatDate(String(i.paidAt)),
          ]),
        };
      case "top-performers":
        return {
          head: ["Rank", "Name", "Email", "Sales Count", "Total Earned"],
          body: items.map((i, idx) => [
            idx + 1,
            String(i.name),
            String(i.email),
            Number(i.salesCount || 0),
            String(i.totalEarned || i.salesAmount || "0"),
          ]),
        };
      case "financial-year":
        return {
          head: ["Name", "Email", "Phone", "Total Earnings", "Commissions Count", "TDS Applicable"],
          body: items.map((i) => [
            String(i.name),
            String(i.email),
            String(i.phone),
            String(i.totalEarnings),
            Number(i.commissionsCount),
            (i.tdsApplicable as boolean) ? "Yes" : "No",
          ]),
        };
      case "monthly-payout":
        return {
          head: ["Member", "Email", "Phone", "Amount", "Description", "Date"],
          body: items.map((i) => [
            String(i.memberName),
            String(i.memberEmail),
            String(i.memberPhone),
            String(i.amount),
            String(i.description || ""),
            formatDate(String(i.paidAt)),
          ]),
        };
      default:
        return { head: [], body: [] };
    }
  }

  const items = data ? ((data.items || []) as Record<string, unknown>[]) : [];

  return (
    <div data-testid="admin-reports-page">
      <h1 className="mb-6 text-2xl font-bold text-gray-900" data-testid="admin-reports-title">
        Reports
      </h1>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1" data-testid="report-tabs">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-primary shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
            data-testid={`report-tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {activeTab !== "tree-overview" && (
        <div className="mb-4 rounded-lg border bg-white p-4" data-testid="report-filters">
          <div className="flex flex-wrap items-end gap-3">
            {/* Date filters for most reports */}
            {["sales", "commissions", "members", "payouts", "top-performers"].includes(activeTab) && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                    data-testid="filter-date-from"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                    data-testid="filter-date-to"
                  />
                </div>
              </>
            )}

            {/* Status filter for sales and members */}
            {(activeTab === "sales" || activeTab === "members") && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="rounded-md border px-2 py-1.5 text-sm"
                  data-testid="filter-status"
                >
                  <option value="">All</option>
                  {activeTab === "sales" ? (
                    <>
                      <option value="PENDING">Pending</option>
                      <option value="APPROVED">Approved</option>
                      <option value="REJECTED">Rejected</option>
                      <option value="RETURNED">Returned</option>
                    </>
                  ) : (
                    <>
                      <option value="ACTIVE">Active</option>
                      <option value="BLOCKED">Blocked</option>
                      <option value="DEACTIVATED">Deactivated</option>
                    </>
                  )}
                </select>
              </div>
            )}

            {/* Member ID filter for sales, commissions, payouts */}
            {["sales", "commissions", "payouts"].includes(activeTab) && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {activeTab === "commissions" ? "Beneficiary ID" : "Member ID"}
                </label>
                <input
                  type="text"
                  value={filterMemberId}
                  onChange={(e) => setFilterMemberId(e.target.value)}
                  placeholder="Enter member ID"
                  className="rounded-md border px-2 py-1.5 text-sm"
                  data-testid="filter-member-id"
                />
              </div>
            )}

            {/* Level filter for commissions */}
            {activeTab === "commissions" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Level</label>
                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  className="rounded-md border px-2 py-1.5 text-sm"
                  data-testid="filter-level"
                >
                  <option value="">All</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((l) => (
                    <option key={l} value={l}>
                      Level {l}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Metric + Top N for top performers */}
            {activeTab === "top-performers" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Metric</label>
                  <select
                    value={filterMetric}
                    onChange={(e) => setFilterMetric(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                    data-testid="filter-metric"
                  >
                    <option value="sales">Sales Count</option>
                    <option value="earnings">Earnings</option>
                    <option value="referrals">Referrals</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Top N</label>
                  <select
                    value={filterTopN}
                    onChange={(e) => setFilterTopN(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                    data-testid="filter-top-n"
                  >
                    <option value="5">Top 5</option>
                    <option value="10">Top 10</option>
                    <option value="20">Top 20</option>
                    <option value="50">Top 50</option>
                  </select>
                </div>
              </>
            )}

            {/* FY filter */}
            {activeTab === "financial-year" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Financial Year</label>
                <select
                  value={filterFY}
                  onChange={(e) => setFilterFY(e.target.value)}
                  className="rounded-md border px-2 py-1.5 text-sm"
                  data-testid="filter-fy"
                >
                  <option value="">Current FY</option>
                  {[2024, 2025, 2026].map((y) => (
                    <option key={y} value={`${y}-${(y + 1) % 100}`}>
                      {y}-{String((y + 1) % 100).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Month/Year for monthly payout */}
            {activeTab === "monthly-payout" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Month</label>
                  <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                    data-testid="filter-month"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2000, i).toLocaleString("en", { month: "long" })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Year</label>
                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                    data-testid="filter-year"
                  >
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <button
              onClick={handleApplyFilters}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
              data-testid="apply-filters-btn"
            >
              Apply
            </button>
            <button
              onClick={handleClearFilters}
              className="rounded-md border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              data-testid="clear-filters-btn"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Export + Jobs buttons */}
      <div className="mb-4 flex items-center gap-2" data-testid="report-actions">
        <button
          onClick={() => handleExport("pdf")}
          disabled={!!exporting || loading || items.length === 0}
          className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          data-testid="export-pdf-btn"
        >
          {exporting === "pdf" ? "Generating PDF..." : "Download PDF"}
        </button>
        <button
          onClick={() => handleExport("excel")}
          disabled={!!exporting || loading || items.length === 0}
          className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          data-testid="export-excel-btn"
        >
          {exporting === "excel" ? "Generating Excel..." : "Download Excel"}
        </button>
        <button
          onClick={() => {
            setShowJobs(!showJobs);
            pollJobs();
          }}
          className="rounded-md border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          data-testid="show-jobs-btn"
        >
          Background Jobs
        </button>
      </div>

      {/* Background Jobs Panel */}
      {showJobs && (
        <div className="mb-4 rounded-lg border bg-white p-4" data-testid="jobs-panel">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Background Report Jobs</h3>
            <button onClick={pollJobs} className="text-xs text-primary hover:underline" data-testid="refresh-jobs-btn">
              Refresh
            </button>
          </div>
          {jobs.length === 0 ? (
            <p className="text-sm text-gray-500" data-testid="no-jobs">No background jobs yet.</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-md border p-3"
                  data-testid={`job-${job.id}`}
                >
                  <div>
                    <span className="text-sm font-medium">{job.type}</span>
                    <span className="ml-2 text-xs text-gray-500">{job.format.toUpperCase()}</span>
                    {job.totalRows !== null && (
                      <span className="ml-2 text-xs text-gray-400">{job.totalRows} rows</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {job.status === "PROCESSING" && (
                      <div className="flex items-center gap-2" data-testid={`job-processing-${job.id}`}>
                        <div className="h-2 w-24 rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full bg-primary transition-all"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">Generating... please wait</span>
                      </div>
                    )}
                    {job.status === "PENDING" && (
                      <span className="text-xs text-yellow-600" data-testid={`job-pending-${job.id}`}>Queued</span>
                    )}
                    {job.status === "COMPLETED" && (
                      <a
                        href={job.filePath || "#"}
                        className="text-xs font-medium text-primary hover:underline"
                        data-testid={`job-download-${job.id}`}
                      >
                        Download Ready
                      </a>
                    )}
                    {job.status === "FAILED" && (
                      <span className="text-xs text-red-600" data-testid={`job-failed-${job.id}`}>
                        Failed: {job.error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Report Content */}
      {loading && items.length === 0 ? (
        <div className="rounded-lg border bg-white p-12 text-center" data-testid="report-loading">
          <p className="text-gray-500">Loading report...</p>
        </div>
      ) : activeTab === "tree-overview" ? (
        <TreeOverviewView data={data} />
      ) : items.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center" data-testid="report-empty">
          <p className="text-gray-500">No data found for the selected filters.</p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          {(data?.summary || data?.fy || data?.monthLabel) && (
            <div className="mb-4 flex flex-wrap gap-4" data-testid="report-summary">
              {data?.summary ? Object.entries(data.summary as Record<string, unknown>).map(([key, val]: [string, unknown]) => (
                <div key={key} className="rounded-lg border bg-white px-4 py-3">
                  <p className="text-xs text-gray-500">
                    {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                  </p>
                  <p className="text-lg font-semibold text-gray-900" data-testid={`summary-${key}`}>
                    {key.toLowerCase().includes("amount") ? formatINR(val as number) : String(val)}
                  </p>
                </div>
              )) : null}
              {activeTab === "financial-year" && data?.fy ? (
                <div className="rounded-lg border bg-white px-4 py-3">
                  <p className="text-xs text-gray-500">Financial Year</p>
                  <p className="text-lg font-semibold text-gray-900" data-testid="summary-fy">{String(data.fy)}</p>
                </div>
              ) : null}
              {activeTab === "monthly-payout" && data?.monthLabel ? (
                <div className="rounded-lg border bg-white px-4 py-3">
                  <p className="text-xs text-gray-500">Period</p>
                  <p className="text-lg font-semibold text-gray-900" data-testid="summary-period">{String(data.monthLabel)}</p>
                </div>
              ) : null}
            </div>
          )}

          {/* Data table */}
          <div className="overflow-x-auto rounded-lg border bg-white" data-testid="report-table">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  {getTableData(activeTab, data!).head.map((h, i) => (
                    <th key={i} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {renderTableRows(activeTab, items)}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between" data-testid="report-pagination">
              <p className="text-sm text-gray-600">
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                  data-testid="report-prev-page"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= pagination.totalPages}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                  data-testid="report-next-page"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function renderTableRows(reportType: string, items: Record<string, unknown>[]) {
  switch (reportType) {
    case "sales":
      return items.map((item, idx) => (
        <tr key={String(item.id)} className={idx % 2 === 1 ? "bg-gray-50" : ""} data-testid={`report-row-${idx}`}>
          <td className="px-4 py-3 font-mono text-xs">{String(item.billCode)}</td>
          <td className="px-4 py-3">{String(item.memberName)}</td>
          <td className="px-4 py-3">{String(item.customerName)}</td>
          <td className="px-4 py-3 font-medium">{formatINR(item.totalAmount as string)}</td>
          <td className="px-4 py-3">{formatDate(item.saleDate as string)}</td>
          <td className="px-4 py-3">
            <StatusBadge status={String(item.status)} />
          </td>
          <td className="px-4 py-3 text-xs text-gray-500">{String(item.products)}</td>
        </tr>
      ));
    case "commissions":
      return items.map((item, idx) => (
        <tr key={String(item.id)} className={idx % 2 === 1 ? "bg-gray-50" : ""} data-testid={`report-row-${idx}`}>
          <td className="px-4 py-3">{String(item.beneficiaryName)}</td>
          <td className="px-4 py-3">{String(item.sourceMemberName)}</td>
          <td className="px-4 py-3 font-mono text-xs">{String(item.billCode)}</td>
          <td className="px-4 py-3">{formatINR(item.saleAmount as string)}</td>
          <td className="px-4 py-3 text-center">{String(item.level)}</td>
          <td className="px-4 py-3 text-center">{String(item.percentage)}%</td>
          <td className="px-4 py-3 font-medium">{formatINR(item.amount as string)}</td>
          <td className="px-4 py-3">
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${item.type === "EARNING" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {String(item.type)}
            </span>
          </td>
          <td className="px-4 py-3">{formatDate(item.createdAt as string)}</td>
        </tr>
      ));
    case "members":
      return items.map((item, idx) => (
        <tr key={String(item.id)} className={idx % 2 === 1 ? "bg-gray-50" : ""} data-testid={`report-row-${idx}`}>
          <td className="px-4 py-3 font-medium">{String(item.name)}</td>
          <td className="px-4 py-3">{String(item.email)}</td>
          <td className="px-4 py-3">{String(item.phone)}</td>
          <td className="px-4 py-3"><StatusBadge status={String(item.status)} /></td>
          <td className="px-4 py-3">{String(item.sponsorName)}</td>
          <td className="px-4 py-3 text-center">{String(item.totalSales)}</td>
          <td className="px-4 py-3 text-center">{String(item.directReferrals)}</td>
          <td className="px-4 py-3">{formatINR(item.totalEarned as string)}</td>
          <td className="px-4 py-3">{formatINR(item.pending as string)}</td>
          <td className="px-4 py-3">{formatINR(item.paidOut as string)}</td>
          <td className="px-4 py-3">{formatDate(item.joinedAt as string)}</td>
        </tr>
      ));
    case "payouts":
      return items.map((item, idx) => (
        <tr key={String(item.id)} className={idx % 2 === 1 ? "bg-gray-50" : ""} data-testid={`report-row-${idx}`}>
          <td className="px-4 py-3 font-medium">{String(item.memberName)}</td>
          <td className="px-4 py-3">{String(item.memberEmail)}</td>
          <td className="px-4 py-3 font-medium">{formatINR(item.amount as string)}</td>
          <td className="px-4 py-3 text-sm text-gray-500">{String(item.description || "")}</td>
          <td className="px-4 py-3">{String(item.paidBy)}</td>
          <td className="px-4 py-3">{formatDate(item.paidAt as string)}</td>
        </tr>
      ));
    case "top-performers":
      return items.map((item, idx) => (
        <tr key={String(item.id)} className={idx % 2 === 1 ? "bg-gray-50" : ""} data-testid={`report-row-${idx}`}>
          <td className="px-4 py-3 text-center font-bold">{idx + 1}</td>
          <td className="px-4 py-3 font-medium">{String(item.name)}</td>
          <td className="px-4 py-3">{String(item.email)}</td>
          <td className="px-4 py-3 text-center">{String(item.salesCount || item.referralCount || 0)}</td>
          <td className="px-4 py-3 font-medium">{formatINR(item.totalEarned as string || item.salesAmount as string || "0")}</td>
        </tr>
      ));
    case "financial-year":
      return items.map((item, idx) => (
        <tr key={String(item.id)} className={idx % 2 === 1 ? "bg-gray-50" : ""} data-testid={`report-row-${idx}`}>
          <td className="px-4 py-3 font-medium">{String(item.name)}</td>
          <td className="px-4 py-3">{String(item.email)}</td>
          <td className="px-4 py-3">{String(item.phone)}</td>
          <td className="px-4 py-3 font-medium">{formatINR(item.totalEarnings as string)}</td>
          <td className="px-4 py-3 text-center">{String(item.commissionsCount)}</td>
          <td className="px-4 py-3">
            {(item.tdsApplicable as boolean) ? (
              <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700" data-testid={`tds-yes-${idx}`}>
                TDS Applicable
              </span>
            ) : (
              <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700" data-testid={`tds-no-${idx}`}>
                No TDS
              </span>
            )}
          </td>
        </tr>
      ));
    case "monthly-payout":
      return items.map((item, idx) => (
        <tr key={String(item.id)} className={idx % 2 === 1 ? "bg-gray-50" : ""} data-testid={`report-row-${idx}`}>
          <td className="px-4 py-3 font-medium">{String(item.memberName)}</td>
          <td className="px-4 py-3">{String(item.memberEmail)}</td>
          <td className="px-4 py-3">{String(item.memberPhone)}</td>
          <td className="px-4 py-3 font-medium">{formatINR(item.amount as string)}</td>
          <td className="px-4 py-3 text-sm text-gray-500">{String(item.description || "")}</td>
          <td className="px-4 py-3">{formatDate(item.paidAt as string)}</td>
        </tr>
      ));
    default:
      return null;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    APPROVED: "bg-green-100 text-green-700",
    PENDING: "bg-yellow-100 text-yellow-700",
    REJECTED: "bg-red-100 text-red-700",
    RETURNED: "bg-purple-100 text-purple-700",
    ACTIVE: "bg-green-100 text-green-700",
    BLOCKED: "bg-red-100 text-red-700",
    DEACTIVATED: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function TreeOverviewView({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return null;

  const depthDist = (data.depthDistribution || []) as { depth: number; count: number }[];
  const topSponsors = (data.topSponsors || []) as {
    name: string;
    email: string;
    referrals: number;
  }[];

  return (
    <div className="space-y-4" data-testid="tree-overview">
      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Total Members</p>
          <p className="text-2xl font-bold" data-testid="tree-total-members">{String(data.totalMembers)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Active Members</p>
          <p className="text-2xl font-bold text-green-600" data-testid="tree-active-members">{String(data.activeMembers)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Blocked Members</p>
          <p className="text-2xl font-bold text-red-600" data-testid="tree-blocked-members">{String(data.blockedMembers)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Max Depth</p>
          <p className="text-2xl font-bold" data-testid="tree-max-depth">{String(data.maxDepth)}</p>
        </div>
      </div>

      {/* Depth distribution */}
      <div className="rounded-lg border bg-white p-4" data-testid="tree-depth-distribution">
        <h3 className="mb-3 font-semibold text-gray-900">Depth Distribution</h3>
        {depthDist.length === 0 ? (
          <p className="text-sm text-gray-500">No data</p>
        ) : (
          <div className="space-y-2">
            {depthDist.map((d) => (
              <div key={d.depth} className="flex items-center gap-3">
                <span className="w-20 text-sm text-gray-600">Level {d.depth}</span>
                <div className="flex-1">
                  <div className="h-6 rounded bg-gray-100">
                    <div
                      className="flex h-6 items-center rounded bg-primary/20 px-2 text-xs font-medium text-primary"
                      style={{
                        width: `${Math.max(5, (d.count / Number(data.totalMembers || 1)) * 100)}%`,
                      }}
                    >
                      {d.count}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top sponsors */}
      <div className="rounded-lg border bg-white p-4" data-testid="tree-top-sponsors">
        <h3 className="mb-3 font-semibold text-gray-900">Top Sponsors</h3>
        {topSponsors.length === 0 ? (
          <p className="text-sm text-gray-500">No sponsors yet</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2 text-center">Direct Referrals</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topSponsors.map((s, i) => (
                <tr key={i} data-testid={`top-sponsor-${i}`}>
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2">{s.email}</td>
                  <td className="px-4 py-2 text-center font-bold">{s.referrals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
