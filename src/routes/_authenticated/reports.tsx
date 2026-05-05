import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, TrendingUp, AlertTriangle, Receipt } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { BillStatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type BillRow = {
  id: string;
  billing_year: number;
  amount: number;
  status: "pending" | "partial" | "paid" | "overdue";
  due_date: string;
  lands:
    | {
        land_code: string;
        plot_number: string | null;
        landowners: { full_name: string } | null;
      }
    | null;
};

type PaymentRow = {
  id: string;
  amount: number;
  paid_at: string;
  bills: { billing_year: number } | null;
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

function ReportsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<string>(String(currentYear));

  const billsQ = useQuery({
    queryKey: ["report-bills", year],
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
      [
        "Land code",
        "Plot",
        "Owner",
        "Year",
        "Amount (GHS)",
        "Status",
        "Due date",
      ],
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
    summary.billed > 0
      ? Math.round((summary.collected / summary.billed) * 100)
      : 0;

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
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
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
          <CardTitle className="text-base">
            Collection rate · {year}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {summary.count} bills issued for the year
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(collectionRate, 100)}%` }}
              />
            </div>
            <span className="w-14 text-right text-sm font-medium">
              {collectionRate}%
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Collections by billing year
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byYear.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payments recorded yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {(() => {
                  const max = Math.max(...byYear.map(([, v]) => v), 1);
                  return byYear.map(([y, v]) => (
                    <li key={y}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{y}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(v)}
                        </span>
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
              <p className="text-sm text-muted-foreground">
                Largest unpaid balances for {year}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={exportDefaulters}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </CardHeader>
          <CardContent>
            {defaulters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No outstanding bills. 🎉
              </p>
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
                    <tr
                      key={`${d.owner}-${d.land_code}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 font-medium">{d.owner}</td>
                      <td className="py-2 text-muted-foreground">
                        {d.land_code}
                      </td>
                      <td className="py-2 text-right">{d.count}</td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(d.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Bills · {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {billsQ.isLoading ? (
            <TableSkeleton columns={5} rows={6} />
          ) : (billsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bills issued for {year}.
            </p>
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
                  {(billsQ.data ?? []).map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        {b.lands?.land_code ?? "—"}
                      </td>
                      <td className="py-2">
                        {b.lands?.landowners?.full_name ?? "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {formatDate(b.due_date)}
                      </td>
                      <td className="py-2">
                        <BillStatusBadge status={b.status} />
                      </td>
                      <td className="py-2 text-right">
                        {formatCurrency(b.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
