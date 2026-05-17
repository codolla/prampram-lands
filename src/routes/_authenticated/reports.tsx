import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableSkeleton } from "@/components/skeletons";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, TrendingUp, AlertTriangle, Receipt, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { BillStatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type BillRow = {
  id: string;
  billing_year: number;
  amount: number;
  status: "pending" | "partial" | "paid" | "overdue";
  due_date: string;
  lands: {
    land_code: string;
    plot_number: string | null;
    landowners: { full_name: string } | null;
  } | null;
};

type PaymentRow = {
  id: string;
  amount: number;
  paid_at: string;
  bills: { billing_year: number } | null;
};

type ReportPaymentRow = {
  id: string;
  amount: number;
  paid_at: string;
  receipt_number: string;
  reference: string | null;
  kind: string;
  lands: {
    land_code: string;
    plot_number: string | null;
    family: string | null;
    owner: string | null;
  };
};

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const MODERN_EXPORT_CSS = `
html, body {
  background: #ffffff !important;
  color: #0b1220 !important;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

.pdf-page {
  width: 100%;
  background: #ffffff !important;
  color: #0b1220 !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 14px !important;
  overflow: hidden !important;
}

.pdf-header {
  padding: 18px 22px !important;
  border-bottom: 1px solid #e5e7eb !important;
  background: linear-gradient(135deg, #0b1220 0%, #111827 55%, #0b1220 100%) !important;
  color: #ffffff !important;
}

.pdf-header-top {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 16px !important;
}

.pdf-brand {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  min-width: 0 !important;
}

.pdf-logo {
  width: 42px !important;
  height: 42px !important;
  border-radius: 10px !important;
  background: rgba(255, 255, 255, 0.95) !important;
  padding: 6px !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
}

.pdf-title {
  font-size: 18px !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
  letter-spacing: -0.01em !important;
  margin: 0 !important;
}

.pdf-subtitle {
  margin-top: 4px !important;
  font-size: 12px !important;
  color: rgba(255, 255, 255, 0.76) !important;
}

.pdf-meta {
  font-size: 12px !important;
  color: rgba(255, 255, 255, 0.76) !important;
  text-align: right !important;
  white-space: nowrap !important;
}

.pdf-body {
  padding: 18px 22px 22px !important;
}

.pdf-section-title {
  font-size: 12px !important;
  text-transform: uppercase !important;
  letter-spacing: 0.12em !important;
  color: #475569 !important;
  margin: 0 0 10px 0 !important;
}

.pdf-metrics {
  display: grid !important;
  grid-template-columns: 1fr 1fr 1fr !important;
  gap: 10px !important;
  margin-bottom: 16px !important;
}

.pdf-metric {
  border: 1px solid #e5e7eb !important;
  border-radius: 12px !important;
  padding: 12px 12px !important;
  background: #ffffff !important;
}

.pdf-metric-label {
  font-size: 11px !important;
  color: #64748b !important;
}

.pdf-metric-value {
  margin-top: 6px !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
}

.pdf-total-card {
  border: 1px solid #e5e7eb !important;
  border-radius: 14px !important;
  padding: 14px 14px !important;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%) !important;
  margin-bottom: 16px !important;
}

.pdf-total-row {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 12px !important;
}

.pdf-total-big {
  font-size: 22px !important;
  font-weight: 800 !important;
  letter-spacing: -0.02em !important;
}

.pdf-table {
  width: 100% !important;
  border-collapse: collapse !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 12px !important;
  overflow: hidden !important;
}

.pdf-table th {
  background: #f1f5f9 !important;
  color: #334155 !important;
  font-size: 10.5px !important;
  text-transform: uppercase !important;
  letter-spacing: 0.12em !important;
  padding: 10px 10px !important;
  border-bottom: 1px solid #e5e7eb !important;
  text-align: left !important;
  vertical-align: top !important;
}

.pdf-table td {
  padding: 10px 10px !important;
  font-size: 12px !important;
  border-bottom: 1px solid #e5e7eb !important;
  vertical-align: top !important;
}

.pdf-table tr:nth-child(even) td {
  background: #fbfdff !important;
}

.pdf-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace !important;
  font-size: 11px !important;
}

.pdf-right {
  text-align: right !important;
}

[data-export-root="true"] svg,
[data-export-root="true"] svg * {
  color: currentColor !important;
  stroke: currentColor !important;
  fill: currentColor !important;
}
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createPdfContainer(innerHtml: string): HTMLDivElement {
  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.left = "-10000px";
  root.style.top = "0";
  root.style.width = "980px";
  root.style.background = "#ffffff";
  root.style.padding = "0";
  root.innerHTML = innerHtml;
  return root;
}

async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
}

async function downloadElementPdf(
  element: HTMLElement,
  filename: string,
  cssText = MODERN_EXPORT_CSS,
) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const prev = element.getAttribute("data-export-root");
  element.setAttribute("data-export-root", "true");
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      onclone: (doc) => {
        for (const n of Array.from(doc.querySelectorAll('style, link[rel="stylesheet"]'))) {
          n.parentNode?.removeChild(n);
        }

        const style = doc.createElement("style");
        style.textContent = cssText;
        doc.head.appendChild(style);
      },
    });
  } finally {
    if (prev == null) element.removeAttribute("data-export-root");
    else element.setAttribute("data-export-root", prev);
  }
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * contentWidth) / canvas.width;

  pdf.addImage(imgData, "PNG", margin, margin, contentWidth, imgHeight);

  let rendered = pageHeight - margin * 2;
  while (rendered < imgHeight - 1) {
    pdf.addPage();
    const y = margin - rendered;
    pdf.addImage(imgData, "PNG", margin, y, contentWidth, imgHeight);
    rendered += pageHeight - margin * 2;
  }
  pdf.save(filename);
}

function printElement(element: HTMLElement) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) {
    toast.error("Popup blocked. Allow popups to print.");
    return;
  }
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Print</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #0a0a0a; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; font-size: 12px; text-align: left; vertical-align: top; }
      th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #4b5563; }
      .muted { color: #6b7280; }
      .right { text-align: right; }
    </style>
  </head>
  <body>${element.outerHTML}</body>
</html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 250);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildFamilyStatementPdfElement(opts: {
  familyLabel: string;
  periodLabel: string;
  from: string;
  to: string;
  total: number;
  contractor: number;
  committee: number;
  family: number;
  rows: ReportPaymentRow[];
}) {
  const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  const rowsHtml =
    opts.rows.length === 0
      ? `<tr><td colspan="5">No payments recorded in this period.</td></tr>`
      : opts.rows
          .map((r) => {
            const account = `${r.lands.land_code}${
              r.lands.plot_number ? ` · Plot ${r.lands.plot_number}` : ""
            }`;
            return `<tr>
              <td>${escapeHtml(formatDate(r.paid_at))}</td>
              <td>${escapeHtml(account)}</td>
              <td>${escapeHtml(r.lands.owner ?? "—")}</td>
              <td class="pdf-mono">${escapeHtml(r.receipt_number)}</td>
              <td class="pdf-right">${escapeHtml(formatCurrency(r.amount))}</td>
            </tr>`;
          })
          .join("");

  return createPdfContainer(`
    <div class="pdf-page">
      <div class="pdf-header">
        <div class="pdf-header-top">
          <div class="pdf-brand">
            <img class="pdf-logo" src="${logoUrl}" crossorigin="anonymous" />
            <div style="min-width:0;">
              <div class="pdf-title">Family Statement</div>
              <div class="pdf-subtitle">Prampram Customary Lands Secretariat</div>
            </div>
          </div>
          <div class="pdf-meta">
            <div>${escapeHtml(opts.periodLabel)}</div>
            <div>Generated ${escapeHtml(generatedAt)}</div>
          </div>
        </div>
      </div>

      <div class="pdf-body">
        <div class="pdf-total-card">
          <div class="pdf-total-row">
            <div style="min-width:0;">
              <div class="pdf-section-title" style="margin:0 0 6px 0;">Family</div>
              <div style="font-size:18px; font-weight:800; letter-spacing:-0.02em;">
                ${escapeHtml(opts.familyLabel)}
              </div>
              <div style="margin-top:4px; font-size:12px; color:#64748b;">
                Period: ${escapeHtml(opts.from)} → ${escapeHtml(opts.to)}
              </div>
            </div>
            <div style="text-align:right;">
              <div class="pdf-section-title" style="margin:0 0 6px 0;">Total collected</div>
              <div class="pdf-total-big">${escapeHtml(formatCurrency(opts.total))}</div>
            </div>
          </div>
        </div>

        <div class="pdf-metrics">
          <div class="pdf-metric">
            <div class="pdf-metric-label">Revenue contractor (30%)</div>
            <div class="pdf-metric-value">${escapeHtml(formatCurrency(opts.contractor))}</div>
          </div>
          <div class="pdf-metric">
            <div class="pdf-metric-label">Land management committee (20%)</div>
            <div class="pdf-metric-value">${escapeHtml(formatCurrency(opts.committee))}</div>
          </div>
          <div class="pdf-metric">
            <div class="pdf-metric-label">Family (50%)</div>
            <div class="pdf-metric-value">${escapeHtml(formatCurrency(opts.family))}</div>
          </div>
        </div>

        <div class="pdf-section-title">Collections</div>
        <table class="pdf-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Account</th>
              <th>Name</th>
              <th>Receipt</th>
              <th class="pdf-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `);
}

function buildLmcReportPdfElement(opts: {
  label: string;
  from: string;
  to: string;
  total: number;
  contractor: number;
  committee: number;
  family: number;
  rows: ReportPaymentRow[];
}) {
  const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  const rowsHtml =
    opts.rows.length === 0
      ? `<tr><td colspan="4">No payments recorded in this period.</td></tr>`
      : opts.rows
          .map((r) => {
            return `<tr>
              <td>${escapeHtml(r.lands.land_code)}</td>
              <td>${escapeHtml(r.lands.owner ?? "—")}</td>
              <td class="pdf-right">${escapeHtml(formatCurrency(r.amount))}</td>
              <td>${escapeHtml(formatDate(r.paid_at))}</td>
            </tr>`;
          })
          .join("");

  return createPdfContainer(`
    <div class="pdf-page">
      <div class="pdf-header">
        <div class="pdf-header-top">
          <div class="pdf-brand">
            <img class="pdf-logo" src="${logoUrl}" crossorigin="anonymous" />
            <div style="min-width:0;">
              <div class="pdf-title">Land Management Committee Report</div>
              <div class="pdf-subtitle">Prampram Customary Lands Secretariat</div>
            </div>
          </div>
          <div class="pdf-meta">
            <div>${escapeHtml(opts.label)}</div>
            <div>Generated ${escapeHtml(generatedAt)}</div>
          </div>
        </div>
      </div>

      <div class="pdf-body">
        <div class="pdf-total-card">
          <div class="pdf-total-row">
            <div style="min-width:0;">
              <div class="pdf-section-title" style="margin:0 0 6px 0;">Period</div>
              <div style="font-size:16px; font-weight:800; letter-spacing:-0.02em;">
                ${escapeHtml(opts.from)} → ${escapeHtml(opts.to)}
              </div>
              <div style="margin-top:4px; font-size:12px; color:#64748b;">
                ${escapeHtml(String(opts.rows.length))} payments
              </div>
            </div>
            <div style="text-align:right;">
              <div class="pdf-section-title" style="margin:0 0 6px 0;">Total collected</div>
              <div class="pdf-total-big">${escapeHtml(formatCurrency(opts.total))}</div>
            </div>
          </div>
        </div>

        <div class="pdf-metrics">
          <div class="pdf-metric">
            <div class="pdf-metric-label">Revenue contractor (30%)</div>
            <div class="pdf-metric-value">${escapeHtml(formatCurrency(opts.contractor))}</div>
          </div>
          <div class="pdf-metric">
            <div class="pdf-metric-label">Land management committee (20%)</div>
            <div class="pdf-metric-value">${escapeHtml(formatCurrency(opts.committee))}</div>
          </div>
          <div class="pdf-metric">
            <div class="pdf-metric-label">Family (50%)</div>
            <div class="pdf-metric-value">${escapeHtml(formatCurrency(opts.family))}</div>
          </div>
        </div>

        <div class="pdf-section-title">Collections</div>
        <table class="pdf-table">
          <thead>
            <tr>
              <th>Account #</th>
              <th>Name</th>
              <th class="pdf-right">Amount</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `);
}

function ReportsPage() {
  const { hasAnyRole } = useAuth();
  const canSeeReports = hasAnyRole(["admin", "developer", "manager"]);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<string>(String(currentYear));
  const now = new Date();

  const BILL_PAGE_SIZES = [10, 25, 50] as const;
  const LMC_PAGE_SIZES = [10, 25, 50] as const;

  const familiesQ = useQuery<string[]>({
    queryKey: ["report-families"],
    enabled: canSeeReports,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lands")
        .select("family")
        .not("family", "is", null);
      if (error) throw error;
      return Array.from(
        new Set((data ?? []).map((r) => String((r as { family?: string | null }).family ?? ""))),
      )
        .map((s) => s.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    },
  });

  const familyOptions = useMemo(
    () => [
      ...(familiesQ.data ?? []).map((f) => ({ value: f, label: f })),
      { value: "__other__", label: "Other / Unspecified" },
    ],
    [familiesQ.data],
  );

  const [statementFamily, setStatementFamily] = useState<string>("__other__");
  const [statementMode, setStatementMode] = useState<"monthly" | "yearly" | "custom">("monthly");
  const [statementYear, setStatementYear] = useState<number>(now.getFullYear());
  const [statementMonth, setStatementMonth] = useState<number>(now.getMonth() + 1);
  const [statementFrom, setStatementFrom] = useState<string>(new Date().toISOString().slice(0, 10));
  const [statementTo, setStatementTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const statementRef = useRef<HTMLDivElement>(null);
  const [statementPdfBusy, setStatementPdfBusy] = useState(false);

  useEffect(() => {
    if (statementFamily !== "__other__") return;
    const fams = familiesQ.data ?? [];
    if (fams.length > 0) setStatementFamily(fams[0] ?? "__other__");
  }, [familiesQ.data, statementFamily]);

  const statementRange = useMemo(() => {
    if (statementMode === "yearly") {
      const from = `${statementYear}-01-01`;
      const to = `${statementYear}-12-31`;
      return { from, to, label: `${statementYear}` };
    }
    if (statementMode === "monthly") {
      const fromDate = new Date(Date.UTC(statementYear, statementMonth - 1, 1));
      const toDate = new Date(Date.UTC(statementYear, statementMonth, 0));
      const from = fromDate.toISOString().slice(0, 10);
      const to = toDate.toISOString().slice(0, 10);
      return { from, to, label: `${MONTHS[statementMonth - 1]} ${statementYear}` };
    }
    return { from: statementFrom, to: statementTo, label: `${statementFrom} to ${statementTo}` };
  }, [statementFrom, statementMode, statementMonth, statementTo, statementYear]);

  const statementPaymentsQ = useQuery<ReportPaymentRow[]>({
    queryKey: [
      "family-statement-payments",
      statementFamily,
      statementRange.from,
      statementRange.to,
    ],
    enabled: canSeeReports,
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select(
          "id, amount, paid_at, receipt_number, reference, kind, lands:land_id!inner(land_code, plot_number, family, owner:current_owner_id(full_name))",
        )
        .in("kind", ["bill", "advance_deposit"])
        .gte("paid_at", statementRange.from)
        .lte("paid_at", statementRange.to)
        .order("paid_at", { ascending: true });

      if (statementFamily === "__other__") {
        q = q.or("family.is.null,family.eq.", { foreignTable: "lands" } as never);
      } else {
        q = q.eq("lands.family", statementFamily);
      }

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        amount: number;
        paid_at: string;
        receipt_number: string;
        reference: string | null;
        kind: string;
        lands: {
          land_code: string;
          plot_number: string | null;
          family: string | null;
          owner: { full_name: string } | null;
        };
      }>;
      return rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount ?? 0),
        paid_at: r.paid_at,
        receipt_number: r.receipt_number,
        reference: r.reference,
        kind: r.kind,
        lands: {
          land_code: r.lands?.land_code ?? "—",
          plot_number: r.lands?.plot_number ?? null,
          family: r.lands?.family ?? null,
          owner: r.lands?.owner?.full_name ?? null,
        },
      }));
    },
  });

  const statementTotals = useMemo(() => {
    const total = (statementPaymentsQ.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const contractor = Math.round(total * 0.3 * 100) / 100;
    const committee = Math.round(total * 0.2 * 100) / 100;
    const family = Math.round(total * 0.5 * 100) / 100;
    return { total, contractor, committee, family };
  }, [statementPaymentsQ.data]);

  const [lmcMode, setLmcMode] = useState<"monthly" | "yearly">("monthly");
  const [lmcYear, setLmcYear] = useState<number>(now.getFullYear());
  const [lmcMonth, setLmcMonth] = useState<number>(now.getMonth() + 1);
  const lmcRef = useRef<HTMLDivElement>(null);
  const [lmcPdfBusy, setLmcPdfBusy] = useState(false);
  const [lmcPageSize, setLmcPageSize] = useState<number>(25);
  const [lmcPage, setLmcPage] = useState<number>(1);
  const lmcRange = useMemo(() => {
    if (lmcMode === "yearly") {
      const from = `${lmcYear}-01-01`;
      const to = `${lmcYear}-12-31`;
      return { from, to, label: `${lmcYear}` };
    }
    const fromDate = new Date(Date.UTC(lmcYear, lmcMonth - 1, 1));
    const toDate = new Date(Date.UTC(lmcYear, lmcMonth, 0));
    const from = fromDate.toISOString().slice(0, 10);
    const to = toDate.toISOString().slice(0, 10);
    return { from, to, label: `${MONTHS[lmcMonth - 1]} ${lmcYear}` };
  }, [lmcMode, lmcMonth, lmcYear]);

  const lmcPaymentsQ = useQuery<ReportPaymentRow[]>({
    queryKey: ["lmc-report-payments", lmcMode, lmcRange.from, lmcRange.to],
    enabled: canSeeReports,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, amount, paid_at, receipt_number, reference, kind, lands:land_id!inner(land_code, plot_number, family, owner:current_owner_id(full_name))",
        )
        .in("kind", ["bill", "advance_deposit"])
        .gte("paid_at", lmcRange.from)
        .lte("paid_at", lmcRange.to)
        .order("paid_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        amount: number;
        paid_at: string;
        receipt_number: string;
        reference: string | null;
        kind: string;
        lands: {
          land_code: string;
          plot_number: string | null;
          family: string | null;
          owner: { full_name: string } | null;
        };
      }>;
      return rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount ?? 0),
        paid_at: r.paid_at,
        receipt_number: r.receipt_number,
        reference: r.reference,
        kind: r.kind,
        lands: {
          land_code: r.lands?.land_code ?? "—",
          plot_number: r.lands?.plot_number ?? null,
          family: r.lands?.family ?? null,
          owner: r.lands?.owner?.full_name ?? null,
        },
      }));
    },
  });

  const lmcTotal = useMemo(
    () => (lmcPaymentsQ.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0),
    [lmcPaymentsQ.data],
  );

  const lmcTotals = useMemo(() => {
    const total = lmcTotal;
    const contractor = Math.round(total * 0.3 * 100) / 100;
    const committee = Math.round(total * 0.2 * 100) / 100;
    const family = Math.round(total * 0.5 * 100) / 100;
    return { total, contractor, committee, family };
  }, [lmcTotal]);

  useEffect(() => {
    setLmcPage(1);
  }, [lmcMode, lmcYear, lmcMonth, lmcPageSize]);

  const lmcPaged = useMemo(() => {
    const rows = lmcPaymentsQ.data ?? [];
    const total = rows.length;
    const pageSize = Math.max(1, Math.floor(lmcPageSize));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, lmcPage), totalPages);
    const start = (page - 1) * pageSize;
    const end = Math.min(total, start + pageSize);
    return {
      total,
      page,
      pageSize,
      totalPages,
      start,
      end,
      rows: rows.slice(start, end),
    };
  }, [lmcPage, lmcPageSize, lmcPaymentsQ.data]);

  const billsQ = useQuery({
    queryKey: ["report-bills", year],
    enabled: canSeeReports,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select(
          "id, billing_year, amount, status, due_date, lands(land_code, plot_number, landowners(full_name))",
        )
        .eq("billing_year", Number(year));
      if (error) throw error;
      return (data ?? []) as unknown as BillRow[];
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["report-payments"],
    enabled: canSeeReports,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, paid_at, bills(billing_year)")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PaymentRow[];
    },
  });

  const summary = useMemo(() => {
    const bills = billsQ.data ?? [];
    const billed = bills.reduce((s, b) => s + Number(b.amount), 0);
    const outstanding = bills
      .filter((b) => b.status !== "paid")
      .reduce((s, b) => s + Number(b.amount), 0);
    const overdue = bills
      .filter((b) => b.status === "overdue")
      .reduce((s, b) => s + Number(b.amount), 0);
    const collected = (paymentsQ.data ?? [])
      .filter((p) => p.bills?.billing_year === Number(year))
      .reduce((s, p) => s + Number(p.amount), 0);
    return { billed, outstanding, overdue, collected, count: bills.length };
  }, [billsQ.data, paymentsQ.data, year]);

  const [billsPageSize, setBillsPageSize] = useState<number>(25);
  const [billsPage, setBillsPage] = useState<number>(1);

  useEffect(() => {
    setBillsPage(1);
  }, [year, billsPageSize]);

  const billsPaged = useMemo(() => {
    const rows = billsQ.data ?? [];
    const total = rows.length;
    const pageSize = Math.max(1, Math.floor(billsPageSize));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, billsPage), totalPages);
    const start = (page - 1) * pageSize;
    const end = Math.min(total, start + pageSize);
    return {
      total,
      page,
      pageSize,
      totalPages,
      start,
      end,
      rows: rows.slice(start, end),
    };
  }, [billsPage, billsPageSize, billsQ.data]);

  const byYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of paymentsQ.data ?? []) {
      const y = p.bills?.billing_year ?? new Date(p.paid_at).getFullYear();
      map.set(y, (map.get(y) ?? 0) + Number(p.amount));
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]).slice(0, 6);
  }, [paymentsQ.data]);

  const defaulters = useMemo(() => {
    const bills = (billsQ.data ?? []).filter((b) => b.status !== "paid");
    const map = new Map<
      string,
      { owner: string; land_code: string; total: number; count: number }
    >();
    for (const b of bills) {
      const owner = b.lands?.landowners?.full_name ?? "Unassigned";
      const code = b.lands?.land_code ?? "—";
      const key = `${owner}|${code}`;
      const cur = map.get(key) ?? { owner, land_code: code, total: 0, count: 0 };
      cur.total += Number(b.amount);
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [billsQ.data]);

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const exportBills = () => {
    const rows: (string | number)[][] = [
      ["Land code", "Plot", "Owner", "Year", "Amount (GHS)", "Status", "Due date"],
    ];
    for (const b of billsQ.data ?? []) {
      rows.push([
        b.lands?.land_code ?? "",
        b.lands?.plot_number ?? "",
        b.lands?.landowners?.full_name ?? "",
        b.billing_year,
        Number(b.amount).toFixed(2),
        b.status,
        b.due_date,
      ]);
    }
    downloadCsv(`bills-${year}.csv`, rows);
  };

  const exportDefaulters = () => {
    const rows: (string | number)[][] = [
      ["Owner", "Land code", "Outstanding bills", "Outstanding (GHS)"],
    ];
    for (const d of defaulters) {
      rows.push([d.owner, d.land_code, d.count, d.total.toFixed(2)]);
    }
    downloadCsv(`top-defaulters-${year}.csv`, rows);
  };

  const cards = [
    {
      label: "Billed",
      value: formatCurrency(summary.billed),
      icon: Receipt,
      tone: "text-primary",
    },
    {
      label: "Collected",
      value: formatCurrency(summary.collected),
      icon: TrendingUp,
      tone: "text-emerald-600",
    },
    {
      label: "Outstanding",
      value: formatCurrency(summary.outstanding),
      icon: AlertTriangle,
      tone: "text-accent",
    },
    {
      label: "Overdue",
      value: formatCurrency(summary.overdue),
      icon: AlertTriangle,
      tone: "text-destructive",
    },
  ];

  const collectionRate =
    summary.billed > 0 ? Math.round((summary.collected / summary.billed) * 100) : 0;

  if (!canSeeReports) {
    return (
      <AppShell title="Reports">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Access restricted.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Reports"
      actions={
        <div className="flex items-center gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportBills}>
            <Download className="mr-1 h-4 w-4" /> Export bills
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.tone}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Collection rate · {year}</CardTitle>
          <p className="text-sm text-muted-foreground">{summary.count} bills issued for the year</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(collectionRate, 100)}%` }}
              />
            </div>
            <span className="w-14 text-right text-sm font-medium">{collectionRate}%</span>
          </div>
        </CardContent>
      </Card>

      <div className="mt-2 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Family statement</CardTitle>
              <p className="text-sm text-muted-foreground">
                Print/download at any point (monthly, yearly, or custom range)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => statementRef.current && printElement(statementRef.current)}
                disabled={!statementRef.current}
              >
                <Printer className="mr-1 h-4 w-4" /> Print
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  setStatementPdfBusy(true);
                  try {
                    const familyLabel =
                      statementFamily === "__other__" ? "Other / Unspecified" : statementFamily;
                    const exportEl = buildFamilyStatementPdfElement({
                      familyLabel,
                      periodLabel: statementRange.label,
                      from: statementRange.from,
                      to: statementRange.to,
                      total: statementTotals.total,
                      contractor: statementTotals.contractor,
                      committee: statementTotals.committee,
                      family: statementTotals.family,
                      rows: statementPaymentsQ.data ?? [],
                    });
                    document.body.appendChild(exportEl);
                    await waitForImages(exportEl);
                    await downloadElementPdf(
                      exportEl,
                      `family-statement-${statementFamily}-${statementRange.from}-to-${statementRange.to}.pdf`,
                    );
                    exportEl.remove();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
                  } finally {
                    setStatementPdfBusy(false);
                  }
                }}
                disabled={statementPdfBusy}
              >
                <Download className="mr-1 h-4 w-4" />
                {statementPdfBusy ? "Generating…" : "PDF"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Family</Label>
                <SearchableSelect
                  value={statementFamily}
                  onValueChange={setStatementFamily}
                  options={familyOptions}
                  placeholder="Select family…"
                  searchPlaceholder="Search family…"
                />
              </div>
              <div className="space-y-1">
                <Label>Period</Label>
                <Select
                  value={statementMode}
                  onValueChange={(v) => setStatementMode(v as "monthly" | "yearly" | "custom")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Year</Label>
                <Input
                  type="number"
                  value={statementYear}
                  onChange={(e) => setStatementYear(Number(e.target.value || now.getFullYear()))}
                />
              </div>
            </div>
            {statementMode === "monthly" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Month</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-2"
                    value={statementMonth}
                    onChange={(e) => setStatementMonth(Number(e.target.value))}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Date range</Label>
                  <Input value={`${statementRange.from} → ${statementRange.to}`} readOnly />
                </div>
              </div>
            ) : statementMode === "custom" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={statementFrom}
                    onChange={(e) => setStatementFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={statementTo}
                    onChange={(e) => setStatementTo(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div ref={statementRef} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Family statement
                  </div>
                  <div className="mt-1 text-xl font-semibold">
                    {statementFamily === "__other__" ? "Other / Unspecified" : statementFamily}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Period: {statementRange.label}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Total
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">
                    {formatCurrency(statementTotals.total)}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Revenue contractor (30%)</div>
                  <div className="mt-1 font-semibold tabular-nums">
                    {formatCurrency(statementTotals.contractor)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">
                    Land management committee (20%)
                  </div>
                  <div className="mt-1 font-semibold tabular-nums">
                    {formatCurrency(statementTotals.committee)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Family (50%)</div>
                  <div className="mt-1 font-semibold tabular-nums">
                    {formatCurrency(statementTotals.family)}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 text-sm font-semibold">Collections</div>
                {statementPaymentsQ.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (statementPaymentsQ.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments in this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Account</th>
                        <th className="pb-2">Name</th>
                        <th className="pb-2">Receipt</th>
                        <th className="pb-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(statementPaymentsQ.data ?? []).map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-2 text-muted-foreground">{formatDate(p.paid_at)}</td>
                          <td className="py-2 font-medium">
                            {p.lands.land_code}
                            {p.lands.plot_number ? ` · Plot ${p.lands.plot_number}` : ""}
                          </td>
                          <td className="py-2">{p.lands.owner ?? "—"}</td>
                          <td className="py-2 font-mono text-xs">{p.receipt_number}</td>
                          <td className="py-2 text-right font-medium tabular-nums">
                            {formatCurrency(p.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Land management committee report</CardTitle>
              <p className="text-sm text-muted-foreground">
                Monthly or yearly collections (account, name, amount, date)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => lmcRef.current && printElement(lmcRef.current)}
                disabled={!lmcRef.current}
              >
                <Printer className="mr-1 h-4 w-4" /> Print
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  setLmcPdfBusy(true);
                  try {
                    const exportEl = buildLmcReportPdfElement({
                      label: lmcRange.label,
                      from: lmcRange.from,
                      to: lmcRange.to,
                      total: lmcTotals.total,
                      contractor: lmcTotals.contractor,
                      committee: lmcTotals.committee,
                      family: lmcTotals.family,
                      rows: lmcPaymentsQ.data ?? [],
                    });
                    document.body.appendChild(exportEl);
                    await waitForImages(exportEl);
                    await downloadElementPdf(
                      exportEl,
                      `lmc-report-${lmcRange.from}-to-${lmcRange.to}.pdf`,
                    );
                    exportEl.remove();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
                  } finally {
                    setLmcPdfBusy(false);
                  }
                }}
                disabled={lmcPdfBusy}
              >
                <Download className="mr-1 h-4 w-4" />
                {lmcPdfBusy ? "Generating…" : "PDF"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const rows: (string | number)[][] = [
                    ["Account #", "Name", "Amount (GHS)", "Date", "Receipt", "Reference"],
                  ];
                  for (const p of lmcPaymentsQ.data ?? []) {
                    rows.push([
                      p.lands.land_code,
                      p.lands.owner ?? "",
                      Number(p.amount).toFixed(2),
                      p.paid_at,
                      p.receipt_number,
                      p.reference ?? "",
                    ]);
                  }
                  downloadCsv(`lmc-report-${lmcRange.from}-to-${lmcRange.to}.csv`, rows);
                }}
              >
                <Download className="mr-1 h-4 w-4" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Period</Label>
                <Select
                  value={lmcMode}
                  onValueChange={(v) => setLmcMode(v as "monthly" | "yearly")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Year</Label>
                <Input
                  type="number"
                  value={lmcYear}
                  onChange={(e) => setLmcYear(Number(e.target.value || now.getFullYear()))}
                />
              </div>
              <div className="space-y-1">
                <Label>Month</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-2 disabled:opacity-50"
                  value={lmcMonth}
                  onChange={(e) => setLmcMonth(Number(e.target.value))}
                  disabled={lmcMode !== "monthly"}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div ref={lmcRef} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Land management committee report
                  </div>
                  <div className="mt-1 text-lg font-semibold">{lmcRange.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {lmcPaymentsQ.data?.length ?? 0} payments
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Total
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {formatCurrency(lmcTotals.total)}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Revenue contractor (30%)</div>
                  <div className="mt-1 font-semibold tabular-nums">
                    {formatCurrency(lmcTotals.contractor)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">
                    Land management committee (20%)
                  </div>
                  <div className="mt-1 font-semibold tabular-nums">
                    {formatCurrency(lmcTotals.committee)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Family (50%)</div>
                  <div className="mt-1 font-semibold tabular-nums">
                    {formatCurrency(lmcTotals.family)}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                {lmcPaymentsQ.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (lmcPaymentsQ.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments in this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="pb-2">Account #</th>
                        <th className="pb-2">Name</th>
                        <th className="pb-2 text-right">Amount</th>
                        <th className="pb-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lmcPaged.rows.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{p.lands.land_code}</td>
                          <td className="py-2">{p.lands.owner ?? "—"}</td>
                          <td className="py-2 text-right font-medium tabular-nums">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="py-2 text-muted-foreground">{formatDate(p.paid_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {!lmcPaymentsQ.isLoading && (lmcPaymentsQ.data ?? []).length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Showing {lmcPaged.start + 1}–{lmcPaged.end} of {lmcPaged.total}
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(lmcPageSize)}
                    onValueChange={(v) => setLmcPageSize(Number(v))}
                  >
                    <SelectTrigger className="h-9 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LMC_PAGE_SIZES.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} / page
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={lmcPaged.page <= 1}
                    onClick={() => setLmcPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={lmcPaged.page >= lmcPaged.totalPages}
                    onClick={() => setLmcPage((p) => Math.min(lmcPaged.totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Collections by billing year</CardTitle>
          </CardHeader>
          <CardContent>
            {byYear.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {(() => {
                  const max = Math.max(...byYear.map(([, v]) => v), 1);
                  return byYear.map(([y, v]) => (
                    <li key={y}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{y}</span>
                        <span className="text-muted-foreground">{formatCurrency(v)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${(v / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  ));
                })()}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Top defaulters</CardTitle>
              <p className="text-sm text-muted-foreground">Largest unpaid balances for {year}</p>
            </div>
            <Button variant="outline" size="sm" onClick={exportDefaulters}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </CardHeader>
          <CardContent>
            {defaulters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outstanding bills. 🎉</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="pb-2">Owner</th>
                    <th className="pb-2">Land</th>
                    <th className="pb-2 text-right">Bills</th>
                    <th className="pb-2 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {defaulters.map((d) => (
                    <tr key={`${d.owner}-${d.land_code}`} className="border-b last:border-0">
                      <td className="py-2 font-medium">{d.owner}</td>
                      <td className="py-2 text-muted-foreground">{d.land_code}</td>
                      <td className="py-2 text-right">{d.count}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Bills · {year}</CardTitle>
          {!billsQ.isLoading && (billsQ.data ?? []).length > 0 ? (
            <div className="flex items-center gap-2">
              <Select
                value={String(billsPageSize)}
                onValueChange={(v) => setBillsPageSize(Number(v))}
              >
                <SelectTrigger className="h-9 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILL_PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={billsPaged.page <= 1}
                onClick={() => setBillsPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={billsPaged.page >= billsPaged.totalPages}
                onClick={() => setBillsPage((p) => Math.min(billsPaged.totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {billsQ.isLoading ? (
            <TableSkeleton columns={5} rows={6} />
          ) : (billsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills issued for {year}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="pb-2">Land</th>
                    <th className="pb-2">Owner</th>
                    <th className="pb-2">Due</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {billsPaged.rows.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{b.lands?.land_code ?? "—"}</td>
                      <td className="py-2">{b.lands?.landowners?.full_name ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{formatDate(b.due_date)}</td>
                      <td className="py-2">
                        <BillStatusBadge status={b.status} />
                      </td>
                      <td className="py-2 text-right">{formatCurrency(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Showing {billsPaged.start + 1}–{billsPaged.end} of {billsPaged.total}
                </div>
                <div className="text-xs text-muted-foreground">
                  Page {billsPaged.page} of {billsPaged.totalPages}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
